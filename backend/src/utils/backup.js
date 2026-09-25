const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const mysql = require('mysql2');
const mysqlPromise = require('mysql2/promise');
const { pool } = require('../config/db');
const { recordError } = require('./errorLog');

// Backup lógico do banco em SQL, sem depender do mysqldump do sistema:
// - comprimido (gzip) e, com BACKUP_ENC_KEY, cifrado (AES-256-GCM): o arquivo
//   tem dados de clientes;
// - todo dia na hora BACKUP_HOUR (padrão 3h), com BACKUP_KEEP_DAYS de retenção;
// - opcionalmente enviado para um S3 compatível (AWS, Cloudflare R2, B2);
// - o teste restaura a cópia num banco temporário e compara as linhas.

const MAGIC = Buffer.from('PZBK1');
const BATCH = 500;
const FILE_RE = /^pizantt-\d{4}-\d{2}-\d{2}_\d{6}\.sql\.gz(\.enc)?$/;

const dir = () => path.resolve(process.env.BACKUP_DIR || path.join(__dirname, '../../backups'));
const statusFile = () => path.join(dir(), 'status.json');
const keepDays = () => Math.max(1, parseInt(process.env.BACKUP_KEEP_DAYS, 10) || 14);
const backupHour = () => Math.min(23, Math.max(0, parseInt(process.env.BACKUP_HOUR ?? '3', 10) || 0));

function encKey() {
  const raw = process.env.BACKUP_ENC_KEY;
  if (!raw) return null;
  if (/^[a-f0-9]{64}$/i.test(raw)) return Buffer.from(raw, 'hex');
  return crypto.createHash('sha256').update(raw).digest();
}

function s3Config() {
  const { S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = process.env;
  if (!S3_ENDPOINT || !S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) return null;
  return {
    endpoint: S3_ENDPOINT.replace(/\/+$/, ''),
    bucket: S3_BUCKET,
    accessKey: S3_ACCESS_KEY_ID,
    secret: S3_SECRET_ACCESS_KEY,
    region: process.env.S3_REGION || 'auto',
    prefix: (process.env.S3_PREFIX || 'backups/').replace(/^\/+/, ''),
  };
}

function backupConfig() {
  const s3 = s3Config();
  return {
    enabled: process.env.BACKUP_DISABLED !== 'true',
    encrypted: !!encKey(),
    schedule_hour: backupHour(),
    keep_days: keepDays(),
    remote: s3 ? { configured: true, bucket: s3.bucket, host: new URL(s3.endpoint).host } : { configured: false },
    verify_daily: process.env.BACKUP_VERIFY_DAILY !== 'false',
  };
}

function readStatus() {
  try { return JSON.parse(fs.readFileSync(statusFile(), 'utf8')); } catch { return {}; }
}

function writeStatus(patch) {
  const next = { ...readStatus(), ...patch };
  fs.mkdirSync(dir(), { recursive: true });
  fs.writeFileSync(statusFile(), JSON.stringify(next, null, 2));
  return next;
}

function listBackups() {
  try {
    return fs.readdirSync(dir())
      .filter((name) => FILE_RE.test(name))
      .map((name) => {
        const st = fs.statSync(path.join(dir(), name));
        return { name, size: st.size, created_at: st.mtime.toISOString(), encrypted: name.endsWith('.enc') };
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  } catch {
    return [];
  }
}

function filePathFor(name) {
  if (!FILE_RE.test(name)) return null;
  const full = path.join(dir(), name);
  return fs.existsSync(full) ? full : null;
}

// JSON volta como texto (senão vira objeto e o dump perde o formato). O MySQL
// marca coluna JSON como BINARY: sem 'utf8', acento vira lixo no backup.
const jsonAsString = (field, next) => (field.type === 'JSON' ? field.string('utf8') : next());

async function dumpTo(write) {
  const conn = await pool.getConnection();
  try {
    // tudo em UTC no arquivo: a restauração faz o mesmo e nenhum horário se desloca
    await conn.query("SET time_zone = '+00:00'");
    const [[{ db }]] = await conn.query('SELECT DATABASE() AS db');
    const [tables] = await conn.query(
      "SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME"
    );
    const counts = {};
    await write(`-- Backup do banco ${db}, ${new Date().toISOString()}\nSET NAMES utf8mb4;\nSET time_zone = '+00:00';\nSET FOREIGN_KEY_CHECKS = 0;\n`);
    for (const { name } of tables) {
      const [[create]] = await conn.query(`SHOW CREATE TABLE \`${name}\``);
      await write(`\nDROP TABLE IF EXISTS \`${name}\`;\n${create['Create Table']};\n`);
      const [pk] = await conn.query(
        "SELECT COLUMN_NAME AS col FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY' ORDER BY ORDINAL_POSITION",
        [name]
      );
      const order = pk.length ? ` ORDER BY ${pk.map((p) => `\`${p.col}\``).join(', ')}` : '';
      let offset = 0;
      let total = 0;
      for (;;) {
        const [rows] = await conn.query({
          sql: `SELECT * FROM \`${name}\`${order} LIMIT ? OFFSET ?`,
          values: [BATCH, offset],
          dateStrings: true,
          typeCast: jsonAsString,
        });
        if (!rows.length) break;
        const cols = Object.keys(rows[0]).map((c) => `\`${c}\``).join(', ');
        // escape do mysql2: quebra de linha vira \n dentro da string, então
        // ";\n" só aparece no fim de cada comando (a restauração depende disso)
        const values = rows.map((r) => `(${Object.values(r).map((v) => mysql.escape(v)).join(', ')})`).join(',\n');
        await write(`INSERT INTO \`${name}\` (${cols}) VALUES\n${values};\n`);
        total += rows.length;
        offset += rows.length;
        if (rows.length < BATCH) break;
      }
      counts[name] = total;
    }
    await write(`\nSET FOREIGN_KEY_CHECKS = 1;\n-- rows ${JSON.stringify(counts)}\n`);
    return counts;
  } finally {
    conn.release();
  }
}

const stamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

let running = null;
const isRunning = () => !!running;

async function writeBackupFile() {
  fs.mkdirSync(dir(), { recursive: true });
  const key = encKey();
  const name = `pizantt-${stamp()}.sql.gz${key ? '.enc' : ''}`;
  const final = path.join(dir(), name);
  const tmp = `${final}.parcial`;
  const file = fs.createWriteStream(tmp, { mode: 0o600 });
  const gzip = zlib.createGzip({ level: 6 });

  let done;
  if (key) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    file.write(Buffer.concat([MAGIC, iv]));
    gzip.pipe(cipher).pipe(file, { end: false });
    done = new Promise((resolve, reject) => {
      cipher.on('end', () => file.end(cipher.getAuthTag(), resolve));
      cipher.on('error', reject);
      file.on('error', reject);
    });
  } else {
    gzip.pipe(file);
    done = new Promise((resolve, reject) => {
      file.on('finish', resolve);
      file.on('error', reject);
    });
  }

  const write = (chunk) => new Promise((resolve) => {
    if (gzip.write(chunk)) resolve();
    else gzip.once('drain', resolve);
  });

  try {
    const counts = await dumpTo(write);
    gzip.end();
    await done;
    fs.renameSync(tmp, final);
    return { name, path: final, size: fs.statSync(final).size, counts };
  } catch (error) {
    gzip.destroy();
    file.destroy();
    fs.rmSync(tmp, { force: true });
    throw error;
  }
}

const sha256hex = (data) => crypto.createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

