const { pool } = require('../config/db');

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

  // Public: get user's own reviews (by email)
  async getMyReviews(req, res) {
    try {
      const { email } = req.query;
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
      const { product_id, customer_name, customer_email, rating, comment } = req.body;
      if (!product_id || !customer_name || !rating) {
        return res.status(400).json({ error: 'Campos obrigatórios: product_id, customer_name, rating' });
      }
      if (rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'Rating deve ser entre 1 e 5' });
      }
      const [result] = await pool.query(
        'INSERT INTO reviews (product_id, customer_name, customer_email, rating, comment) VALUES (?, ?, ?, ?, ?)',
        [product_id, customer_name, customer_email, rating, comment]
      );
      res.status(201).json({ id: result.insertId, message: 'Avaliação enviada! Aguardando aprovação.' });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao enviar avaliação' });
    }
  },

  // Admin: get all reviews
  async getAll(req, res) {
    try {
      const { status } = req.query;
      let query = 'SELECT r.*, p.name as product_name FROM reviews r LEFT JOIN products p ON r.product_id = p.id';
      const params = [];
      if (status) {
        query += ' WHERE r.status = ?';
        params.push(status);
      }
      query += ' ORDER BY r.created_at DESC';
      const [rows] = await pool.query(query, params);
      res.json(rows);
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
      await pool.query('UPDATE reviews SET status = ? WHERE id = ?', [status, req.params.id]);
      res.json({ message: `Avaliação ${status === 'approved' ? 'aprovada' : 'rejeitada'}` });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao atualizar avaliação' });
    }
  },

  // Admin: delete
  async delete(req, res) {
    try {
      await pool.query('DELETE FROM reviews WHERE id = ?', [req.params.id]);
      res.json({ message: 'Avaliação removida' });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao remover avaliação' });
    }
  }
};

module.exports = reviewController;
