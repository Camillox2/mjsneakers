const { roundMoney } = require('./pricing');

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function formatMoney(value) {
  return `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
}

/**
 * Confere se o cupom vale para este subtotal e devolve o desconto.
 * Não mexe em used_count: quem reserva o uso é o pedido, com UPDATE atômico.
 * - coupon: linha da tabela coupons
 * - subtotal: soma dos itens já com o desconto do produto
 * - redeemedByEmail: true se o e-mail já usou este cupom (once_per_email)
 */
function evaluateCoupon(coupon, { subtotal, redeemedByEmail = false, now = new Date() }) {
  if (!coupon || !coupon.active) throw httpError(400, 'Cupom inválido ou expirado');
  if (coupon.valid_until && new Date(coupon.valid_until) < now) throw httpError(400, 'Cupom expirado');

  const maxUses = Number(coupon.max_uses) || 0;
  if (maxUses > 0 && Number(coupon.used_count) >= maxUses) throw httpError(400, 'Cupom esgotado');
  if (redeemedByEmail) throw httpError(400, 'Este cupom já foi usado com este e-mail');

  const minOrder = Number(coupon.min_order) || 0;
  const base = Number(subtotal) || 0;
  if (minOrder > 0 && base < minOrder) {
    throw httpError(400, `Pedido mínimo de ${formatMoney(minOrder)} para usar este cupom`);
  }

  const value = Number(coupon.value) || 0;
  const raw = coupon.type === 'fixed' ? value : base * (value / 100);
  // O desconto nunca passa do subtotal (frete não entra no desconto).
  const discount = roundMoney(Math.min(Math.max(raw, 0), base));
  return { discount, value, type: coupon.type };
}

module.exports = { evaluateCoupon, formatMoney };
