const { pool } = require('../config/db');

const tickerController = {
  // Public: get active tickers
  async getActive(req, res) {
    try {
      const [rows] = await pool.query(
        'SELECT * FROM promotion_tickers WHERE active = TRUE ORDER BY sort_order ASC'
      );
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar tickers' });
    }
  },

  // Admin: get all tickers
  async getAll(req, res) {
    try {
      const [rows] = await pool.query(
        'SELECT * FROM promotion_tickers ORDER BY sort_order ASC, created_at DESC'
      );
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar tickers' });
    }
  },

  async create(req, res) {
    try {
      const { text, emoji, color, sort_order } = req.body;
      if (!text || !text.trim()) {
        return res.status(400).json({ error: 'Texto é obrigatório' });
      }
      const [result] = await pool.query(
        'INSERT INTO promotion_tickers (text, emoji, color, sort_order) VALUES (?, ?, ?, ?)',
        [text.trim(), emoji || '', color || '#DC2626', sort_order || 0]
      );
      res.status(201).json({ id: result.insertId, message: 'Ticker criado' });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao criar ticker' });
    }
  },

  async update(req, res) {
    try {
      const { text, emoji, color, sort_order, active } = req.body;
      await pool.query(
        'UPDATE promotion_tickers SET text=?, emoji=?, color=?, sort_order=?, active=? WHERE id=?',
        [text, emoji || '', color || '#DC2626', sort_order || 0, active ?? true, req.params.id]
      );
      res.json({ message: 'Ticker atualizado' });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao atualizar ticker' });
    }
  },

  async delete(req, res) {
    try {
      await pool.query('DELETE FROM promotion_tickers WHERE id = ?', [req.params.id]);
      res.json({ message: 'Ticker removido' });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao remover ticker' });
    }
  }
};

module.exports = tickerController;
