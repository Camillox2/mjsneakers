// Testa o backup mais novo: restaura num banco temporário, confere as linhas
// e apaga o banco de teste. Uso: node src/scripts/verify-backup.js
// Com --criar, faz um backup novo antes de testar.
require('dotenv').config();
if (!process.env.TZ) process.env.TZ = 'America/Sao_Paulo';

const { createBackup, verifyLatestBackup } = require('../utils/backup');
const { pool } = require('../config/db');

(async () => {
  let code = 0;
  try {
    if (process.argv.includes('--criar')) {
      const made = await createBackup({ reason: 'linha de comando' });
      console.log(`Backup criado: ${made.name} (${Math.round(made.size / 1024)} KB)`);
    }
    const result = await verifyLatestBackup();
    console.log(result.ok ? `OK: ${result.file}. ${result.detail}` : `FALHOU: ${result.file}. ${result.detail}`);
    code = result.ok ? 0 : 1;
  } catch (error) {
    console.error(`FALHOU: ${error.message}`);
    code = 1;
  } finally {
    await pool.end().catch(() => {});
    process.exit(code);
  }
})();
