const { pool } = require('../config/db');

const customerController = {
  async getAll(req, res) {
    try {
      const { search, page, limit: rawLimit } = req.query;
      const limit = Math.min(50, Math.max(1, parseInt(rawLimit) || 20));
      const offset = (Math.max(1, parseInt(page) || 1) - 1) * limit;

      let where = 'WHERE customer_email IS NOT NULL AND customer_email != ""';
      const params = [];

      if (search) {
        where += ' AND (customer_name LIKE ? OR customer_email LIKE ? OR customer_phone LIKE ?)';
        const t = `%${search}%`;
        params.push(t, t, t);
      }

      const [[{ total }]] = await pool.query(
        `SELECT COUNT(DISTINCT customer_email) as total FROM orders ${where}`,
        params
      );

      const [rows] = await pool.query(
        `SELECT
           customer_email as email,
           customer_name as name,
           customer_phone as phone,
           COUNT(*) as total_orders,
           SUM(CASE WHEN status != 'cancelled' THEN total ELSE 0 END) as total_spent,
           MAX(created_at) as last_order_at,
           MIN(created_at) as first_order_at
         FROM orders
         ${where}
         GROUP BY customer_email, customer_name, customer_phone
         ORDER BY last_order_at DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );

      res.json({
        data: rows,
        total,
        page: parseInt(page) || 1,
        pages: Math.ceil(total / limit),
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro ao buscar clientes' });
    }
  },

  async getByEmail(req, res) {
    try {
      const email = decodeURIComponent(req.params.email);
      const [orders] = await pool.query(
        `SELECT o.*,
           (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count
         FROM orders o
         WHERE o.customer_email = ?
         ORDER BY o.created_at DESC`,
        [email]
      );
      if (orders.length === 0) return res.status(404).json({ error: 'Cliente não encontrado' });

      const customer = {
        email: orders[0].customer_email,
        name: orders[0].customer_name,
        phone: orders[0].customer_phone,
        total_orders: orders.length,
        total_spent: orders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + Number(o.total), 0),
        orders,
      };
      res.json(customer);
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar cliente' });
    }
  },
};

module.exports = customerController;
