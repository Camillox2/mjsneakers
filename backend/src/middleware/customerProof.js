const rateLimit = require('express-rate-limit');
const { pool } = require('../config/db');
const { isAdmin } = require('./auth');

// Rotas "por e-mail" (pontos, minhas avaliações) não aceitam só o e-mail:
// o cliente prova que é ele com o número de um pedido feito com esse e-mail,
// igual ao rastreio. Admin (token válido, via optionalAuth) passa direto.
const proofLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Muitas consultas. Tente novamente em alguns minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

async function checkOrderProof(req, res, next) {
  if (isAdmin(req.user)) return next();
  const email = String(req.params.email ?? req.query.email ?? '').toLowerCase().trim();
  const orderId = Number(req.query.order_id);
  if (!email || email.length > 255 || !Number.isInteger(orderId) || orderId < 1) {
    return res.status(401).json({ error: 'Informe o e-mail e o número de um pedido feito com ele (order_id)' });
  }
  try {
    const [rows] = await pool.query('SELECT id FROM orders WHERE id = ? AND customer_email = ?', [orderId, email]);
    if (!rows.length) return res.status(404).json({ error: 'Pedido não encontrado para este e-mail' });
    next();
  } catch (error) {
    console.error('Order proof error:', error.message);
    res.status(500).json({ error: 'Erro ao validar pedido' });
  }
}

const requireOrderProof = [proofLimiter, checkOrderProof];

module.exports = { requireOrderProof };
