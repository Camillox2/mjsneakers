const { pool } = require('../config/db');
const { auditReq } = require('./auditController');
const { pagination, likeTerm } = require('../utils/validate');

// 10 points per R$1 spent, 100 points = R$1 discount
const POINTS_PER_REAL = 10;
const POINTS_PER_DISCOUNT = 100;
const MAX_BONUS = 100000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value) {
  return String(value || '').toLowerCase().trim();
}

const loyaltyController = {
  // Saldo e histórico: o e-mail vem da rota e já foi conferido com o número
  // de um pedido dele (ou a requisição é de admin), ver routes/loyalty.js.
  async getBalance(req, res) {
    try {
      const email = normalizeEmail(req.params.email);
      const [rows] = await pool.query('SELECT * FROM loyalty_points WHERE customer_email = ?', [email]);
      if (!rows.length) return res.json({ customer_email: email, points: 0, total_earned: 0, total_redeemed: 0 });
      res.json(rows[0]);
    } catch (e) { res.status(500).json({ error: 'Erro ao buscar pontos' }); }
  },

  async getHistory(req, res) {
    try {
      const email = normalizeEmail(req.params.email);
      const [rows] = await pool.query(
        'SELECT * FROM loyalty_transactions WHERE customer_email = ? ORDER BY created_at DESC LIMIT 50',
        [email]
      );
      res.json(rows);
    } catch (e) { res.status(500).json({ error: 'Erro ao buscar histórico de pontos' }); }
  },

  async getAll(req, res) {
    try {
      const { page, limit, offset } = pagination(req.query, 20, 50);
      let where = 'WHERE 1=1';
      const params = [];
      if (req.query.search) {
        const term = likeTerm(req.query.search);
        where += ' AND (customer_email LIKE ? OR customer_name LIKE ?)';
        params.push(term, term);
      }
      const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM loyalty_points ${where}`, params);
      const [rows] = await pool.query(
        `SELECT * FROM loyalty_points ${where} ORDER BY points DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );
      res.json({ data: rows, total: Number(total), page, pages: Math.ceil(Number(total) / limit) });
    } catch (e) { res.status(500).json({ error: 'Erro ao buscar pontos' }); }
  },

  // Crédito de pontos de um pedido entregue, dentro da transação do chamador.
  // A marca orders.loyalty_awarded (conferida por quem chama) evita crédito duplo.
  async earnPoints(conn, { orderId, customerEmail, customerName, amount }) {
    const email = normalizeEmail(customerEmail);
    const points = Math.floor(Number(amount) * POINTS_PER_REAL);
    if (!email || points <= 0) return 0;
    await conn.query(`
      INSERT INTO loyalty_points (customer_email, customer_name, points, total_earned)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        points = points + ?, total_earned = total_earned + ?,
        customer_name = COALESCE(?, customer_name)
    `, [email, customerName || null, points, points, points, points, customerName || null]);
    await conn.query(
      'INSERT INTO loyalty_transactions (customer_email, order_id, type, points, description) VALUES (?, ?, ?, ?, ?)',
      [email, orderId, 'earn', points, `Pedido #${orderId}: R$ ${Number(amount).toFixed(2)}`]
    );
    return points;
  },

  // Estorna os pontos que um pedido creditou (pedido entregue e depois
  // cancelado), dentro da transação do chamador. O saldo nunca fica negativo:
  // se o cliente já gastou parte, estorna só o que houver e registra isso.
  // A marca orders.loyalty_reversed (conferida por quem chama) garante uma vez só.
  async reversePoints(conn, { orderId, customerEmail }) {
    const email = normalizeEmail(customerEmail);
    if (!email) return { awarded: 0, reversed: 0 };
    const [[earned]] = await conn.query(
      "SELECT COALESCE(SUM(points), 0) AS points FROM loyalty_transactions WHERE order_id = ? AND type = 'earn'",
      [orderId]
    );
    const awarded = Number(earned.points) || 0;
    if (awarded <= 0) return { awarded: 0, reversed: 0 };

    const [balances] = await conn.query('SELECT points FROM loyalty_points WHERE customer_email = ? FOR UPDATE', [email]);
    const balance = balances.length ? Math.max(Number(balances[0].points) || 0, 0) : 0;
    const reversed = Math.min(awarded, balance);
    if (balances.length) {
      await conn.query(
        'UPDATE loyalty_points SET points = GREATEST(points - ?, 0), total_earned = GREATEST(total_earned - ?, 0) WHERE customer_email = ?',
        [reversed, reversed, email]
      );
    }
    const note = reversed < awarded
      ? `Estorno do pedido #${orderId} cancelado: ${reversed} de ${awarded} pontos (saldo insuficiente)`
      : `Estorno do pedido #${orderId} cancelado`;
    await conn.query(
      'INSERT INTO loyalty_transactions (customer_email, order_id, type, points, description) VALUES (?, ?, ?, ?, ?)',
      [email, orderId, 'reversal', -reversed, note.slice(0, 255)]
    );
    return { awarded, reversed };
  },

  // Admin: resgata pontos de um cliente (ex.: desconto dado no atendimento).
  async redeem(req, res) {
    const email = normalizeEmail(req.body.email);
    const points = Number(req.body.points);
    if (!EMAIL_RE.test(email) || !Number.isInteger(points) || points < POINTS_PER_DISCOUNT || points > MAX_BONUS) {
      return res.status(400).json({ error: `Informe o e-mail e no mínimo ${POINTS_PER_DISCOUNT} pontos` });
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      // Débito atômico: só passa se houver saldo.
      const [result] = await conn.query(
        'UPDATE loyalty_points SET points = points - ?, total_redeemed = total_redeemed + ? WHERE customer_email = ? AND points >= ?',
        [points, points, email, points]
      );
      if (result.affectedRows !== 1) {
        await conn.rollback();
        return res.status(400).json({ error: 'Pontos insuficientes' });
      }
      const discount = points / POINTS_PER_DISCOUNT;
      await conn.query(
        'INSERT INTO loyalty_transactions (customer_email, type, points, description) VALUES (?, ?, ?, ?)',
        [email, 'redeem', -points, `Resgate de ${points} pontos = R$ ${discount.toFixed(2)} de desconto`]
      );
      await conn.commit();
      auditReq(req, 'redeem', 'loyalty', null, { email, points });
      res.json({ discount, message: `${points} pontos resgatados por R$ ${discount.toFixed(2)} de desconto` });
    } catch (e) {
      await conn.rollback();
      res.status(500).json({ error: 'Erro ao resgatar pontos' });
    } finally {
      conn.release();
    }
  },

  async addBonus(req, res) {
    const email = normalizeEmail(req.body.email);
    const points = Number(req.body.points);
    const description = req.body.description ? String(req.body.description).trim().slice(0, 255) : 'Bônus admin';
    if (!EMAIL_RE.test(email) || email.length > 255) return res.status(400).json({ error: 'E-mail inválido' });
    if (!Number.isInteger(points) || points < 1 || points > MAX_BONUS) {
      return res.status(400).json({ error: `Pontos devem ser um inteiro entre 1 e ${MAX_BONUS}` });
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(`
        INSERT INTO loyalty_points (customer_email, points, total_earned)
        VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE points = points + ?, total_earned = total_earned + ?
      `, [email, points, points, points, points]);
      await conn.query(
        'INSERT INTO loyalty_transactions (customer_email, type, points, description) VALUES (?, ?, ?, ?)',
        [email, 'bonus', points, description]
      );
      await conn.commit();
      auditReq(req, 'bonus', 'loyalty', null, { email, points, description });
      res.json({ message: `${points} pontos bônus adicionados` });
    } catch (e) {
      await conn.rollback();
      res.status(500).json({ error: 'Erro ao adicionar bônus' });
    } finally {
      conn.release();
    }
  }
};

module.exports = loyaltyController;
