const { pool } = require('../config/db');
const { auditReq } = require('./auditController');
const { toBool } = require('../utils/validate');

// text, emoji, color, sort_order e active. No update, só o que vier.
function readTicker(body, { partial }) {
  const fields = {};
  if (body.text !== undefined || !partial) {
    const text = String(body.text ?? '').trim();
    if (!text || text.length > 300) return { error: 'Texto é obrigatório (até 300 caracteres)' };
    fields.text = text;
  }
  if (body.emoji !== undefined) {
    const emoji = String(body.emoji ?? '').trim();
    if (emoji.length > 10) return { error: 'emoji deve ter no máximo 10 caracteres' };
    fields.emoji = emoji;
  }
  if (body.color !== undefined) {
    const color = String(body.color ?? '').trim();
    if (color && !/^#[0-9a-fA-F]{3,8}$/.test(color)) return { error: 'color deve ser uma cor hex, ex.: #DC2626' };
    fields.color = color || '#DC2626';
  }
  if (body.sort_order !== undefined) {
    const n = body.sort_order === '' || body.sort_order === null ? 0 : Number(body.sort_order);
    if (!Number.isInteger(n)) return { error: 'sort_order deve ser um inteiro' };
    fields.sort_order = n;
  }
  if (body.active !== undefined) {
    const active = toBool(body.active);
    if (active === undefined) return { error: 'active deve ser booleano' };
    fields.active = active;
  }
  return { fields };
}

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
      res.json(rows.map((row) => ({ ...row, active: Boolean(row.active) })));
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar tickers' });
    }
  },

  async create(req, res) {
    const { fields, error } = readTicker(req.body, { partial: false });
    if (error) return res.status(400).json({ error });
    try {
      const [result] = await pool.query(
        'INSERT INTO promotion_tickers (text, emoji, color, sort_order, active) VALUES (?, ?, ?, ?, ?)',
        [fields.text, fields.emoji || '', fields.color || '#DC2626', fields.sort_order || 0, fields.active ?? true]
      );
      auditReq(req, 'create', 'ticker', result.insertId, { text: fields.text });
      res.status(201).json({ id: result.insertId, message: 'Ticker criado' });
    } catch (err) {
      res.status(500).json({ error: 'Erro ao criar ticker' });
    }
  },

  async update(req, res) {
    const { fields, error } = readTicker(req.body, { partial: true });
    if (error) return res.status(400).json({ error });
    const columns = Object.keys(fields);
    if (!columns.length) return res.status(400).json({ error: 'Nada para atualizar' });
    try {
      const [result] = await pool.query(
        `UPDATE promotion_tickers SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
        [...columns.map((c) => fields[c]), req.params.id]
      );
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Ticker não encontrado' });
      auditReq(req, 'update', 'ticker', req.params.id, fields);
      res.json({ message: 'Ticker atualizado' });
    } catch (err) {
      res.status(500).json({ error: 'Erro ao atualizar ticker' });
    }
  },

  async delete(req, res) {
    try {
      const [result] = await pool.query('DELETE FROM promotion_tickers WHERE id = ?', [req.params.id]);
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Ticker não encontrado' });
      auditReq(req, 'delete', 'ticker', req.params.id);
      res.json({ message: 'Ticker removido' });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao remover ticker' });
    }
  }
};

module.exports = tickerController;
