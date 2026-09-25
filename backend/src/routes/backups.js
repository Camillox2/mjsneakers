const express = require('express');
const { pool } = require('../config/db');
const { requireAdmin, requireSuperAdmin } = require('../middleware/auth');
const { auditReq } = require('../controllers/auditController');
const backup = require('../utils/backup');

const router = express.Router();

// Baixar o banco inteiro exige o dono com a verificação em duas etapas ligada.
async function hasTwoFactor(userId) {
  try {
    const [[row]] = await pool.query('SELECT totp_enabled FROM users WHERE id = ?', [userId]);
    return !!(row && row.totp_enabled);
  } catch (_error) {
    return false;
  }
}

router.get('/', ...requireAdmin, (_req, res) => {
  res.json({ status: backup.readStatus(), files: backup.listBackups(), config: backup.backupConfig(), running: backup.isRunning() });
});

router.post('/', ...requireAdmin, async (req, res) => {
  if (backup.isRunning()) return res.status(409).json({ error: 'Já tem um backup rodando. Espere terminar.' });
  try {
    const result = await backup.createBackup({ reason: `manual (${req.user.username})` });
    auditReq(req, 'create', 'backup', null, { file: result.name, size: result.size, remote: result.remote });
    res.status(201).json(result);
  } catch (error) {
    res.status(error.status || 500).json({ error: `O backup falhou: ${error.message}` });
  }
});

router.post('/verify', ...requireAdmin, async (req, res) => {
  try {
    const result = await backup.verifyLatestBackup();
    auditReq(req, 'verify', 'backup', null, result);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/:name/download', ...requireSuperAdmin, async (req, res) => {
  if (!(await hasTwoFactor(req.user.id))) {
    return res.status(403).json({ code: '2fa_required', error: 'Ligue a verificação em duas etapas para baixar backups.' });
  }
  const file = backup.filePathFor(req.params.name);
  if (!file) return res.status(404).json({ error: 'Backup não encontrado' });
  auditReq(req, 'download', 'backup', null, { file: req.params.name });
  res.set('Cache-Control', 'no-store');
  res.download(file, req.params.name);
});

module.exports = router;
