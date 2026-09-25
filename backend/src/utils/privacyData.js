const { pool } = require('../config/db');

// LGPD: tudo o que a loja guarda de um e-mail (exportar) e a anonimização
// (apagar o que não tem obrigação legal de ficar).

function normalizeEmail(email) {
  return String(email || '').toLowerCase().trim();
}

async function exportByEmail(emailInput) {
  const email = normalizeEmail(emailInput);
  const q = async (sql, params) => (await pool.query(sql, params))[0];

  const orders = await q(
    `SELECT id, created_at, status, payment_status, payment_method, payment_installments, paid_at, customer_name, customer_email,
       customer_phone, subtotal, discount_amount, coupon_code, points_used, points_discount, pix_discount_amount,
       shipping_type, shipping_price, gift_wrap, gift_message, total, tracking_code, address_street, address_number,
       address_complement, address_neighborhood, address_city, address_state, address_cep
     FROM orders WHERE customer_email = ? ORDER BY id`,
    [email]
  );
  const orderIds = orders.map((o) => o.id);
  const items = orderIds.length
    ? await q(
      `SELECT oi.order_id, oi.product_id, p.name AS product_name, oi.size, oi.quantity, oi.price
       FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id IN (?) ORDER BY oi.id`,
      [orderIds]
    )
    : [];
  const [customer] = await q('SELECT id, email, name, phone, marketing_opt_in, created_at, last_login_at FROM customers WHERE email = ?', [email]);
  const wishlist = customer
    ? await q(
      `SELECT w.product_id, p.name, w.created_at FROM customer_wishlist w LEFT JOIN products p ON p.id = w.product_id
       WHERE w.customer_id = ?`,
      [customer.id]
    )
    : [];
  const sessions = await q('SELECT session_id, customer_name, customer_email, status, created_at, updated_at FROM chat_sessions WHERE customer_email = ?', [email]);
  const sessionIds = sessions.map((s) => s.session_id);
  const messages = sessionIds.length
    ? await q('SELECT session_id, sender, message, created_at FROM chat_messages WHERE session_id IN (?) ORDER BY id', [sessionIds])
    : [];

  return {
    email,
    exported_at: new Date().toISOString(),
    account: customer || null,
    wishlist,
    orders: orders.map((order) => ({ ...order, items: items.filter((item) => item.order_id === order.id) })),
    newsletter: await q('SELECT email, name, active, coupon_sent, created_at FROM newsletter_subscribers WHERE email = ?', [email]),
    reviews: await q(
      `SELECT r.id, r.product_id, p.name AS product_name, r.customer_name, r.rating, r.comment, r.status, r.created_at
       FROM reviews r LEFT JOIN products p ON p.id = r.product_id WHERE r.customer_email = ?`,
      [email]
    ),
    loyalty: {
      balance: (await q('SELECT points, total_earned, total_redeemed, updated_at FROM loyalty_points WHERE customer_email = ?', [email]))[0] || null,
      history: await q('SELECT type, points, description, order_id, created_at FROM loyalty_transactions WHERE customer_email = ? ORDER BY id', [email]),
    },
    chat: sessions.map((session) => ({ ...session, messages: messages.filter((m) => m.session_id === session.session_id) })),
    stock_alerts: await q(
      `SELECT sa.product_id, p.name AS product_name, NULLIF(sa.size, '') AS size, sa.notified, sa.created_at
       FROM stock_alerts sa LEFT JOIN products p ON p.id = sa.product_id WHERE sa.email = ?`,
      [email]
    ),
    coupons: await q(
      `SELECT c.code, c.description, cr.order_id, cr.created_at AS used_at FROM coupon_redemptions cr
       JOIN coupons c ON c.id = cr.coupon_id WHERE cr.customer_email = ?
       UNION ALL
       SELECT c.code, c.description, NULL, NULL FROM coupons c WHERE c.customer_email = ?`,
      [email, email]
    ),
    privacy_requests: await q('SELECT id, type, status, created_at, verified_at FROM privacy_requests WHERE email = ?', [email]),
  };
}

