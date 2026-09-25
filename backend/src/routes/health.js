const express = require('express');
const { pool } = require('../config/db');

const router = express.Router();

// Para monitor de "site no ar" (UptimeRobot, BetterStack e afins): responde
// rápido, sem dado interno. 503 quando o banco não responde em 3 s.
router.get('/', async (_req, res) => {
  const started = Date.now();
  let db = 'ok';
  try {
    await Promise.race([
      pool.query('SELECT 1'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
    ]);
  } catch (_error) {
    db = 'down';
  }
  res.set('Cache-Control', 'no-store');
  res.status(db === 'ok' ? 200 : 503).json({
    ok: db === 'ok',
    db,
    latency_ms: Date.now() - started,
    uptime_s: Math.round(process.uptime()),
  });
});

module.exports = router;
