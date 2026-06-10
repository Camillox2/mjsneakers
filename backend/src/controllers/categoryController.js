const { pool, slugify } = require('../config/db');

const categoryController = {
  async getAll(req, res) {
    try {
      const [rows] = await pool.query(
        'SELECT * FROM categories ORDER BY sort_order ASC, name ASC'
      );
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar categorias' });
    }
  },

  async create(req, res) {
    try {
      const { name, sort_order } = req.body;
      if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
      const slug = slugify(name);
      const [result] = await pool.query(
        'INSERT INTO categories (name, slug, sort_order) VALUES (?, ?, ?)',
        [name.trim(), slug, sort_order || 0]
      );
      res.status(201).json({ id: result.insertId, message: 'Categoria criada' });
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Categoria já existe' });
      res.status(500).json({ error: 'Erro ao criar categoria' });
    }
  },

  async update(req, res) {
    try {
      const { name, sort_order, active } = req.body;
      const slug = name ? slugify(name) : undefined;
      await pool.query(
        'UPDATE categories SET name=?, slug=?, sort_order=?, active=? WHERE id=?',
        [name, slug || name, sort_order ?? 0, active ?? true, req.params.id]
      );
      res.json({ message: 'Categoria atualizada' });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao atualizar categoria' });
    }
  },

  async delete(req, res) {
    try {
      await pool.query('UPDATE products SET category_id = NULL WHERE category_id = ?', [req.params.id]);
      await pool.query('DELETE FROM categories WHERE id = ?', [req.params.id]);
      res.json({ message: 'Categoria removida' });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao remover categoria' });
    }
  },
};

module.exports = categoryController;
