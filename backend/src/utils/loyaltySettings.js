const { getSettingValues } = require('../controllers/settingsController');
const { roundMoney } = require('./pricing');

// Regras do programa de pontos, das settings loyalty_* (com os padrões).
const DEFAULTS = {
  loyalty_enabled: 'true',
  loyalty_points_per_real: '10',
  loyalty_points_per_real_discount: '100',
  loyalty_max_redeem_percent: '30',
  loyalty_min_redeem: '500',
};

function intOr(value, fallback, min, max) {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

async function loyaltyConfig() {
  const raw = await getSettingValues(Object.keys(DEFAULTS));
  const value = (key) => (raw[key] === '' ? DEFAULTS[key] : raw[key]);
  return {
    enabled: value('loyalty_enabled') === 'true',
    points_per_real: intOr(value('loyalty_points_per_real'), 10, 0, 1000),
    points_per_real_discount: intOr(value('loyalty_points_per_real_discount'), 100, 1, 100000),
    max_redeem_percent: intOr(value('loyalty_max_redeem_percent'), 30, 0, 100),
    min_redeem: intOr(value('loyalty_min_redeem'), 500, 0, 10000000),
  };
}

// Valor em reais de uma quantidade de pontos.
function pointsValue(points, config) {
  return roundMoney(Math.max(Number(points) || 0, 0) / config.points_per_real_discount);
}

/**
 * Confere o uso de pontos num pedido: saldo, mínimo e teto percentual do
 * subtotal (e nunca acima do que sobra depois do cupom).
 * Devolve { points, discount } ou lança { status, message }.
 */
function evaluatePointsUse({ usePoints, balance, subtotal, afterCoupon, config }) {
  const fail = (message) => { const error = new Error(message); error.status = 400; throw error; };
  if (!config.enabled) fail('O programa de pontos está desligado');
  const points = Number(usePoints);
  if (!Number.isInteger(points) || points < 1) fail('use_points deve ser um inteiro positivo');
  if (points < config.min_redeem) fail(`Use no mínimo ${config.min_redeem} pontos`);
  if (points > balance) fail(`Você tem ${balance} pontos`);
  const discount = pointsValue(points, config);
  const cap = roundMoney(Math.min(subtotal * (config.max_redeem_percent / 100), afterCoupon));
  if (discount > cap) {
    const maxPoints = Math.floor(cap * config.points_per_real_discount);
    fail(`Neste pedido dá para usar até ${maxPoints} pontos (R$ ${cap.toFixed(2).replace('.', ',')})`);
  }
  return { points, discount };
}

module.exports = { loyaltyConfig, pointsValue, evaluatePointsUse };