// PUT assinado (AWS SigV4) sem SDK: serve para AWS S3, Cloudflare R2 e B2.
async function uploadToS3(filePath, name) {
  const s3 = s3Config();
  if (!s3) return null;
  const body = fs.readFileSync(filePath);
  const objectKey = `${s3.prefix}${name}`;
  const url = new URL(`${s3.endpoint}/${encodeURIComponent(s3.bucket)}/${objectKey.split('/').map(encodeURIComponent).join('/')}`);
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256hex(body);
  const signed = { host: url.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  const names = Object.keys(signed).sort();
  const canonicalRequest = ['PUT', url.pathname, '', names.map((h) => `${h}:${signed[h]}\n`).join(''), names.join(';'), payloadHash].join('\n');
  const scope = `${dateStamp}/${s3.region}/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonicalRequest)].join('\n');
  const kSigning = hmac(hmac(hmac(hmac(`AWS4${s3.secret}`, dateStamp), s3.region), 's3'), 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(toSign).digest('hex');
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      'Content-Type': 'application/octet-stream',
      Authorization: `AWS4-HMAC-SHA256 Credential=${s3.accessKey}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`,
    },
    body,
  });
  if (!res.ok) {
    const text = (await res.text().catch(() => '')).slice(0, 300);
    throw new Error(`o armazenamento respondeu ${res.status}${text ? `: ${text}` : ''}`);
  }
  return { key: objectKey };
}

function pruneOld() {
  const limit = Date.now() - keepDays() * 24 * 60 * 60 * 1000;
  const files = listBackups();
  files.slice(3).forEach((f) => { // as 3 mais novas ficam sempre
    if (new Date(f.created_at).getTime() < limit) fs.rmSync(path.join(dir(), f.name), { force: true });
  });
}

async function createBackup({ reason = 'manual' } = {}) {
  if (running) throw Object.assign(new Error('Já tem um backup rodando.'), { status: 409 });
  running = (async () => {
    const started = Date.now();
    try {
      const result = await writeBackupFile();
      let remote = null;
      let remoteError = null;
      try {
        remote = await uploadToS3(result.path, result.name);
      } catch (error) {
        remoteError = error.message;
        recordError({ source: 'backend', message: `Envio do backup para o armazenamento externo falhou: ${error.message}`, path: 'backup' });
      }
      pruneOld();
      writeStatus({
        last_backup_at: new Date().toISOString(),
        last_file: result.name,
        last_size: result.size,
        last_duration_ms: Date.now() - started,
        last_reason: reason,
        last_error: null,
        last_remote_ok: remote ? true : s3Config() ? false : null,
        last_remote_error: remoteError,
        last_counts: result.counts,
      });
      return { name: result.name, size: result.size, remote: !!remote, remote_error: remoteError };
    } catch (error) {
      writeStatus({ last_error: error.message, last_error_at: new Date().toISOString() });
      recordError({ source: 'backend', message: `Backup falhou: ${error.message}`, stack: error.stack, path: 'backup' });
      throw error;
    }
  })();
  try {
    return await running;
  } finally {
    running = null;
  }
}

function readBackupSql(filePath) {
  const buf = fs.readFileSync(filePath);
  let gz = buf;
  if (filePath.endsWith('.enc')) {
    const key = encKey();
    if (!key) throw new Error('O backup está cifrado e a BACKUP_ENC_KEY não está no servidor.');
    if (!buf.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Arquivo de backup com formato desconhecido.');
    const iv = buf.subarray(MAGIC.length, MAGIC.length + 12);
    const tag = buf.subarray(buf.length - 16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    gz = Buffer.concat([decipher.update(buf.subarray(MAGIC.length + 12, buf.length - 16)), decipher.final()]);
  }
  return zlib.gunzipSync(gz).toString('utf8');
}

// Restaura a cópia mais nova num banco temporário e confere as linhas de cada tabela.
async function verifyLatestBackup() {
  const latest = listBackups()[0];
  if (!latest) throw new Error('Ainda não existe backup para testar.');
  const started = Date.now();
  const sql = readBackupSql(path.join(dir(), latest.name));
  const rowsLine = sql.match(/^-- rows (\{.*\})$/m);
  const expected = rowsLine ? JSON.parse(rowsLine[1]) : {};
  const base = String(process.env.DB_NAME || 'loja').replace(/[^A-Za-z0-9_]/g, '').slice(0, 40);
  const tempDb = `${base}_teste_${Date.now()}`;
  const conn = await mysqlPromise.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    timezone: '+00:00',
    dateStrings: true,
  });
  const mismatches = [];
  try {
    await conn.query(`CREATE DATABASE \`${tempDb}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.query(`USE \`${tempDb}\``);
    const statements = sql.split(/;\n/).map((s) => s.split('\n').filter((l) => !l.startsWith('--')).join('\n').trim()).filter(Boolean);
    for (const statement of statements) await conn.query(statement);
    for (const [table, count] of Object.entries(expected)) {
      const [[{ n }]] = await conn.query(`SELECT COUNT(*) AS n FROM \`${table}\``);
      if (Number(n) !== Number(count)) mismatches.push(`${table}: esperava ${count}, veio ${n}`);
    }
  } catch (error) {
    const hint = /denied/i.test(error.message)
      ? ' O usuário do banco precisa poder criar e apagar um banco de teste (CREATE e DROP).'
      : '';
    const result = writeStatus({ last_verify_at: new Date().toISOString(), last_verify_ok: false, last_verify_detail: `${error.message}${hint}`, last_verify_file: latest.name });
    recordError({ source: 'backend', message: `Teste de restauração do backup falhou: ${error.message}`, path: 'backup' });
    await conn.query(`DROP DATABASE IF EXISTS \`${tempDb}\``).catch(() => {});
    await conn.end().catch(() => {});
    return { ok: false, detail: result.last_verify_detail, file: latest.name };
  }
  await conn.query(`DROP DATABASE IF EXISTS \`${tempDb}\``).catch(() => {});
  await conn.end().catch(() => {});
  const ok = mismatches.length === 0;
  const detail = ok
    ? `${Object.keys(expected).length} tabelas e ${Object.values(expected).reduce((a, b) => a + Number(b), 0)} linhas restauradas em ${Math.round((Date.now() - started) / 1000)} s.`
    : mismatches.join('; ');
  writeStatus({ last_verify_at: new Date().toISOString(), last_verify_ok: ok, last_verify_detail: detail, last_verify_file: latest.name });
  if (!ok) recordError({ source: 'backend', message: `Backup não confere na restauração: ${detail}`, path: 'backup' });
  return { ok, detail, file: latest.name };
}

let timer = null;
function scheduleBackups() {
  if (process.env.BACKUP_DISABLED === 'true' || timer) return;
  const msToNext = () => {
    const now = new Date();
    const next = new Date(now);
    next.setHours(backupHour(), 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next - now;
  };
  const run = async () => {
    try {
      await createBackup({ reason: 'agendado' });
      if (process.env.BACKUP_VERIFY_DAILY !== 'false') await verifyLatestBackup();
    } catch (_error) {
      // já registrado em recordError (aparece na saúde do painel e vai por e-mail)
    }
    timer = setTimeout(run, msToNext());
    timer.unref?.();
  };
  timer = setTimeout(run, msToNext());
  timer.unref?.();
}

module.exports = {
  backupConfig,
  readStatus,
  listBackups,
  filePathFor,
  createBackup,
  verifyLatestBackup,
  scheduleBackups,
  isRunning,
};
