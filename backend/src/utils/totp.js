const crypto = require('crypto');

// TOTP (RFC 6238): HMAC-SHA1, 6 dígitos, passo de 30 s, janela de ±1 passo.
const STEP_SECONDS = 30;
const DIGITS = 6;
const WINDOW = 1;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(text) {
  const clean = String(text || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of clean) {
    value = (value << 5) | BASE32.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function generateSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function hotp(secretBase32, counter) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', base32Decode(secretBase32)).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS);
  return String(code).padStart(DIGITS, '0');
}

function currentStep(now = Date.now()) {
  return Math.floor(now / 1000 / STEP_SECONDS);
}

// Devolve o passo que bateu (para gravar e não aceitar de novo) ou null.
// lastStep: último passo já usado; só aceita passo maior que ele.
function verifyTotp(secretBase32, code, { lastStep = null, now = Date.now() } = {}) {
  const clean = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return null;
  const step = currentStep(now);
  for (let delta = -WINDOW; delta <= WINDOW; delta += 1) {
    const candidate = step + delta;
    if (lastStep !== null && lastStep !== undefined && candidate <= Number(lastStep)) continue;
    const expected = Buffer.from(hotp(secretBase32, candidate));
    if (crypto.timingSafeEqual(expected, Buffer.from(clean))) return candidate;
  }
  return null;
}

function otpauthUrl({ secret, account, issuer }) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: String(DIGITS), period: String(STEP_SECONDS) });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// 10 códigos de recuperação no formato xxxx-xxxx (base32 minúsculo).
function recoveryCodes(count = 10) {
  return Array.from({ length: count }, () => {
    const raw = base32Encode(crypto.randomBytes(5)).toLowerCase().slice(0, 8);
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
  });
}

function normalizeRecovery(code) {
  const clean = String(code || '').toLowerCase().replace(/[^a-z2-7]/g, '');
  return clean.length === 8 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : null;
}

module.exports = { generateSecret, hotp, currentStep, verifyTotp, otpauthUrl, recoveryCodes, normalizeRecovery, base32Encode, base32Decode };
