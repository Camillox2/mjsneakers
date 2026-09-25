const crypto = require('crypto');
const { safeEqual } = require('./secrets');

// Cookies de sessão (sem cookie-parser: o cabeçalho é lido aqui).
const ADMIN_COOKIE = 'pz_adm';
const CUSTOMER_COOKIE = 'pz_cli';
const CSRF_COOKIE = 'pz_csrf';
const CSRF_HEADER = 'x-csrf-token';
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!name || name in out) continue;
    try { out[name] = decodeURIComponent(value); } catch (_error) { out[name] = value; }
  }
  return out;
}

function cookiesOf(req) {
  if (!req._cookies) req._cookies = parseCookies(req.headers.cookie);
  return req._cookies;
}

// SameSite pelo env COOKIE_SAMESITE (lax, strict ou none), Secure em produção
// ou pelo COOKIE_SECURE, Domain pelo COOKIE_DOMAIN.
function baseOptions() {
  const sameSiteEnv = String(process.env.COOKIE_SAMESITE || 'lax').toLowerCase();
  const sameSite = ['lax', 'strict', 'none'].includes(sameSiteEnv) ? sameSiteEnv : 'lax';
  let secure = process.env.NODE_ENV === 'production';
  if (process.env.COOKIE_SECURE === 'true') secure = true;
  if (process.env.COOKIE_SECURE === 'false') secure = false;
  if (sameSite === 'none') secure = true;
  const options = { path: '/', sameSite, secure };
  if (process.env.COOKIE_DOMAIN) options.domain = process.env.COOKIE_DOMAIN;
  return options;
}

function newCsrfToken() {
  return crypto.randomBytes(24).toString('hex');
}

// Grava o pz_csrf (não httpOnly: a página lê e manda no header).
function setCsrfCookie(res, token, maxAgeMs) {
  res.cookie(CSRF_COOKIE, token, { ...baseOptions(), httpOnly: false, maxAge: maxAgeMs });
  return token;
}

function setSessionCookies(res, { name, token, maxAgeMs, csrfToken }) {
  res.cookie(name, token, { ...baseOptions(), httpOnly: true, maxAge: maxAgeMs });
  return setCsrfCookie(res, csrfToken || newCsrfToken(), maxAgeMs);
}

function clearCookie(res, name) {
  res.clearCookie(name, { ...baseOptions(), httpOnly: name !== CSRF_COOKIE });
}

// POST/PUT/PATCH/DELETE com sessão por cookie exigem X-CSRF-Token igual ao pz_csrf.
function csrfOk(req) {
  if (!UNSAFE_METHODS.has(req.method)) return true;
  const cookie = cookiesOf(req)[CSRF_COOKIE];
  const header = req.get(CSRF_HEADER);
  return Boolean(cookie && header) && safeEqual(cookie, header);
}

function csrfError(res) {
  return res.status(403).json({ code: 'csrf', error: 'Sessão expirada ou página desatualizada. Recarregue e tente de novo.' });
}

module.exports = {
  ADMIN_COOKIE,
  CUSTOMER_COOKIE,
  CSRF_COOKIE,
  UNSAFE_METHODS,
  parseCookies,
  cookiesOf,
  baseOptions,
  newCsrfToken,
  setCsrfCookie,
  setSessionCookies,
  clearCookie,
  csrfOk,
  csrfError,
};