/**
 * Apaga newsletter, avisos, conversas, favoritos, pontos e a conta, e
 * anonimiza os pedidos (nome "Cliente anonimizado", sem e-mail nem telefone,
 * endereço reduzido a cidade e UF). Pedido com nota fiscal autorizada mantém
 * os dados fiscais por obrigação legal e fica marcado.
 * Devolve um resumo com o que foi feito.
 */
async function anonymizeByEmail(emailInput) {
  const email = normalizeEmail(emailInput);
  const conn = await pool.getConnection();
  const summary = { orders_anonymized: 0, orders_kept_fiscal: 0 };
  try {
    await conn.beginTransaction();
    const [orders] = await conn.query(
      `SELECT o.id, EXISTS (SELECT 1 FROM invoices i WHERE i.order_id = o.id AND i.status = 'authorized') AS has_invoice
       FROM orders o WHERE o.customer_email = ? FOR UPDATE`,
      [email]
    );
    const fiscal = orders.filter((o) => Number(o.has_invoice)).map((o) => o.id);
    const plain = orders.filter((o) => !Number(o.has_invoice)).map((o) => o.id);
    if (plain.length) {
      await conn.query(
        `UPDATE orders SET customer_name = 'Cliente anonimizado', customer_email = NULL, customer_phone = NULL,
           address_street = NULL, address_number = NULL, address_complement = NULL, address_neighborhood = NULL,
           address_cep = NULL, gift_message = NULL, access_token_hash = NULL, anonymized_at = NOW(),
           privacy_note = 'dados pessoais anonimizados (LGPD)'
         WHERE id IN (?)`,
        [plain]
      );
    }
    if (fiscal.length) {
      // A nota fiscal exige guardar os dados do destinatário (5 anos).
      await conn.query(
        `UPDATE orders SET gift_message = NULL, access_token_hash = NULL, anonymized_at = NOW(),
           privacy_note = 'dados fiscais mantidos por obrigação legal'
         WHERE id IN (?)`,
        [fiscal]
      );
    }
    summary.orders_anonymized = plain.length;
    summary.orders_kept_fiscal = fiscal.length;

    const del = async (key, sql, params) => {
      const [result] = await conn.query(sql, params);
      summary[key] = result.affectedRows;
    };
    await del('newsletter', 'DELETE FROM newsletter_subscribers WHERE email = ?', [email]);
    await del('stock_alerts', 'DELETE FROM stock_alerts WHERE email = ?', [email]);
    const [sessions] = await conn.query('SELECT session_id FROM chat_sessions WHERE customer_email = ?', [email]);
    if (sessions.length) {
      await conn.query('DELETE FROM chat_messages WHERE session_id IN (?)', [sessions.map((s) => s.session_id)]);
    }
    await del('chat_sessions', 'DELETE FROM chat_sessions WHERE customer_email = ?', [email]);
    await del('loyalty_points', 'DELETE FROM loyalty_points WHERE customer_email = ?', [email]);
    await del('loyalty_transactions', 'DELETE FROM loyalty_transactions WHERE customer_email = ?', [email]);
    await del('coupon_redemptions', 'DELETE FROM coupon_redemptions WHERE customer_email = ?', [email]);
    // Cupom pessoal perde o dono e fica inativo (sem dono ele valeria para qualquer um).
    await del('personal_coupons',
      'UPDATE coupons SET customer_email = NULL, visible_in_account = FALSE, active = FALSE WHERE customer_email = ?', [email]);
    await del('reviews_anonymized',
      "UPDATE reviews SET customer_email = NULL, customer_name = 'Cliente anonimizado' WHERE customer_email = ?", [email]);
    await del('login_codes', 'DELETE FROM customer_login_codes WHERE email = ?', [email]);
    const [[customer]] = await conn.query('SELECT id FROM customers WHERE email = ?', [email]);
    if (customer) await conn.query('DELETE FROM customer_wishlist WHERE customer_id = ?', [customer.id]);
    await del('account', 'DELETE FROM customers WHERE email = ?', [email]);
    await conn.commit();
    return summary;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

module.exports = { exportByEmail, anonymizeByEmail, normalizeEmail };
