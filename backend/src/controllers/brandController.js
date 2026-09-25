const { pool } = require('../config/db');
const { auditReq } = require('./auditController');
const { isImageRef } = require('../utils/validate');

function readBrand(body, { partial }) {
  const fields = {};
  if (body.name !== undefined || !partial) {
    const name = String(body.name ?? '').trim();
    if (!name || name.length > 100) return { error: 'Nome da marca é obrigatório (até 100 caracteres)' };
    fields.name = name;
  }
  if (body.logo_url !== undefined) {
    if (!isImageRef(body.logo_url)) return { error: 'Logo inválido: envie antes por /upload e use a URL devolvida' };
    fields.logo_url = body.logo_url || null;
  }
  return { fields };
}

const brandController = {
  // Público: lista com a quantidade de produtos ativos de cada marca.
  async getAll(req, res) {
    try {
      const [rows] = await pool.query(
        `SELECT b.*, COUNT(p.id) AS product_count
         FROM brands b LEFT JOIN products p ON p.brand_id = b.id AND p.active = TRUE
         GROUP BY b.id ORDER BY b.name`
      );
      res.json(rows.map((row) => ({ ...row, product_count: Number(row.product_count) })));
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar marcas' });
    }
  },

  async create(req, res) {
    const { fields, error } = readBrand(req.body, { partial: false });
    if (error) return res.status(400).json({ error });
    try {
      const [result] = await pool.query('INSERT INTO brands (name, logo_url) VALUES (?, ?)', [fields.name, fields.logo_url ?? null]);
      auditReq(req, 'create', 'brand', result.insertId, { name: fields.name });
      res.status(201).json({ id: result.insertId, message: 'Marca criada' });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Marca já existe' });
      console.error('Create brand error:', err);
      res.status(500).json({ error: 'Erro ao criar marca' });
    }
  },

  async update(req, res) {
    const { fields, error } = readBrand(req.body, { partial: true });
    if (error) return res.status(400).json({ error });
    const columns = Object.keys(fields);
    if (!columns.length) return res.status(400).json({ error: 'Nada para atualizar' });
    try {
      const [result] = await pool.query(
        `UPDATE brands SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
        [...columns.map((c) => fields[c]), req.params.id]
      );
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Marca não encontrada' });
      auditReq(req, 'update', 'brand', req.params.id, fields);
      res.json({ message: 'Marca atualizada' });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Marca já existe' });
      console.error('Update brand error:', err);
      res.status(500).json({ error: 'Erro ao atualizar marca' });
    }
  },

  // Bloqueado enquanto algum produto (ativo ou não) usar a marca.
  async delete(req, res) {
    try {
      const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM products WHERE brand_id = ?', [req.params.id]);
      if (Number(total) > 0) {
        return res.status(409).json({ error: `A marca é usada por ${total} produto(s). Troque a marca deles antes.` });
      }
      const [result] = await pool.query('DELETE FROM brands WHERE id = ?', [req.params.id]);
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Marca não encontrada' });
      auditReq(req, 'delete', 'brand', req.params.id);
      res.json({ message: 'Marca removida' });
    } catch (error) {
      console.error('Delete brand error:', error);
      res.status(500).json({ error: 'Erro ao remover marca' });
    }
  },
};

module.exports = brandController;
