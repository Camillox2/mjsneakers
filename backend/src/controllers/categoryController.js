const { pool, slugify } = require('../config/db');
const { auditReq } = require('./auditController');
const { toBool } = require('../utils/validate');

// name, sort_order e active. No update, só entra o que veio no corpo.
function readCategory(body, { partial }) {
  const fields = {};
  if (body.name !== undefined || !partial) {
    const name = String(body.name ?? '').trim();
    if (!name || name.length > 100) return { error: 'Nome é obrigatório (até 100 caracteres)' };
    const slug = slugify(name);
    if (!slug) return { error: 'Nome precisa ter letras ou números' };
    fields.name = name;
    fields.slug = slug;
  }
  if (body.sort_order !== undefined) {
    const n = body.sort_order === '' || body.sort_order === null ? 0 : Number(body.sort_order);
    if (!Number.isInteger(n) || n < -100000 || n > 100000) return { error: 'sort_order deve ser um inteiro' };
    fields.sort_order = n;
  }
  if (body.active !== undefined) {
    const active = toBool(body.active);
    if (active === undefined) return { error: 'active deve ser booleano' };
    fields.active = active;
  }
  return { fields };
}

const categoryController = {
  // Público: só as ativas. Com ?all=1 (admin, checado na rota) vêm todas.
  async getAll(req, res) {
    try {
      const all = req.query.all === '1';
      const [rows] = await pool.query(
        `SELECT c.*, COUNT(p.id) AS product_count
         FROM categories c LEFT JOIN products p ON p.category_id = c.id AND p.active = TRUE
         ${all ? '' : 'WHERE c.active = TRUE'}
         GROUP BY c.id ORDER BY c.sort_order ASC, c.name ASC`
      );
      res.json(rows.map((row) => ({ ...row, active: Boolean(row.active), product_count: Number(row.product_count) })));
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar categorias' });
    }
  },

  async create(req, res) {
    const { fields, error } = readCategory(req.body, { partial: false });
    if (error) return res.status(400).json({ error });
    try {
      const [result] = await pool.query(
        'INSERT INTO categories (name, slug, sort_order, active) VALUES (?, ?, ?, ?)',
        [fields.name, fields.slug, fields.sort_order ?? 0, fields.active ?? true]
      );
      auditReq(req, 'create', 'category', result.insertId, { name: fields.name });
      res.status(201).json({ id: result.insertId, message: 'Categoria criada' });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Categoria já existe' });
      res.status(500).json({ error: 'Erro ao criar categoria' });
    }
  },

  async update(req, res) {
    const { fields, error } = readCategory(req.body, { partial: true });
    if (error) return res.status(400).json({ error });
    const columns = Object.keys(fields);
    if (!columns.length) return res.status(400).json({ error: 'Nada para atualizar' });
    try {
      const [result] = await pool.query(
        `UPDATE categories SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
        [...columns.map((c) => fields[c]), req.params.id]
      );
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Categoria não encontrada' });
      auditReq(req, 'update', 'category', req.params.id, fields);
      res.json({ message: 'Categoria atualizada' });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Categoria já existe' });
      res.status(500).json({ error: 'Erro ao atualizar categoria' });
    }
  },

  async delete(req, res) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('UPDATE products SET category_id = NULL WHERE category_id = ?', [req.params.id]);
      const [result] = await conn.query('DELETE FROM categories WHERE id = ?', [req.params.id]);
      if (result.affectedRows === 0) {
        await conn.rollback();
        return res.status(404).json({ error: 'Categoria não encontrada' });
      }
      await conn.commit();
      auditReq(req, 'delete', 'category', req.params.id);
      res.json({ message: 'Categoria removida' });
    } catch (error) {
      await conn.rollback();
      res.status(500).json({ error: 'Erro ao remover categoria' });
    } finally {
      conn.release();
    }
  },
};

module.exports = categoryController;
