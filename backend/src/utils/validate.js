const { validationResult } = require('express-validator');

// Resposta padrão de erro de validação, igual à que as rotas já usavam.
function validateRequest(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: errors.array()[0]?.msg || 'Dados inválidos',
      details: errors.array().map(({ path, msg }) => ({ field: path, message: msg })),
    });
  }
  next();
}

// Aceita 'YYYY-MM-DD', 'YYYY-MM-DDTHH:mm' (input datetime-local) ou ISO e
// devolve no formato do MySQL. Vazio vira null; inválido lança erro.
function toMysqlDateTime(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const text = String(value).trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) throw new Error('Data inválida');
  const [, y, m, d, hh = '00', mm = '00', ss = '00'] = match;
  const check = new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}`);
  if (Number.isNaN(check.getTime())) throw new Error('Data inválida');
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

// Só 'YYYY-MM-DD'. Usado nos filtros de período.
function isDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  return !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

// Referência de imagem: caminho do próprio site ou URL http(s). Base64 e
// esquemas como javascript: ficam de fora.
const MAX_IMAGE_REF = 2048;
function isImageRef(value) {
  if (value === null || value === undefined || value === '') return true;
  if (typeof value !== 'string' || value.length > MAX_IMAGE_REF) return false;
  return value.startsWith('/') || /^https?:\/\//i.test(value);
}

function toBool(value) {
  if (value === true || value === 1 || value === '1' || value === 'true') return true;
  if (value === false || value === 0 || value === '0' || value === 'false') return false;
  return undefined;
}

function isBoolLike(value) {
  return toBool(value) !== undefined;
}

// Paginação comum: page >= 1 e limit entre 1 e max.
function pagination(query, defaultLimit = 20, maxLimit = 100) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number.parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, offset: (page - 1) * limit };
}

// Escapa % e _ para o termo de busca não virar curinga no LIKE.
function likeTerm(value) {
  return `%${String(value).slice(0, 100).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

module.exports = {
  validateRequest,
  toMysqlDateTime,
  isDateOnly,
  isImageRef,
  MAX_IMAGE_REF,
  toBool,
  isBoolLike,
  pagination,
  likeTerm,
};
