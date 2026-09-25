const { pool } = require('../config/db');
const { auditReq } = require('./auditController');
const { pagination } = require('../utils/validate');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const reviewController = {
  // Public: get approved reviews for a product
  async getByProduct(req, res) {
    try {
      const [rows] = await pool.query(
        'SELECT * FROM reviews WHERE product_id = ? AND status = ? ORDER BY created_at DESC',
        [req.params.productId, 'approved']
      );
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar avaliações' });
    }
  },

  // Cliente: as próprias avaliações. A rota exige email + order_id de um
  // pedido feito com esse e-mail (ou token de admin).
  async getMyReviews(req, res) {
    try {
      const email = String(req.query.email || '').toLowerCase().trim();
      if (!email) return res.status(400).json({ error: 'Email obrigatório' });
      const [rows] = await pool.query(
        'SELECT r.*, p.name as product_name FROM reviews r LEFT JOIN products p ON r.product_id = p.id WHERE r.customer_email = ? ORDER BY r.created_at DESC',
        [email]
      );
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar suas avaliações' });
    }
  },

  // Public: submit a review
  async create(req, res) {
    try {
      const productId = Number(req.body.product_id);
      const rating = Number(req.body.rating);
      const customerName = String(req.body.customer_name || '').trim();
      const customerEmail = req.body.customer_email ? String(req.body.customer_email).toLowerCase().trim() : null;
      const comment = req.body.comment ? String(req.body.comment).trim() : null;
      if (!Number.isInteger(productId) || productId < 1 || !customerName || !rating) {
        return res.status(400).json({ error: 'Campos obrigatórios: product_id, customer_name, rating' });
      }
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'Rating deve ser entre 1 e 5' });
      }
      if (customerName.length > 255) return res.status(400).json({ error: 'Nome muito longo' });
      if (customerEmail && (customerEmail.length > 255 || !EMAIL_RE.test(customerEmail))) {
        return res.status(400).json({ error: 'E-mail inválido' });
      }
      if (comment && comment.length > 2000) return res.status(400).json({ error: 'Comentário deve ter no máximo 2000 caracteres' });
      const [products] = await pool.query('SELECT id FROM products WHERE id = ? AND active = TRUE', [productId]);
      if (!products.length) return res.status(404).json({ error: 'Produto não encontrado' });
      const [result] = await pool.query(
        'INSERT INTO reviews (product_id, customer_name, customer_email, rating, comment) VALUES (?, ?, ?, ?, ?)',
        [productId, customerName, customerEmail, rating, comment]
      );
      res.status(201).json({ id: result.insertId, message: 'Avaliação enviada! Aguardando aprovação.' });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao enviar avaliação' });
    }
  },

  // Admin: get all reviews
  // Admin: sem ?page devolve o array de sempre (o contador do painel usa
  // assim); com ?page devolve {data, total, page, pages}, 24 por página.
  async getAll(req, res) {
    try {
      const { status } = req.query;
      let where = '';
      const params = [];
      if (status) {
        if (!['pending', 'approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Status inválido' });
        where = 'WHERE r.status = ?';
        params.push(status);
      }
      const select = `SELECT r.id, r.product_id, p.name AS product_name, r.customer_name, r.customer_email, r.rating,
          r.comment, r.photo_url, r.status, r.created_at
        FROM reviews r LEFT JOIN products p ON r.product_id = p.id ${where}
        ORDER BY r.created_at DESC, r.id DESC`;

      if (req.query.page === undefined) {
        const [rows] = await pool.query(select, params);
        return res.json(rows);
      }
      const { page, limit, offset } = pagination(req.query, 24, 100);
      const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM reviews r ${where}`, params);
      const [rows] = await pool.query(`${select} LIMIT ? OFFSET ?`, [...params, limit, offset]);
      res.json({ data: rows, total: Number(total), page, pages: Math.ceil(Number(total) / limit) });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar avaliações' });
    }
  },

  // Admin: approve/reject
  async updateStatus(req, res) {
    try {
      const { status } = req.body;
      if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'Status inválido' });
      }
      const [result] = await pool.query('UPDATE reviews SET status = ? WHERE id = ?', [status, req.params.id]);
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Avaliação não encontrada' });
      auditReq(req, status === 'approved' ? 'approve' : 'reject', 'review', req.params.id);
      res.json({ message: `Avaliação ${status === 'approved' ? 'aprovada' : 'rejeitada'}` });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao atualizar avaliação' });
    }
  },

  // Admin: delete
  async delete(req, res) {
    try {
      const [result] = await pool.query('DELETE FROM reviews WHERE id = ?', [req.params.id]);
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Avaliação não encontrada' });
      auditReq(req, 'delete', 'review', req.params.id);
      res.json({ message: 'Avaliação removida' });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao remover avaliação' });
    }
  }
};

module.exports = reviewController;
