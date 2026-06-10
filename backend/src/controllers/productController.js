const { pool } = require('../config/db');

const productController = {
  async getAll(req, res) {
    try {
      const { brand_id, search, featured, page, limit: rawLimit } = req.query;
      const limit = Math.min(100, Math.max(1, parseInt(rawLimit) || 50));
      const offset = (Math.max(1, parseInt(page) || 1) - 1) * limit;

      let countQuery = 'SELECT COUNT(*) as total FROM products p WHERE p.active = TRUE';
      let query = `
        SELECT p.*, b.name as brand_name 
        FROM products p 
        LEFT JOIN brands b ON p.brand_id = b.id 
        WHERE p.active = TRUE
      `;
      const params = [];
      const countParams = [];

      // Auto-manage scheduled promotions
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

      if (brand_id) {
        query += ' AND p.brand_id = ?';
        countQuery += ' AND p.brand_id = ?';
        params.push(parseInt(brand_id));
        countParams.push(parseInt(brand_id));
      }

      if (search) {
        query += ' AND (p.name LIKE ? OR p.description LIKE ? OR p.tags LIKE ?)';
        countQuery += ' AND (p.name LIKE ? OR p.description LIKE ? OR p.tags LIKE ?)';
        const term = `%${search}%`;
        params.push(term, term, term);
        countParams.push(term, term, term);
      }

      if (featured === 'true') {
        query += ' AND p.featured = TRUE';
        countQuery += ' AND p.featured = TRUE';
      }

      query += ' ORDER BY p.featured DESC, p.feature_order ASC, p.created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const [[{ total }]] = await pool.query(countQuery, countParams);
      const [rows] = await pool.query(query, params);

      res.json({
        data: rows,
        total,
        page: parseInt(page) || 1,
        pages: Math.ceil(total / limit)
      });
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

  async getFeatured(req, res) {
    try {
      const [rows] = await pool.query(
        `SELECT p.*, b.name as brand_name 
         FROM products p 
         LEFT JOIN brands b ON p.brand_id = b.id 
         WHERE p.active = TRUE AND p.featured = TRUE 
         ORDER BY p.feature_order ASC LIMIT 8`
      );
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar destaques' });
    }
  },

  async getRecent(req, res) {
    try {
      const [rows] = await pool.query(
        `SELECT p.*, b.name as brand_name 
         FROM products p 
         LEFT JOIN brands b ON p.brand_id = b.id 
         WHERE p.active = TRUE 
         ORDER BY p.created_at DESC LIMIT 8`
      );
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar recentes' });
    }
  },

  async getBestSellers(req, res) {
    try {
      const [rows] = await pool.query(
        `SELECT p.*, b.name as brand_name, COALESCE(SUM(oi.quantity), 0) as total_sold
         FROM products p 
         LEFT JOIN brands b ON p.brand_id = b.id 
         LEFT JOIN order_items oi ON p.id = oi.product_id
         WHERE p.active = TRUE
         GROUP BY p.id
         ORDER BY total_sold DESC LIMIT 8`
      );
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar mais vendidos' });
    }
  },

  async create(req, res) {
    try {
      const { name, description, price, discount_percentage, brand_id, image_url, image_url_2, image_url_3, image_url_4, sizes, stock, featured, feature_order, meta_title, meta_description, tags, promo_start, promo_end } = req.body;
      if (!name || !price) {
        return res.status(400).json({ error: 'Nome e preço são obrigatórios' });
      }
      const [result] = await pool.query(
        `INSERT INTO products (name, description, price, discount_percentage, brand_id, image_url, image_url_2, image_url_3, image_url_4, sizes, stock, featured, feature_order, meta_title, meta_description, tags, promo_start, promo_end) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, description, parseFloat(price), Math.max(0, Math.min(90, parseFloat(discount_percentage) || 0)), brand_id || null, image_url, image_url_2, image_url_3, image_url_4, sizes, parseInt(stock) || 0, featured || false, parseInt(feature_order) || 0, meta_title, meta_description, tags, promo_start || null, promo_end || null]
      );
      res.status(201).json({ id: result.insertId, message: 'Produto criado com sucesso' });
    } catch (error) {
      console.error('Error creating product:', error);
      res.status(500).json({ error: 'Erro ao criar produto' });
    }
  },

  async update(req, res) {
    try {
      const { name, description, price, discount_percentage, brand_id, image_url, image_url_2, image_url_3, image_url_4, sizes, stock, active, featured, feature_order, meta_title, meta_description, tags, promo_start, promo_end } = req.body;
      await pool.query(
        `UPDATE products SET name=?, description=?, price=?, discount_percentage=?, brand_id=?, image_url=?, image_url_2=?, image_url_3=?, image_url_4=?, sizes=?, stock=?, active=?, featured=?, feature_order=?, meta_title=?, meta_description=?, tags=?, promo_start=?, promo_end=? WHERE id=?`,
        [name, description, parseFloat(price), Math.max(0, Math.min(90, parseFloat(discount_percentage) || 0)), brand_id || null, image_url, image_url_2, image_url_3, image_url_4, sizes, parseInt(stock) || 0, active ?? true, featured || false, parseInt(feature_order) || 0, meta_title, meta_description, tags, promo_start || null, promo_end || null, req.params.id]
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
