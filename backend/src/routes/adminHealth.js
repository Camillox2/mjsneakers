const express = require('express');
const { pool } = require('../config/db');
const { requireAdmin } = require('../middleware/auth');
const { auditReq } = require('../controllers/auditController');
const { listErrors, errorStats, setErrorStatus } = require('../utils/errorLog');
const backup = require('../utils/backup');

const router = express.Router();
router.use(...requireAdmin);

const has = (v) => typeof v === 'string' && v.trim().length > 0;

// Um retrato de cada peça, sem nenhum segredo: só "está configurado ou não".
router.get('/health', async (_req, res) => {
  const started = Date.now();
  let dbOk = true;
  try { await pool.query('SELECT 1'); } catch (_error) { dbOk = false; }
  const dbLatency = Date.now() - started;

  let twofa = null;
  try {
    const [[row]] = await pool.query(
      "SELECT COUNT(*) AS total, SUM(totp_enabled = 1) AS with2fa FROM users WHERE active = 1 AND role IN ('admin','super_admin')"
    );
    twofa = { admins: Number(row.total || 0), with_2fa: Number(row.with2fa || 0) };
  } catch (_error) {
    twofa = null; // coluna ainda não existe neste banco
  }

  let errors = { open_count: 0, last_24h: 0, last_seen: null };
  try { errors = await errorStats(); } catch (_error) { /* tabela nasce no primeiro erro */ }

  const status = backup.readStatus();
  res.set('Cache-Control', 'no-store');
  res.json({
    api: { ok: true, uptime_s: Math.round(process.uptime()), node: process.version, env: process.env.NODE_ENV || 'development', timezone: process.env.TZ || null },
    db: { ok: dbOk, latency_ms: dbLatency },
    payments: {
      enabled: has(process.env.MP_ACCESS_TOKEN) && has(process.env.MP_PUBLIC_KEY),
      test_mode: String(process.env.MP_ACCESS_TOKEN || '').startsWith('TEST-'),
      webhook_secret: has(process.env.MP_WEBHOOK_SECRET),
    },
    email: { configured: has(process.env.EMAIL_HOST), from: has(process.env.EMAIL_FROM), dkim: has(process.env.DKIM_PRIVATE_KEY) && has(process.env.DKIM_SELECTOR) },
    captcha: { enabled: has(process.env.TURNSTILE_SECRET) && has(process.env.TURNSTILE_SITE_KEY) },
    invoices: { configured: has(process.env.FOCUSNFE_TOKEN), env: process.env.FOCUSNFE_ENV || null },
    security: {
      jwt_secret_strong: String(process.env.JWT_SECRET || '').length >= 32,
      cookie_secure: process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production',
      trust_proxy: has(process.env.TRUST_PROXY),
    },
    twofa,
    backups: {
      ...backup.backupConfig(),
      last_backup_at: status.last_backup_at || null,
      last_size: status.last_size || null,
      last_error: status.last_error || null,
      last_error_at: status.last_error_at || null,
      last_remote_ok: status.last_remote_ok ?? null,
      last_verify_at: status.last_verify_at || null,
      last_verify_ok: status.last_verify_ok ?? null,
      last_verify_detail: status.last_verify_detail || null,
    },
    errors,
  });
});

router.get('/errors', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30));
  const status = ['open', 'resolved', 'all'].includes(req.query.status) ? req.query.status : 'open';
  try {
    res.json(await listErrors({ status, page, limit }));
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar os erros registrados' });
  }
});

router.put('/errors/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!(id > 0)) return res.status(400).json({ error: 'id inválido' });
  const status = req.body?.status === 'open' ? 'open' : 'resolved';
  try {
    if (!(await setErrorStatus(id, status))) return res.status(404).json({ error: 'Erro não encontrado' });
    auditReq(req, status === 'resolved' ? 'resolve' : 'reopen', 'app_error', id, {});
    res.json({ message: status === 'resolved' ? 'Marcado como resolvido' : 'Reaberto' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar' });
  }
});

module.exports = router;
