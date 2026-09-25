// Endereço público da loja, usado em links de e-mail, WhatsApp e etiqueta.
const DEFAULT_STORE_URL = 'https://mjsneakers.com.br';

function storeBaseUrl() {
  const raw = process.env.STORE_URL || process.env.FRONTEND_URL || DEFAULT_STORE_URL;
  return String(raw).replace(/\/+$/, '');
}

function storeUrl(path = '') {
  return `${storeBaseUrl()}${path}`;
}

// Página de rastreio da loja: /rastrear?pedido=<id> (a página preenche o
// número a partir do parâmetro; o e-mail o cliente digita).
function trackingUrl(orderId) {
  const id = Number(orderId);
  return storeUrl(Number.isInteger(id) && id > 0 ? `/rastrear?pedido=${id}` : '/rastrear');
}

module.exports = { storeBaseUrl, storeUrl, trackingUrl };
