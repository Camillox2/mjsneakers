const crypto = require('crypto');
const { pool } = require('../config/db');
const { notifyAdmins } = require('./notify');
const { storeUrl } = require('./storeUrl');

// Registro de erros do backend e da loja (navegador), agrupados por
// "impressão digital": o mesmo erro vira uma linha com contador. Um erro novo
// (ou que voltou depois de resolvido) avisa a equipe por e-mail, com limite.

const ALERT_EVERY_MS = 15 * 60 * 1000;
const SPIKE_WINDOW_MS = 10 * 60 * 1000;
const SPIKE_LIMIT = 20;

let ready = null;
function ensureTable() {
  if (!ready) {
    ready = pool.query(`CREATE TABLE IF NOT EXISTS app_errors (
      id INT AUTO_INCREMENT PRIMARY KEY,
      fingerprint CHAR(40) NOT NULL UNIQUE,
      source ENUM('backend','frontend') NOT NULL,
      message VARCHAR(500) NOT NULL,
      stack TEXT,
      path VARCHAR(300),
      count INT NOT NULL DEFAULT 1,
      status ENUM('open','resolved') NOT NULL DEFAULT 'open',
      first_seen TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_app_errors_status_last (status, last_seen)
    )`).catch((error) => {
      ready = null;
      throw error;
    });
  }
  return ready;
}

// Nada de dado pessoal ou segredo no registro: e-mail, CPF, token e JWT viram marcadores.
function scrub(text, max) {
  return String(text || '')
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[cpf]')
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[jwt]')
    .replace(/\b[a-f0-9]{32,}\b/gi, '[token]')
    .replace(/(access_token|token|code|secret|password|senha)=[^&\s]+/gi, '$1=[oculto]')
    .slice(0, max);
}

const cleanPath = (p) => scrub(String(p || '').split(/[?#]/)[0], 300);

let lastAlertAt = 0;
let spikeAlertAt = 0;
const recent = [];

function alert(subject, lines) {
  const now = Date.now();
  if (now - lastAlertAt < ALERT_EVERY_MS) return;
  lastAlertAt = now;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  notifyAdmins(() => ({
    subject,
    html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111">
      ${lines.map((l) => `<p style="margin:0 0 8px">${esc(l)}</p>`).join('')}
      <p style="margin:16px 0 0"><a href="${esc(storeUrl())}/admin/saude">Abrir a saúde do sistema no painel</a></p>
    </div>`,
  }));
}

// Nunca lança: registrar erro não pode virar outro erro.
async function recordError({ source = 'backend', message, stack, path }) {
  try {
    await ensureTable();
    const msg = scrub(message || 'Erro sem mensagem', 500);
    const stk = scrub(stack || '', 6000);
    const firstFrame = stk.split('\n').find((l) => /\bat\b/.test(l)) || '';
    const fingerprint = crypto.createHash('sha1').update(`${source}|${msg}|${firstFrame.trim()}`).digest('hex');
    const [result] = await pool.query(
      `INSERT INTO app_errors (fingerprint, source, message, stack, path) VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE count = count + 1, last_seen = CURRENT_TIMESTAMP,
         status = 'open', message = VALUES(message), stack = VALUES(stack), path = VALUES(path)`,
      [fingerprint, source === 'frontend' ? 'frontend' : 'backend', msg, stk, cleanPath(path)]
    );

    // affectedRows 1 = linha nova; 2 = atualizou uma que já existia
    if (result.affectedRows === 1) {
      alert(`Erro novo na loja (${source === 'frontend' ? 'navegador' : 'servidor'})`, [msg, path ? `Onde: ${cleanPath(path)}` : '']);
    }

    const now = Date.now();
    recent.push(now);
    while (recent.length && now - recent[0] > SPIKE_WINDOW_MS) recent.shift();
    if (recent.length >= SPIKE_LIMIT && now - spikeAlertAt > 60 * 60 * 1000) {
      spikeAlertAt = now;
      lastAlertAt = 0; // a rajada sempre avisa
      alert('Muitos erros na loja agora', [`${recent.length} erros nos últimos 10 minutos.`, `Último: ${msg}`]);
    }
  } catch (error) {
    console.error('[Erros] Não deu para registrar:', error.message);
  }
}

// Para o handler de erro do Express: chama recordError sem segurar a resposta.
function captureBackendError(err, req) {
  if (!err || (err.status && err.status < 500) || (err.statusCode && err.statusCode < 500)) return;
  recordError({ source: 'backend', message: err.message, stack: err.stack, path: req && (req.originalUrl || req.path) });
}

// Erros fora das rotas (promessa sem catch, exceção solta).
function installProcessHandlers() {
  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    console.error('[Erros] Promessa rejeitada sem tratamento:', err.message);
    recordError({ source: 'backend', message: `Promessa sem tratamento: ${err.message}`, stack: err.stack, path: 'processo' });
  });
  process.on('uncaughtException', (err) => {
    console.error('[Erros] Exceção sem tratamento:', err);
    // registra e sai: o gerenciador de processo (Docker/PM2) sobe de novo limpo
    recordError({ source: 'backend', message: `Exceção sem tratamento: ${err.message}`, stack: err.stack, path: 'processo' })
      .finally(() => setTimeout(() => process.exit(1), 500));
  });
}

async function listErrors({ status = 'open', page = 1, limit = 30 } = {}) {
  await ensureTable();
  const where = status === 'all' ? '1=1' : 'status = ?';
  const params = status === 'all' ? [] : [status === 'resolved' ? 'resolved' : 'open'];
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM app_errors WHERE ${where}`, params);
  const [rows] = await pool.query(
    `SELECT id, source, message, stack, path, count, status, first_seen, last_seen FROM app_errors WHERE ${where}
     ORDER BY last_seen DESC LIMIT ? OFFSET ?`,
    [...params, limit, (page - 1) * limit]
  );
  return { data: rows, total: Number(total), page, pages: Math.max(1, Math.ceil(Number(total) / limit)) };
}

async function errorStats() {
  await ensureTable();
  const [[row]] = await pool.query(
    `SELECT SUM(status = 'open') AS open_count,
            SUM(last_seen >= NOW() - INTERVAL 1 DAY) AS last_24h,
            MAX(last_seen) AS last_seen
     FROM app_errors`
  );
  return { open_count: Number(row.open_count || 0), last_24h: Number(row.last_24h || 0), last_seen: row.last_seen || null };
}

async function setErrorStatus(id, status) {
  await ensureTable();
  const [result] = await pool.query('UPDATE app_errors SET status = ? WHERE id = ?', [status === 'resolved' ? 'resolved' : 'open', id]);
  return result.affectedRows > 0;
}

module.exports = { recordError, captureBackendError, installProcessHandlers, listErrors, errorStats, setErrorStatus, scrub };
