const { recalcProduct } = require('./productSizes');
const { reversePoints } = require('../controllers/loyaltyController');

// Rotina única de cancelamento de pedido, usada pelo admin (PUT de status),
// pelo pagamento (expirado, estornado) e pela varredura de pedidos não pagos.

// Devolve ao product_sizes o que o pedido tirou. Chamado uma única vez por
// pedido (orders.stock_restored).
async function restoreStock(conn, order, adminUsername) {
  const [items] = await conn.query('SELECT product_id, size, quantity FROM order_items WHERE order_id = ?', [order.id]);
  const touched = new Set();
  for (const item of items) {
    if (!item.product_id || !item.size) continue;
    const [current] = await conn.query(
      'SELECT stock FROM product_sizes WHERE product_id = ? AND size = ? FOR UPDATE',
      [item.product_id, item.size]
    );
    const before = current.length ? Number(current[0].stock) : 0;
    const after = before + Number(item.quantity);
    await conn.query(
      `INSERT INTO product_sizes (product_id, size, stock) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE stock = stock + ?`,
      [item.product_id, item.size, item.quantity, item.quantity]
    );
    await conn.query(
      `INSERT INTO stock_history
        (product_id, size, type, quantity_change, quantity_before, quantity_after, reason, admin_username, order_id)
       VALUES (?, ?, 'return', ?, ?, ?, ?, ?, ?)`,
      [item.product_id, item.size, Number(item.quantity), before, after, 'Pedido cancelado', adminUsername || null, order.id]
    );
    touched.add(item.product_id);
  }
  for (const productId of touched) await recalcProduct(conn, productId);
  await conn.query('UPDATE orders SET stock_restored = TRUE WHERE id = ?', [order.id]);
  // O cupom volta a valer para o cliente (uso liberado).
  if (order.coupon_code) {
    await conn.query('UPDATE coupons SET used_count = GREATEST(used_count - 1, 0) WHERE code = ?', [order.coupon_code]);
    await conn.query('DELETE FROM coupon_redemptions WHERE order_id = ?', [order.id]);
  }
  return [...touched];
}

/**
 * Cancela um pedido já travado (SELECT ... FOR UPDATE) na transação do
 * chamador: status 'cancelled', estoque e cupom devolvidos uma vez só e, se o
 * pedido tinha creditado pontos, estorno uma vez só.
 * Devolve { restored: [productIds], loyaltyReversed, pointsReversed }.
 */
async function cancelOrderInTx(conn, order, adminUsername) {
  await conn.query("UPDATE orders SET status = 'cancelled' WHERE id = ?", [order.id]);
  let restored = [];
  if (!order.stock_restored) restored = await restoreStock(conn, order, adminUsername);

  let loyaltyReversed = false;
  let pointsReversed = 0;
  if (order.loyalty_awarded && !order.loyalty_reversed) {
    const [mark] = await conn.query(
      'UPDATE orders SET loyalty_reversed = TRUE WHERE id = ? AND loyalty_reversed = FALSE',
      [order.id]
    );
    if (mark.affectedRows === 1) {
      const reversal = await reversePoints(conn, { orderId: order.id, customerEmail: order.customer_email });
      loyaltyReversed = true;
      pointsReversed = reversal.reversed;
    }
  }
  // Pontos usados como desconto voltam para o cliente, uma única vez.
  let pointsRefunded = 0;
  if (Number(order.points_used) > 0 && !order.points_refunded && order.customer_email) {
    const [mark] = await conn.query(
      'UPDATE orders SET points_refunded = TRUE WHERE id = ? AND points_refunded = FALSE',
      [order.id]
    );
    if (mark.affectedRows === 1) {
      pointsRefunded = Number(order.points_used);
      await conn.query(
        `INSERT INTO loyalty_points (customer_email, points, total_earned) VALUES (?, ?, 0)
         ON DUPLICATE KEY UPDATE points = points + ?, total_redeemed = GREATEST(total_redeemed - ?, 0)`,
        [order.customer_email, pointsRefunded, pointsRefunded, pointsRefunded]
      );
      await conn.query(
        'INSERT INTO loyalty_transactions (customer_email, order_id, type, points, description) VALUES (?, ?, ?, ?, ?)',
        [order.customer_email, order.id, 'refund_redeem', pointsRefunded, `Pontos devolvidos: pedido #${order.id} cancelado`]
      );
    }
  }
  return { restored, loyaltyReversed, pointsReversed, pointsRefunded };
}

module.exports = { restoreStock, cancelOrderInTx };
