const { pool } = require('../config/db');

const productController = {
  async getAll(req, res) {
    try {
      const { brand_id, search } = req.query;
      let query = `
        SELECT p.*, b.name as brand_name 
        FROM products p 
        LEFT JOIN brands b ON p.brand_id = b.id 
        WHERE p.active = TRUE
      `;
      const params = [];

      if (brand_id) {
        query += ' AND p.brand_id = ?';
        params.push(parseInt(brand_id));
      }

      if (search) {
        query += ' AND (p.name LIKE ? OR p.description LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
      }

      query += ' ORDER BY p.created_at DESC';

      const [rows] = await pool.query(query, params);
      res.json(rows);
    } catch (error) {
      console.error('Error fetching products:', error);
      res.status(500).json({ error: 'Erro ao buscar produtos' });
    }
  },

  async getById(req, res) {
    try {
      const [rows] = await pool.query(
        `SELECT p.*, b.name as brand_name 
         FROM products p 
         LEFT JOIN brands b ON p.brand_id = b.id 
         WHERE p.id = ?`,
        [req.params.id]
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Produto não encontrado' });
      }
      res.json(rows[0]);
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar produto' });
    }
  },

  async create(req, res) {
    try {
      const { name, description, price, brand_id, image_url, image_url_2, image_url_3, image_url_4, sizes, stock } = req.body;
      const [result] = await pool.query(
        'INSERT INTO products (name, description, price, brand_id, image_url, image_url_2, image_url_3, image_url_4, sizes, stock) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [name, description, price, brand_id, image_url, image_url_2, image_url_3, image_url_4, sizes, stock]
      );
      res.status(201).json({ id: result.insertId, message: 'Produto criado com sucesso' });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao criar produto' });
    }
  },

  async update(req, res) {
    try {
      const { name, description, price, brand_id, image_url, image_url_2, image_url_3, image_url_4, sizes, stock, active } = req.body;
      await pool.query(
        'UPDATE products SET name=?, description=?, price=?, brand_id=?, image_url=?, image_url_2=?, image_url_3=?, image_url_4=?, sizes=?, stock=?, active=? WHERE id=?',
        [name, description, price, brand_id, image_url, image_url_2, image_url_3, image_url_4, sizes, stock, active, req.params.id]
      );
      res.json({ message: 'Produto atualizado com sucesso' });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao atualizar produto' });
    }
  },

  async delete(req, res) {
    try {
      await pool.query('UPDATE products SET active = FALSE WHERE id = ?', [req.params.id]);
      res.json({ message: 'Produto removido com sucesso' });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao remover produto' });
    }
  }
};

module.exports = productController;
