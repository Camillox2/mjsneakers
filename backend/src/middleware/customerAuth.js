const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const { customerJwtSecret } = require('../utils/secrets');
const { CUSTOMER_COOKIE, cookiesOf, csrfOk, csrfError } = require('../utils/cookies');

// Sessão do cliente: cookie pz_cli (30 dias), JWT com aud 'customer' e
// segredo próprio (CUSTOMER_JWT_SECRET ou derivado do JWT_SECRET).
const CUSTOMER_SESSION_DAYS = 30;
const CUSTOMER_AUDIENCE = 'customer';

function signCustomerToken(customer) {
  return jwt.sign(
    { sub: String(customer.id), email: customer.email, cv: Number(customer.token_version || 0) },
    customerJwtSecret(),
    { algorithm: 'HS256', audience: CUSTOMER_AUDIENCE, expiresIn: `${CUSTOMER_SESSION_DAYS}d` }
  );
}

async function resolveCustomerToken(token) {
  let decoded;
  try {
    decoded = jwt.verify(token, customerJwtSecret(), { algorithms: ['HS256'], audience: CUSTOMER_AUDIENCE });
  } catch (_error) {
    return null;
  }
  const [rows] = await pool.query(
    'SELECT id, email, name, phone, marketing_opt_in, token_version FROM customers WHERE id = ? AND deleted_at IS NULL',
    [Number(decoded.sub)]
  );
  const customer = rows[0];
  if (!customer || Number(customer.token_version || 0) !== Number(decoded.cv || 0)) return null;
  return customer;
}

// Exige a sessão do cliente (e CSRF em método que altera dados).
async function requireCustomer(req, res, next) {
  const token = cookiesOf(req)[CUSTOMER_COOKIE];
  if (!token) return res.status(401).json({ error: 'Entre na sua conta para continuar' });
  try {
    const customer = await resolveCustomerToken(token);
    if (!customer) return res.status(401).json({ error: 'Sessão expirada. Entre de novo.' });
    if (!csrfOk(req)) return csrfError(res);
    req.customer = customer;
    next();
  } catch (error) {
    console.error('Customer auth error:', error.message);
    res.status(500).json({ error: 'Erro ao validar sessão' });
  }
}

// Preenche req.customer quando há sessão válida (com CSRF conferido em
// método que altera dados); sem sessão, segue sem barrar.
async function optionalCustomer(req, _res, next) {
  const token = cookiesOf(req)[CUSTOMER_COOKIE];
  if (!token) return next();
  try {
    const customer = await resolveCustomerToken(token);
    if (customer) {
      req.customer = customer;
      req.customerCsrfOk = csrfOk(req);
    }
  } catch (error) {
    console.error('Optional customer auth error:', error.message);
  }
  next();
}

module.exports = { CUSTOMER_SESSION_DAYS, signCustomerToken, resolveCustomerToken, requireCustomer, optionalCustomer };
