const { pool } = require('../config/db');

// 10 points per R$1 spent, 100 points = R$1 discount
const POINTS_PER_REAL = 10;
const POINTS_PER_DISCOUNT = 100;

const loyaltyController = {
  async getBalance(req, res) {
    try {
      const { email } = req.params;
      const [rows] = await pool.query('SELECT * FROM loyalty_points WHERE customer_email = ?', [email]);
      if (!rows.length) return res.json({ points: 0, total_earned: 0, total_redeemed: 0 });
      res.json(rows[0]);
    } catch (e) { res.status(500).json({ error: 'Erro' }); }
  },

  async getHistory(req, res) {
    try {
      const { email } = req.params;
      const [rows] = await pool.query(
        'SELECT * FROM loyalty_transactions WHERE customer_email = ? ORDER BY created_at DESC LIMIT 50',
        [email]
      );
      res.json(rows);
    } catch (e) { res.status(500).json({ error: 'Erro' }); }
  },

  async getAll(req, res) {
    try {
      const { page, limit: rawLimit, search } = req.query;
      const limit = Math.min(50, parseInt(rawLimit) || 20);
      const offset = (Math.max(1, parseInt(page) || 1) - 1) * limit;
      let where = 'WHERE 1=1';
      const params = [];
      if (search) { where += ' AND (customer_email LIKE ? OR customer_name LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
      const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM loyalty_points ${where}`, params);
      const [rows] = await pool.query(
        `SELECT * FROM loyalty_points ${where} ORDER BY points DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );
      res.json({ data: rows, total, pages: Math.ceil(total / limit) });
    } catch (e) { res.status(500).json({ error: 'Erro' }); }
  },

  async earnPoints(orderId, customerEmail, customerName, orderTotal) {
    try {
      const points = Math.floor(Number(orderTotal) * POINTS_PER_REAL);
      if (points <= 0) return;
      await pool.query(`
        INSERT INTO loyalty_points (customer_email, customer_name, points, total_earned)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          points = points + ?, total_earned = total_earned + ?,
          customer_name = COALESCE(?, customer_name)
      `, [customerEmail, customerName, points, points, points, points, customerName]);
      await pool.query(
        'INSERT INTO loyalty_transactions (customer_email, order_id, type, points, description) VALUES (?, ?, ?, ?, ?)',
        [customerEmail, orderId, 'earn', points, `Pedido #${orderId} — R$ ${Number(orderTotal).toFixed(2)}`]
      );
    } catch (e) { console.error('Loyalty earn error:', e); }
  },

  async redeem(req, res) {
    try {
      const { email, points } = req.body;
      if (!email || !points || points < POINTS_PER_DISCOUNT) {
        return res.status(400).json({ error: `Mínimo ${POINTS_PER_DISCOUNT} pontos para resgatar` });
      }
      const [rows] = await pool.query('SELECT points FROM loyalty_points WHERE customer_email = ?', [email]);
      if (!rows.length || rows[0].points < points) {
        return res.status(400).json({ error: 'Pontos insuficientes' });
      }
      const discount = (points / POINTS_PER_DISCOUNT);
      await pool.query(
        'UPDATE loyalty_points SET points = points - ?, total_redeemed = total_redeemed + ? WHERE customer_email = ?',
        [points, points, email]
      );
      await pool.query(
        'INSERT INTO loyalty_transactions (customer_email, type, points, description) VALUES (?, ?, ?, ?)',
        [email, 'redeem', -points, `Resgate de ${points} pontos = R$ ${discount.toFixed(2)} desconto`]
      );
      res.json({ discount, message: `${points} pontos resgatados por R$ ${discount.toFixed(2)} de desconto` });
    } catch (e) { res.status(500).json({ error: 'Erro ao resgatar pontos' }); }
  },

  async addBonus(req, res) {
    try {
      const { email, points, description } = req.body;
      await pool.query(`
        INSERT INTO loyalty_points (customer_email, points, total_earned)
        VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE points = points + ?, total_earned = total_earned + ?
      `, [email, points, points, points, points]);
      await pool.query(
        'INSERT INTO loyalty_transactions (customer_email, type, points, description) VALUES (?, ?, ?, ?)',
        [email, 'bonus', points, description || 'Bônus admin']
      );
      res.json({ message: `${points} pontos bônus adicionados` });
    } catch (e) { res.status(500).json({ error: 'Erro' }); }
  }
};

module.exports = loyaltyController;
