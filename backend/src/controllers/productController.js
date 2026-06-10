const { pool, slugify } = require('../config/db');
const { notifySubscribers } = require('./stockAlertController');

function makeSlug(name) {
  return slugify(name) + '-' + Date.now().toString(36);
}

const productController = {
  async getAll(req, res) {
    try {
      const { brand_id, category_id, search, featured, page, limit: rawLimit, sort, min_price, max_price, size } = req.query;
      const limit = Math.min(100, Math.max(1, parseInt(rawLimit) || 20));
      const offset = (Math.max(1, parseInt(page) || 1) - 1) * limit;

      let countQuery = 'SELECT COUNT(*) as total FROM products p WHERE p.active = TRUE';
      let query = `
        SELECT p.*, b.name as brand_name, c.name as category_name,
          COALESCE((SELECT ROUND(AVG(r.rating),1) FROM reviews r WHERE r.product_id=p.id AND r.status='approved'), 0) as avg_rating,
          COALESCE((SELECT COUNT(*) FROM reviews r WHERE r.product_id=p.id AND r.status='approved'), 0) as review_count,
          COALESCE((SELECT SUM(oi.quantity) FROM order_items oi WHERE oi.product_id=p.id), 0) as total_sold
        FROM products p
        LEFT JOIN brands b ON p.brand_id = b.id
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.active = TRUE
      `;
      const params = [];
      const countParams = [];

      if (brand_id) {
        const clause = ' AND p.brand_id = ?';
        query += clause; countQuery += clause;
        params.push(parseInt(brand_id)); countParams.push(parseInt(brand_id));
      }
      if (category_id) {
        const clause = ' AND p.category_id = ?';
        query += clause; countQuery += clause;
        params.push(parseInt(category_id)); countParams.push(parseInt(category_id));
      }
      if (search) {
        const clause = ' AND (p.name LIKE ? OR p.description LIKE ? OR p.tags LIKE ?)';
        query += clause; countQuery += clause;
        const term = `%${search}%`;
        params.push(term, term, term);
        countParams.push(term, term, term);
      }
      if (featured === 'true') {
        const clause = ' AND p.featured = TRUE';
        query += clause; countQuery += clause;
      }
      if (min_price) {
        const clause = ' AND p.price * (1 - COALESCE(p.discount_percentage,0)/100) >= ?';
        query += clause; countQuery += clause;
        params.push(parseFloat(min_price)); countParams.push(parseFloat(min_price));
      }
      if (max_price) {
        const clause = ' AND p.price * (1 - COALESCE(p.discount_percentage,0)/100) <= ?';
        query += clause; countQuery += clause;
        params.push(parseFloat(max_price)); countParams.push(parseFloat(max_price));
      }
      if (size) {
        const clause = " AND FIND_IN_SET(?, REPLACE(p.sizes, ' ', '')) > 0";
        query += clause; countQuery += clause;
        params.push(size); countParams.push(size);
      }

      const sortMap = {
        featured: 'p.featured DESC, p.feature_order ASC, p.created_at DESC',
        newest: 'p.created_at DESC',
        price_asc: 'p.price * (1 - COALESCE(p.discount_percentage,0)/100) ASC',
        price_desc: 'p.price * (1 - COALESCE(p.discount_percentage,0)/100) DESC',
        best_sellers: 'total_sold DESC, p.created_at DESC',
        top_rated: 'avg_rating DESC, review_count DESC',
      };
      query += ` ORDER BY ${sortMap[sort] || sortMap.featured} LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const [[{ total }]] = await pool.query(countQuery, countParams);
      const [rows] = await pool.query(query, params);

      res.json({ data: rows, total, page: parseInt(page) || 1, pages: Math.ceil(total / limit) });
    } catch (error) {
      console.error('Error fetching products:', error);
      res.status(500).json({ error: 'Erro ao buscar produtos' });
    }
  },

  async getById(req, res) {
    try {
      const [rows] = await pool.query(
        `SELECT p.*, b.name as brand_name, c.name as category_name,
           COALESCE((SELECT ROUND(AVG(r.rating),1) FROM reviews r WHERE r.product_id=p.id AND r.status='approved'), 0) as avg_rating,
           COALESCE((SELECT COUNT(*) FROM reviews r WHERE r.product_id=p.id AND r.status='approved'), 0) as review_count,
           COALESCE((SELECT SUM(oi.quantity) FROM order_items oi WHERE oi.product_id=p.id), 0) as total_sold,
           COALESCE((SELECT SUM(oi.quantity) FROM order_items oi JOIN orders o ON oi.order_id=o.id WHERE oi.product_id=p.id AND o.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)), 0) as sold_this_week
         FROM products p
         LEFT JOIN brands b ON p.brand_id = b.id
         LEFT JOIN categories c ON p.category_id = c.id
         WHERE p.id = ?`,
        [req.params.id]
      );
      if (rows.length === 0) return res.status(404).json({ error: 'Produto não encontrado' });
      pool.query('UPDATE products SET view_count = view_count + 1 WHERE id = ?', [req.params.id]).catch(() => {});
      res.json(rows[0]);
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar produto' });
    }
  },

  async getBySlug(req, res) {
    try {
      const [rows] = await pool.query(
        `SELECT p.*, b.name as brand_name, c.name as category_name,
           COALESCE((SELECT ROUND(AVG(r.rating),1) FROM reviews r WHERE r.product_id=p.id AND r.status='approved'), 0) as avg_rating,
           COALESCE((SELECT COUNT(*) FROM reviews r WHERE r.product_id=p.id AND r.status='approved'), 0) as review_count
         FROM products p
         LEFT JOIN brands b ON p.brand_id = b.id
         LEFT JOIN categories c ON p.category_id = c.id
         WHERE p.slug = ? AND p.active = TRUE`,
        [req.params.slug]
      );
      if (rows.length === 0) return res.status(404).json({ error: 'Produto não encontrado' });
      pool.query('UPDATE products SET view_count = view_count + 1 WHERE id = ?', [rows[0].id]).catch(() => {});
      res.json(rows[0]);
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar produto' });
    }
  },

  async getRelated(req, res) {
    try {
      const [current] = await pool.query('SELECT brand_id, category_id FROM products WHERE id=?', [req.params.id]);
      if (current.length === 0) return res.json([]);
      const { brand_id, category_id } = current[0];
      const [rows] = await pool.query(
        `SELECT p.*, b.name as brand_name,
           COALESCE((SELECT ROUND(AVG(r.rating),1) FROM reviews r WHERE r.product_id=p.id AND r.status='approved'), 0) as avg_rating,
           COALESCE((SELECT COUNT(*) FROM reviews r WHERE r.product_id=p.id AND r.status='approved'), 0) as review_count
         FROM products p
         LEFT JOIN brands b ON p.brand_id = b.id
         WHERE p.active = TRUE AND p.id != ?
           AND (p.brand_id = ? OR p.category_id = ?)
         ORDER BY RAND() LIMIT 6`,
        [req.params.id, brand_id, category_id || 0]
      );
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar relacionados' });
    }
  },

  async getFeatured(req, res) {
    try {
      const [rows] = await pool.query(
        `SELECT p.*, b.name as brand_name,
           COALESCE((SELECT ROUND(AVG(r.rating),1) FROM reviews r WHERE r.product_id=p.id AND r.status='approved'), 0) as avg_rating,
           COALESCE((SELECT COUNT(*) FROM reviews r WHERE r.product_id=p.id AND r.status='approved'), 0) as review_count
         FROM products p
         LEFT JOIN brands b ON p.brand_id = b.id
         WHERE p.active = TRUE AND p.featured = TRUE
         ORDER BY p.feature_order ASC, p.created_at DESC LIMIT 12`
      );
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar destaques' });
    }
  },

  async getRecent(req, res) {
    try {
      const [rows] = await pool.query(
        `SELECT p.*, b.name as brand_name FROM products p
         LEFT JOIN brands b ON p.brand_id = b.id
         WHERE p.active = TRUE ORDER BY p.created_at DESC LIMIT 8`
      );
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar recentes' });
    }
  },

  async getBestSellers(req, res) {
    try {
      const [rows] = await pool.query(
        `SELECT p.*, b.name as brand_name,
           COALESCE(SUM(oi.quantity), 0) as total_sold
         FROM products p
         LEFT JOIN brands b ON p.brand_id = b.id
         LEFT JOIN order_items oi ON oi.product_id = p.id
         WHERE p.active = TRUE
         GROUP BY p.id ORDER BY total_sold DESC LIMIT 8`
      );
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar mais vendidos' });
    }
  },

  async create(req, res) {
    try {
      const { name, description, price, discount_percentage, brand_id, category_id, image_url, image_url_2, image_url_3, image_url_4, sizes, stock, featured, feature_order, meta_title, meta_description, tags, promo_start, promo_end } = req.body;
      const slug = makeSlug(name);
      const [result] = await pool.query(
        `INSERT INTO products (name, slug, description, price, discount_percentage, brand_id, category_id, image_url, image_url_2, image_url_3, image_url_4, sizes, stock, featured, feature_order, meta_title, meta_description, tags, promo_start, promo_end)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, slug, description, price, discount_percentage || 0, brand_id || null, category_id || null, image_url, image_url_2, image_url_3, image_url_4, sizes, stock || 0, featured || false, feature_order || 0, meta_title, meta_description, tags, promo_start || null, promo_end || null]
      );
      res.status(201).json({ id: result.insertId, message: 'Produto criado' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro ao criar produto' });
    }
  },

  async update(req, res) {
    try {
      const { name, description, price, discount_percentage, brand_id, category_id, image_url, image_url_2, image_url_3, image_url_4, sizes, stock, active, featured, feature_order, meta_title, meta_description, tags, promo_start, promo_end } = req.body;
      const slug = name ? makeSlug(name) : undefined;
      const oldStock = await pool.query('SELECT stock FROM products WHERE id=?', [req.params.id]);
      await pool.query(
        `UPDATE products SET name=COALESCE(?,name), slug=COALESCE(?,slug), description=COALESCE(?,description),
         price=COALESCE(?,price), discount_percentage=COALESCE(?,discount_percentage),
         brand_id=COALESCE(?,brand_id), category_id=COALESCE(?,category_id),
         image_url=COALESCE(?,image_url), image_url_2=COALESCE(?,image_url_2),
         image_url_3=COALESCE(?,image_url_3), image_url_4=COALESCE(?,image_url_4),
         sizes=COALESCE(?,sizes), stock=COALESCE(?,stock), active=COALESCE(?,active),
         featured=COALESCE(?,featured), feature_order=COALESCE(?,feature_order),
         meta_title=COALESCE(?,meta_title), meta_description=COALESCE(?,meta_description),
         tags=COALESCE(?,tags), promo_start=COALESCE(?,promo_start), promo_end=COALESCE(?,promo_end)
         WHERE id=?`,
        [name, slug, description, price, discount_percentage, brand_id, category_id, image_url, image_url_2, image_url_3, image_url_4, sizes, stock, active, featured, feature_order, meta_title, meta_description, tags, promo_start, promo_end, req.params.id]
      );
      // If stock went from 0 to >0, notify subscribers
      if (stock > 0 && oldStock[0]?.[0]?.stock === 0) {
        notifySubscribers(req.params.id).catch(() => {});
      }
      res.json({ message: 'Produto atualizado' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro ao atualizar produto' });
    }
  },

  async updateInline(req, res) {
    try {
      const { price, stock } = req.body;
      const fields = [];
      const vals = [];
      if (price !== undefined) { fields.push('price = ?'); vals.push(price); }
      if (stock !== undefined) { fields.push('stock = ?'); vals.push(stock); }
      if (fields.length === 0) return res.status(400).json({ error: 'Nenhum campo' });
      vals.push(req.params.id);
      await pool.query(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`, vals);
      res.json({ message: 'Atualizado' });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao atualizar' });
    }
  },

  async bulkAction(req, res) {
    try {
      const { ids, action } = req.body;
      if (!ids || !ids.length) return res.status(400).json({ error: 'Nenhum produto selecionado' });
      const placeholders = ids.map(() => '?').join(',');
      if (action === 'activate') await pool.query(`UPDATE products SET active=TRUE WHERE id IN (${placeholders})`, ids);
      else if (action === 'deactivate') await pool.query(`UPDATE products SET active=FALSE WHERE id IN (${placeholders})`, ids);
      else if (action === 'feature') await pool.query(`UPDATE products SET featured=TRUE WHERE id IN (${placeholders})`, ids);
      else if (action === 'unfeature') await pool.query(`UPDATE products SET featured=FALSE WHERE id IN (${placeholders})`, ids);
      else if (action === 'delete') {
        await pool.query(`DELETE FROM order_items WHERE product_id IN (${placeholders})`, ids);
        await pool.query(`DELETE FROM products WHERE id IN (${placeholders})`, ids);
      }
      else return res.status(400).json({ error: 'Ação inválida' });
      res.json({ message: `${action} aplicado a ${ids.length} produto(s)` });
    } catch (error) {
      res.status(500).json({ error: 'Erro na ação em massa' });
    }
  },

  async clone(req, res) {
    try {
      const [rows] = await pool.query('SELECT * FROM products WHERE id=?', [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'Produto não encontrado' });
      const p = rows[0];
      const slug = makeSlug(p.name + '-copia');
      const [result] = await pool.query(
        `INSERT INTO products (name, slug, description, price, discount_percentage, brand_id, category_id, image_url, image_url_2, image_url_3, image_url_4, sizes, stock, featured, feature_order, meta_title, meta_description, tags, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE)`,
        [p.name + ' (Cópia)', slug, p.description, p.price, p.discount_percentage, p.brand_id, p.category_id, p.image_url, p.image_url_2, p.image_url_3, p.image_url_4, p.sizes, p.stock, p.featured, p.feature_order, p.meta_title, p.meta_description, p.tags]
      );
      res.status(201).json({ id: result.insertId, message: 'Produto clonado' });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao clonar produto' });
    }
  },

  async delete(req, res) {
    try {
      await pool.query('UPDATE products SET active = FALSE WHERE id = ?', [req.params.id]);
      res.json({ message: 'Produto removido' });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao remover produto' });
    }
  }
};

module.exports = productController;
