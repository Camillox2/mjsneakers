// Regra de preço única para loja e servidor: desconto entre 0 e 90%, só dentro
// da janela promo_start/promo_end quando ela existe, e arredondado em centavos.

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function clampDiscount(value) {
  return Math.min(Math.max(Number(value) || 0, 0), 90);
}

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Sem datas, o desconto vale sempre; com datas, só dentro da janela.
function isPromoActive(product, now = new Date()) {
  const start = toDate(product.promo_start);
  const end = toDate(product.promo_end);
  if (start && now < start) return false;
  if (end && now > end) return false;
  return true;
}

function effectiveDiscount(product, now = new Date()) {
  return isPromoActive(product, now) ? clampDiscount(product.discount_percentage) : 0;
}

function unitPrice(product, now = new Date()) {
  const price = Number(product.price) || 0;
  const pct = effectiveDiscount(product, now);
  return pct > 0 ? roundMoney(price * (1 - pct / 100)) : roundMoney(price);
}

// Nas rotas públicas o desconto sai já efetivo, para a loja mostrar o mesmo
// preço que o pedido vai cobrar.
function withEffectiveDiscount(product, now = new Date()) {
  if (!product) return product;
  return { ...product, discount_percentage: effectiveDiscount(product, now) };
}

module.exports = {
  roundMoney,
  clampDiscount,
  isPromoActive,
  effectiveDiscount,
  unitPrice,
  withEffectiveDiscount,
};
