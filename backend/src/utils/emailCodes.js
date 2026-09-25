const { pool } = require('../config/db');
const { sha256, safeEqual, numericCode } = require('./secrets');
const { verificationCodeEmail } = require('../services/emailService');
const { sendLater } = require('./notify');

// Códigos de 6 dígitos por e-mail (entrar na conta, apagar a conta). Só o
// hash fica no banco; vale 10 min e 5 tentativas; no máximo 3 pedidos a cada
// 15 min por e-mail e finalidade.
const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const MAX_PER_WINDOW = 3;
const WINDOW_MINUTES = 15;

function codeHash(email, purpose, code) {
  return sha256(`${purpose}:${email}:${code}`);
}

// Devolve true se mandou; false se o e-mail já pediu demais (sem revelar nada).
async function issueCode(email, purpose) {
  // Limpeza: código com mais de um dia não serve para nada.
  await pool.query('DELETE FROM customer_login_codes WHERE created_at < DATE_SUB(NOW(), INTERVAL 1 DAY)');
  const [[{ recent }]] = await pool.query(
    `SELECT COUNT(*) AS recent FROM customer_login_codes
     WHERE email = ? AND purpose = ? AND created_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
    [email, purpose, WINDOW_MINUTES]
  );
  if (Number(recent) >= MAX_PER_WINDOW) return false;
  const code = numericCode(6);
  // Um código vivo por vez: os anteriores deixam de valer.
  await pool.query('UPDATE customer_login_codes SET used_at = NOW() WHERE email = ? AND purpose = ? AND used_at IS NULL', [email, purpose]);
  await pool.query(
    `INSERT INTO customer_login_codes (email, purpose, code_hash, expires_at)
     VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
    [email, purpose, codeHash(email, purpose, code), CODE_TTL_MINUTES]
  );
  sendLater(email, () => verificationCodeEmail({ code, purpose }));
  return true;
}

// { ok: true } ou { ok: false, attemptsLeft }.
async function checkCode(email, purpose, code) {
  const clean = String(code || '').replace(/\D/g, '');
  const [rows] = await pool.query(
    `SELECT id, code_hash, attempts FROM customer_login_codes
     WHERE email = ? AND purpose = ? AND used_at IS NULL AND expires_at > NOW()
     ORDER BY id DESC LIMIT 1`,
    [email, purpose]
  );
  const row = rows[0];
  if (!row || row.attempts >= MAX_ATTEMPTS) return { ok: false, attemptsLeft: 0 };
  if (clean.length === 6 && safeEqual(row.code_hash, codeHash(email, purpose, clean))) {
    const [used] = await pool.query('UPDATE customer_login_codes SET used_at = NOW() WHERE id = ? AND used_at IS NULL', [row.id]);
    return used.affectedRows === 1 ? { ok: true } : { ok: false, attemptsLeft: 0 };
  }
  await pool.query('UPDATE customer_login_codes SET attempts = attempts + 1 WHERE id = ?', [row.id]);
  const attemptsLeft = Math.max(MAX_ATTEMPTS - row.attempts - 1, 0);
  if (attemptsLeft === 0) await pool.query('UPDATE customer_login_codes SET used_at = NOW() WHERE id = ?', [row.id]);
  return { ok: false, attemptsLeft };
}

module.exports = { issueCode, checkCode, CODE_TTL_MINUTES, MAX_ATTEMPTS };
