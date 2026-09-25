const crypto = require('crypto');

// Chaves derivadas do JWT_SECRET (HKDF-SHA256) quando o env próprio não vem.
// Cada finalidade tem a sua chave: vazar uma não compromete as outras.
function derive(label, length = 32) {
  const base = String(process.env.JWT_SECRET || '');
  return Buffer.from(crypto.hkdfSync('sha256', base, 'pizantt-drop', label, length));
}

// Aceita 64 hex (32 bytes) ou uma frase (vira sha256 dela).
function keyFromEnv(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (/^[0-9a-fA-F]{64}$/.test(text)) return Buffer.from(text, 'hex');
  return crypto.createHash('sha256').update(text).digest();
}

function customerJwtSecret() {
  return process.env.CUSTOMER_JWT_SECRET || derive('customer-jwt').toString('hex');
}

function totpEncryptionKey() {
  return keyFromEnv(process.env.TOTP_ENC_KEY) || derive('totp-encryption');
}

// AES-256-GCM: "v1:iv:tag:dados" em hex.
function encrypt(plain, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return `v1:${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${data.toString('hex')}`;
}

function decrypt(payload, key) {
  const [version, iv, tag, data] = String(payload || '').split(':');
  if (version !== 'v1' || !iv || !tag || data === undefined) throw new Error('Segredo cifrado em formato desconhecido');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'hex')), decipher.final()]).toString('utf8');
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

// Comparação de strings em tempo constante (tamanhos diferentes = falso).
function safeEqual(a, b) {
  const left = Buffer.from(String(a ?? ''));
  const right = Buffer.from(String(b ?? ''));
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
}

// Código numérico de 6 dígitos (login da conta, confirmação de pedidos LGPD).
function numericCode(digits = 6) {
  return String(crypto.randomInt(0, 10 ** digits)).padStart(digits, '0');
}

module.exports = { derive, keyFromEnv, customerJwtSecret, totpEncryptionKey, encrypt, decrypt, sha256, safeEqual, numericCode };
