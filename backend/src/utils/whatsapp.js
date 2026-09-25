const { trackingUrl } = require('./storeUrl');

function normalizeWhatsAppPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('55') ? digits : `55${digits}`;
}

function buildShippingMessage(order) {
  return `Olá ${order.customer_name}! \n\nSeu pedido #${order.id} foi enviado!\n\nRastreie pelo código: *${order.tracking_code}*\n\nAcompanhe sua entrega em: ${trackingUrl(order.id)}\n\nObrigado pela compra! `;
}

async function createWhatsAppNotification(connection, order) {
  const phone = normalizeWhatsAppPhone(order.customer_phone);
  if (!phone) return { wa_link: null, message: null };

  const message = buildShippingMessage(order);
  const waLink = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  await connection.query(
    `INSERT INTO whatsapp_notifications (order_id, phone, message, wa_link, status)
     VALUES (?, ?, ?, ?, 'pending')`,
    [order.id, phone.slice(0, 20), message, waLink]
  );
  return { wa_link: waLink, message };
}

module.exports = {
  normalizeWhatsAppPhone,
  buildShippingMessage,
  createWhatsAppNotification,
};
