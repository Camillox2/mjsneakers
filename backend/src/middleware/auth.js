const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const { ADMIN_COOKIE, cookiesOf, csrfOk, csrfError } = require('../utils/cookies');

// Papéis com acesso ao painel. 'editor' e 'atendimento' existem no ENUM mas
// ainda não têm permissão de escrita em nada.
const ADMIN_ROLES = new Set(['admin', 'super_admin']);
// Sessão do painel: 12 h (cookie pz_adm e JWT com o mesmo prazo).
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const ADMIN_AUDIENCE = 'admin';

// O token só vale se o usuário ainda existir e estiver ativo. A consulta fica
// em cache por 30s para não bater no banco a cada requisição.
const USER_CACHE_TTL_MS = 30 * 1000;
const userCache = new Map();

async function loadUser(id) {
  const cached = userCache.get(id);
  if (cached && cached.expires > Date.now()) return cached.user;
  const [rows] = await pool.query(
    'SELECT id, username, role, active, token_version, totp_enabled FROM users WHERE id = ?',
    [id]
  );
  const user = rows[0] || null;
  userCache.set(id, { user, expires: Date.now() + USER_CACHE_TTL_MS });
  return user;
}

function invalidateUserCache(id) {
  if (id === undefined) userCache.clear();
  else userCache.delete(Number(id));
}

// Setting admin_require_2fa, com o mesmo cache de 30 s.
let requireTwoFactorCache = { value: false, expires: 0 };
async function adminRequires2fa() {
  if (requireTwoFactorCache.expires > Date.now()) return requireTwoFactorCache.value;
  const [rows] = await pool.query("SELECT setting_value FROM site_settings WHERE setting_key = 'admin_require_2fa'");
  const value = rows.length > 0 && String(rows[0].setting_value) === 'true';
  requireTwoFactorCache = { value, expires: Date.now() + USER_CACHE_TTL_MS };
  return value;
}
function invalidateSettingsCache() {
  requireTwoFactorCache = { value: false, expires: 0 };
}

// Valida o JWT de sessão e devolve o usuário do banco, ou null se não valer mais.
async function resolveToken(token) {
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'], audience: ADMIN_AUDIENCE });
  } catch (_error) {
    return null;
  }
  const id = Number(decoded.id);
  if (!Number.isInteger(id) || id < 1) return null;
  const user = await loadUser(id);
  if (!user || !user.active) return null;
  if (Number(user.token_version || 0) !== Number(decoded.tv || 0)) return null;
  return { id: user.id, username: user.username, role: user.role, totp_enabled: Boolean(user.totp_enabled) };
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, tv: Number(user.token_version || 0) },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: SESSION_TTL_SECONDS, audience: ADMIN_AUDIENCE }
  );
}

// Token de sessão: Bearer (scripts e testes, sem CSRF) ou cookie pz_adm.
function readSessionToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) return { malformed: true };
    return { token: parts[1], via: 'bearer' };
  }
  const cookie = cookiesOf(req)[ADMIN_COOKIE];
  if (cookie) return { token: cookie, via: 'cookie' };
  return { missing: true };
}

// Com admin_require_2fa ligado, quem não tem 2FA só chega nestas rotas.
const SETUP_ALLOWED = [/^\/api\/auth\/me\/?$/, /^\/api\/auth\/2fa(\/|$)/, /^\/api\/auth\/logout(-all)?\/?$/];

async function authMiddleware(req, res, next) {
  const session = readSessionToken(req);
  if (session.missing) return res.status(401).json({ error: 'Token não fornecido' });
  if (session.malformed) return res.status(401).json({ error: 'Token mal formatado' });

  try {
    const user = await resolveToken(session.token);
    if (!user) return res.status(401).json({ error: 'Token inválido' });
    if (session.via === 'cookie' && !csrfOk(req)) return csrfError(res);
    req.user = user;
    req.authVia = session.via;
    if (!user.totp_enabled && isAdmin(user) && await adminRequires2fa()) {
      const path = req.originalUrl.split('?')[0];
      if (!SETUP_ALLOWED.some((re) => re.test(path))) {
        return res.status(403).json({ code: '2fa_setup_required', error: 'Ligue a verificação em duas etapas para continuar.' });
      }
    }
    next();
  } catch (error) {
    console.error('Auth error:', error.message);
    res.status(500).json({ error: 'Erro ao validar sessão' });
  }
}

// Preenche req.user quando há sessão válida, sem barrar quem não tem. Sessão
// por cookie em método que altera dados sem CSRF é ignorada.
async function optionalAuth(req, _res, next) {
  const session = readSessionToken(req);
  if (!session.token) return next();
  try {
    const user = await resolveToken(session.token);
    if (user && (session.via === 'bearer' || csrfOk(req))) {
      req.user = user;
      req.authVia = session.via;
    }
  } catch (error) {
    console.error('Optional auth error:', error.message);
  }
  next();
}

function isAdmin(user) {
  return Boolean(user && ADMIN_ROLES.has(user.role));
}

function adminMiddleware(req, res, next) {
  if (!isAdmin(req.user)) {
    return res.status(403).json({ error: 'Acesso negado' });
  }
  next();
}

// Atalho para as rotas do painel: token válido e papel de admin.
const requireAdmin = [authMiddleware, adminMiddleware];

// Só o dono (super_admin): ações que mexem em dinheiro, como estorno.
function superAdminMiddleware(req, res, next) {
  if (!req.user || req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Só o super_admin pode fazer isso' });
  }
  next();
}
const requireSuperAdmin = [authMiddleware, superAdminMiddleware];

// Ação sensível: exige a verificação em duas etapas ligada em quem faz.
function twoFactorMiddleware(req, res, next) {
  if (!req.user || !req.user.totp_enabled) {
    return res.status(403).json({ code: '2fa_required', error: 'Ligue a verificação em duas etapas para fazer isso.' });
  }
  next();
}

// Listas públicas que, com ?all=1, trazem também os inativos: aí só admin.
const adminWhenAll = [
  (req, res, next) => (req.query.all === '1' ? authMiddleware(req, res, next) : next()),
  (req, res, next) => (req.query.all === '1' ? adminMiddleware(req, res, next) : next()),
];

module.exports = {
  ADMIN_ROLES,
  SESSION_TTL_SECONDS,
  authMiddleware,
  adminMiddleware,
  optionalAuth,
  requireAdmin,
  requireSuperAdmin,
  twoFactorMiddleware,
  adminWhenAll,
  isAdmin,
  resolveToken,
  signToken,
  invalidateUserCache,
  invalidateSettingsCache,
  readSessionToken,
};
