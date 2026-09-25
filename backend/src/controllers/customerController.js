const { pool } = require('../config/db');
const { pagination, likeTerm } = require('../utils/validate');

// Total gasto conta só pedido pago ou em andamento ('pending' = aguardando pagamento).
const PAID_STATUSES = ['confirmed', 'processing', 'shipped', 'delivered'];

const customerController = {
  // Clientes = e-mails distintos dos pedidos. Nome e telefone do pedido mais
  // recente; total gasto sem cancelados.
  async getAll(req, res) {
    try {
      const { page, limit, offset } = pagination(req.query, 20, 50);

      let where = "WHERE customer_email IS NOT NULL AND customer_email != ''";
      const params = [];

      if (req.query.search) {
        where += ' AND (customer_name LIKE ? OR customer_email LIKE ? OR customer_phone LIKE ?)';
        const t = likeTerm(req.query.search);
        params.push(t, t, t);
      }

      const [[{ total }]] = await pool.query(
        `SELECT COUNT(DISTINCT customer_email) as total FROM orders ${where}`,
        params
      );

      const [rows] = await pool.query(
        `SELECT
           o.customer_email as email,
           SUBSTRING_INDEX(GROUP_CONCAT(o.customer_name ORDER BY o.created_at DESC SEPARATOR '\\n'), '\\n', 1) as name,
           SUBSTRING_INDEX(GROUP_CONCAT(o.customer_phone ORDER BY o.created_at DESC SEPARATOR '\\n'), '\\n', 1) as phone,
           COUNT(*) as total_orders,
           SUM(CASE WHEN o.status IN ('confirmed','processing','shipped','delivered') THEN o.total ELSE 0 END) as total_spent,
           MAX(o.created_at) as last_order_at,
           MIN(o.created_at) as first_order_at
         FROM orders o
         ${where}
         GROUP BY o.customer_email
         ORDER BY last_order_at DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );

      res.json({
        data: rows.map((row) => ({ ...row, total_orders: Number(row.total_orders), total_spent: Number(row.total_spent) || 0 })),
        total: Number(total),
        page,
        pages: Math.ceil(Number(total) / limit),
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro ao buscar clientes' });
    }
  },

  // { email, name, phone, total_orders, total_spent, first_order_at,
  //   last_order_at, orders: [{ id, total, status, created_at, items_count, ... }] }
  async getByEmail(req, res) {
    try {
      // O Express já decodifica o parâmetro da rota.
      const email = String(req.params.email || '').toLowerCase().trim();
      const [orders] = await pool.query(
        `SELECT o.id, o.total, o.status, o.created_at, o.customer_name, o.customer_email, o.customer_phone,
           o.coupon_code, o.discount_amount, o.shipping_price, o.tracking_code, o.address_city, o.address_state,
           COALESCE((SELECT SUM(quantity) FROM order_items WHERE order_id = o.id), 0) as items_count
         FROM orders o
         WHERE o.customer_email = ?
         ORDER BY o.created_at DESC`,
        [email]
      );
      if (orders.length === 0) return res.status(404).json({ error: 'Cliente não encontrado' });

      const [points] = await pool.query('SELECT points FROM loyalty_points WHERE customer_email = ?', [email]);
      const customer = {
        email: orders[0].customer_email,
        name: orders[0].customer_name,
        phone: orders[0].customer_phone,
        total_orders: orders.length,
        total_spent: Math.round(orders.filter(o => PAID_STATUSES.includes(o.status)).reduce((s, o) => s + Number(o.total), 0) * 100) / 100,
        first_order_at: orders[orders.length - 1].created_at,
        last_order_at: orders[0].created_at,
        loyalty_points: points.length ? Number(points[0].points) : 0,
        orders: orders.map((o) => ({ ...o, items_count: Number(o.items_count) })),
      };
      res.json(customer);
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar cliente' });
    }
  },
};

module.exports = customerController;
