const { pool, slugify } = require('../config/db');
const { notifySubscribers } = require('./stockAlertController');
const { auditReq } = require('./auditController');
const { withEffectiveDiscount } = require('../utils/pricing');
const { toMysqlDateTime, isImageRef, toBool, pagination, likeTerm } = require('../utils/validate');
const {
  parseSizesText, normalizeSizeStock, syncSizeStock, ensureSizesExist, loadSizeStock, recalcProduct,
} = require('../utils/productSizes');

function makeSlug(name) {
  return (slugify(name) || 'produto') + '-' + Date.now().toString(36);
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

const IMAGE_FIELDS = ['image_url', 'image_url_2', 'image_url_3', 'image_url_4'];

// Campos editáveis do produto e como cada um é validado. O que não estiver
// aqui é ignorado (stock, slug, view_count etc. não vêm do cliente).
const FIELD_RULES = {
  name: (v) => {
    const text = String(v ?? '').trim();
    if (!text || text.length > 255) throw httpError(400, 'Nome é obrigatório (até 255 caracteres)');
    return text;
  },
  description: (v) => {
    if (v === null || v === '') return null;
    const text = String(v);
    if (text.length > 20000) throw httpError(400, 'Descrição muito longa (máx. 20000 caracteres)');
    return text;
  },
  price: (v) => {
    const n = Number(v);
    if (v === null || v === '' || !Number.isFinite(n) || n < 0 || n > 10000000) {
      throw httpError(400, 'Preço deve ser um número maior ou igual a zero');
    }
    return Math.round(n * 100) / 100;
  },
  discount_percentage: (v) => {
    const n = v === null || v === '' ? 0 : Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 90) throw httpError(400, 'Desconto deve ficar entre 0 e 90%');
    return Math.round(n * 100) / 100;
  },
  brand_id: (v) => optionalId(v, 'brand_id'),
  category_id: (v) => optionalId(v, 'category_id'),
  supplier_id: (v) => optionalId(v, 'supplier_id'),
  image_url: imageRule,
  image_url_2: imageRule,
  image_url_3: imageRule,
  image_url_4: imageRule,
  featured: (v) => boolRule(v, 'featured'),
  active: (v) => boolRule(v, 'active'),
  feature_order: (v) => intRule(v, 'feature_order', -100000, 100000, 0),
  meta_title: (v) => optionalText(v, 255, 'meta_title'),
  meta_description: (v) => optionalText(v, 2000, 'meta_description'),
  tags: (v) => optionalText(v, 500, 'tags'),
  promo_start: (v) => dateRule(v, 'promo_start'),
  promo_end: (v) => dateRule(v, 'promo_end'),
  weight_g: (v) => (v === null || v === '' ? 300 : intRule(v, 'weight_g', 0, 100000, 300)),
  height_cm: (v) => decimalRule(v, 'height_cm'),
  width_cm: (v) => decimalRule(v, 'width_cm'),
  length_cm: (v) => decimalRule(v, 'length_cm'),
  // Nota fiscal (opcionais; na falta, valem os padrões fiscal_* das configurações)
  ncm: (v) => {
    if (v === null || v === '') return null;
    const digits = String(v).replace(/[.\s]/g, '');
    if (!/^\d{8}$/.test(digits)) throw httpError(400, 'NCM deve ter 8 dígitos');
    return digits;
  },
  origin: (v) => {
    if (v === null || v === '') return null;
    const text = String(v).trim();
    if (!/^[0-8]$/.test(text)) throw httpError(400, 'Origem da mercadoria deve ser um dígito de 0 a 8');
    return text;
  },
  gtin: (v) => {
    if (v === null || v === '') return null;
    const digits = String(v).replace(/\s/g, '');
    if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(digits) || !validGtin(digits)) {
      throw httpError(400, 'GTIN (código de barras) inválido');
    }
    return digits;
  },
};

// Dígito verificador do GTIN-8/12/13/14 (pesos 3 e 1 da direita para a esquerda).
function validGtin(code) {
  const digits = code.split('').map(Number);
  const check = digits.pop();
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

function optionalId(v, field) {
  if (v === null || v === '' || v === undefined) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw httpError(400, `${field} inválido`);
  return n;
}
function imageRule(v) {
  if (!isImageRef(v)) throw httpError(400, 'Imagem inválida: envie antes por /upload e use a URL devolvida');
  return v || null;
}
function boolRule(v, field) {
  const b = toBool(v);
  if (b === undefined) throw httpError(400, `${field} deve ser booleano`);
  return b;
}
function intRule(v, field, min, max, fallback) {
  if (v === null || v === '') return fallback;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw httpError(400, `${field} deve ser um inteiro entre ${min} e ${max}`);
  return n;
}
function decimalRule(v, field) {
  if (v === null || v === '') return 0;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 9999) throw httpError(400, `${field} deve ficar entre 0 e 9999`);
  return Math.round(n * 10) / 10;
}
function optionalText(v, max, field) {
  if (v === null || v === '') return null;
  const text = String(v);
  if (text.length > max) throw httpError(400, `${field} deve ter no máximo ${max} caracteres`);
  return text;
}
function dateRule(v, field) {
  try {
    return toMysqlDateTime(v);
  } catch (_error) {
    throw httpError(400, `${field} inválido`);
  }
}

// Monta { campo: valor } só com o que veio no corpo. No create, nome e
// preço são obrigatórios.
function parseProductBody(body, { create }) {
  const fields = {};
  for (const [key, rule] of Object.entries(FIELD_RULES)) {
    if (body[key] === undefined) continue;
    fields[key] = rule(body[key]);
  }
  if (create) {
    if (fields.name === undefined) throw httpError(400, 'Nome é obrigatório');
    if (fields.price === undefined) throw httpError(400, 'Preço é obrigatório');
  }
  if (fields.promo_start && fields.promo_end && fields.promo_start > fields.promo_end) {
    throw httpError(400, 'O fim da promoção deve ser depois do início');
  }

  let sizeStock = null;
  if (body.size_stock !== undefined && body.size_stock !== null) sizeStock = normalizeSizeStock(body.size_stock);
  let sizesText = null;
  if (body.sizes !== undefined) {
    sizesText = parseSizesText(body.sizes);
    fields.sizes = sizesText.join(',') || null;
  }
  if (sizeStock) fields.sizes = sizeStock.map((item) => item.size).join(',') || null;
  return { fields, sizeStock, sizesText };
}

async function assertReferences(conn, fields) {
  const checks = [
    ['brand_id', 'brands', 'Marca não encontrada'],
    ['category_id', 'categories', 'Categoria não encontrada'],
    ['supplier_id', 'suppliers', 'Fornecedor não encontrado'],
  ];
  for (const [field, table, message] of checks) {
    if (fields[field] === undefined || fields[field] === null) continue;
    const [rows] = await conn.query(`SELECT id FROM ${table} WHERE id = ?`, [fields[field]]);
    if (!rows.length) throw httpError(400, message);
  }
}

function sendError(res, error, fallback) {
  if (error.status) return res.status(error.status).json({ error: error.message });
  console.error(fallback, error);
  res.status(500).json({ error: fallback });
}

// Tem pedido ou review? Então o produto só pode ser inativado.
async function hasHistory(conn, productId) {
  const [[{ orders }]] = await conn.query('SELECT COUNT(*) AS orders FROM order_items WHERE product_id = ?', [productId]);
  if (Number(orders) > 0) return true;
  const [[{ reviews }]] = await conn.query('SELECT COUNT(*) AS reviews FROM reviews WHERE product_id = ?', [productId]);
  return Number(reviews) > 0;
}

// Apaga ou inativa, conforme o histórico. Nunca mexe em order_items.
async function removeProduct(conn, productId) {
  const [rows] = await conn.query('SELECT id FROM products WHERE id = ? FOR UPDATE', [productId]);
  if (!rows.length) return 'missing';
  if (await hasHistory(conn, productId)) {
    await conn.query('UPDATE products SET active = FALSE WHERE id = ?', [productId]);
    return 'deactivated';
  }
  await conn.query('DELETE FROM products WHERE id = ?', [productId]);
  return 'deleted';
}

const ADMIN_SORTS = {
  recent: 'p.created_at DESC, p.id DESC',
  name: 'p.name ASC, p.id ASC',
  price: 'p.price ASC, p.id ASC',
  stock: 'p.stock ASC, p.id ASC',
};

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
          COALESCE((SELECT SUM(oi.quantity) FROM order_items oi WHERE oi.product_id=p.id), 0) as total_sold,
          COALESCE((
            SELECT JSON_ARRAYAGG(JSON_OBJECT('size', ps.size, 'stock', ps.stock))
            FROM product_sizes ps WHERE ps.product_id = p.id
          ), JSON_ARRAY()) as sizes_stock
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
        const term = likeTerm(search);
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
        params.push(String(size).slice(0, 10)); countParams.push(String(size).slice(0, 10));
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

      const now = new Date();
      res.json({ data: rows.map((row) => withEffectiveDiscount(row, now)), total, page: parseInt(page) || 1, pages: Math.ceil(total / limit) });
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
         WHERE p.id = ? AND p.active = TRUE`,
        [req.params.id]
      );
      if (rows.length === 0) return res.status(404).json({ error: 'Produto não encontrado' });
      pool.query('UPDATE products SET view_count = view_count + 1 WHERE id = ?', [req.params.id]).catch(() => {});
      res.json(withEffectiveDiscount(rows[0]));
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
      res.json(withEffectiveDiscount(rows[0]));
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
      const now = new Date();
      res.json(rows.map((row) => withEffectiveDiscount(row, now)));
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
      const now = new Date();
      res.json(rows.map((row) => withEffectiveDiscount(row, now)));
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
      const now = new Date();
      res.json(rows.map((row) => withEffectiveDiscount(row, now)));
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
      const now = new Date();
      res.json(rows.map((row) => withEffectiveDiscount(row, now)));
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar mais vendidos' });
    }
  },

  // Admin: lista com filtros, inclusive inativos, e estoque por tamanho.
  async adminList(req, res) {
    try {
      const { page, limit, offset } = pagination(req.query, 24, 100);
      const where = ['1=1'];
      const params = [];

      if (req.query.search) {
        const term = likeTerm(req.query.search);
        const id = Number(req.query.search);
        where.push('(p.name LIKE ? OR p.tags LIKE ? OR p.slug LIKE ? OR b.name LIKE ? OR p.id = ?)');
        params.push(term, term, term, term, Number.isInteger(id) ? id : 0);
      }
      if (req.query.brand_id) { where.push('p.brand_id = ?'); params.push(Number(req.query.brand_id) || 0); }
      if (req.query.category_id) { where.push('p.category_id = ?'); params.push(Number(req.query.category_id) || 0); }

      const status = req.query.status || 'all';
      if (status === 'active') where.push('p.active = TRUE');
      else if (status === 'inactive') where.push('p.active = FALSE');
      else if (status !== 'all') return res.status(400).json({ error: 'status deve ser active, inactive ou all' });

      const stockFilter = req.query.stock;
      if (stockFilter === 'out') where.push('p.stock <= 0');
      else if (stockFilter === 'low') where.push('p.stock > 0 AND p.stock <= COALESCE(st.threshold, 5)');
      else if (stockFilter === 'ok') where.push('p.stock > COALESCE(st.threshold, 5)');
      else if (stockFilter) return res.status(400).json({ error: 'stock deve ser out, low ou ok' });

      const sort = ADMIN_SORTS[req.query.sort || 'recent'];
      if (!sort) return res.status(400).json({ error: 'sort deve ser recent, name, price ou stock' });

      const from = `FROM products p
        LEFT JOIN brands b ON p.brand_id = b.id
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN stock_thresholds st ON st.product_id = p.id
        WHERE ${where.join(' AND ')}`;

      const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${from}`, params);
      const [rows] = await pool.query(
        `SELECT p.*, b.name AS brand_name, c.name AS category_name,
           COALESCE(st.threshold, 5) AS low_stock_threshold
         ${from}
         ORDER BY ${sort}
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );

      const sizes = await loadSizeStock(pool, rows.map((row) => row.id));
      const data = rows.map((row) => ({
        ...row,
        active: Boolean(row.active),
        featured: Boolean(row.featured),
        size_stock: sizes.get(row.id) || [],
        total_stock: Number(row.stock) || 0,
      }));
      res.json({ data, total: Number(total), page, pages: Math.ceil(Number(total) / limit) });
    } catch (error) {
      console.error('Admin product list error:', error);
      res.status(500).json({ error: 'Erro ao buscar produtos' });
    }
  },

  // Admin: produto completo, com tamanhos, imagens e se pode ser apagado.
  async adminGet(req, res) {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'id inválido' });
      const [rows] = await pool.query(
        `SELECT p.*, b.name AS brand_name, c.name AS category_name,
           COALESCE(st.threshold, 5) AS low_stock_threshold, st.notify_email,
           (SELECT COUNT(*) FROM order_items oi WHERE oi.product_id = p.id) AS orders_count,
           (SELECT COUNT(*) FROM reviews r WHERE r.product_id = p.id) AS reviews_count
         FROM products p
         LEFT JOIN brands b ON p.brand_id = b.id
         LEFT JOIN categories c ON p.category_id = c.id
         LEFT JOIN stock_thresholds st ON st.product_id = p.id
         WHERE p.id = ?`,
        [id]
      );
      if (!rows.length) return res.status(404).json({ error: 'Produto não encontrado' });
      const product = rows[0];
      const sizes = await loadSizeStock(pool, [id]);
      res.json({
        ...product,
        active: Boolean(product.active),
        featured: Boolean(product.featured),
        orders_count: Number(product.orders_count),
        reviews_count: Number(product.reviews_count),
        can_delete: Number(product.orders_count) === 0 && Number(product.reviews_count) === 0,
        images: IMAGE_FIELDS.map((field) => product[field]).filter(Boolean),
        size_stock: sizes.get(id) || [],
        total_stock: Number(product.stock) || 0,
      });
    } catch (error) {
      console.error('Admin product get error:', error);
      res.status(500).json({ error: 'Erro ao buscar produto' });
    }
  },

  async create(req, res) {
    let parsed;
    try {
      parsed = parseProductBody(req.body, { create: true });
    } catch (error) {
      return sendError(res, error, 'Erro ao criar produto');
    }
    const { fields, sizeStock, sizesText } = parsed;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await assertReferences(conn, fields);
      const values = { ...fields, slug: makeSlug(fields.name), stock: 0 };
      if (values.weight_g === undefined) values.weight_g = 300;
      const columns = Object.keys(values);
      const [result] = await conn.query(
        `INSERT INTO products (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
        columns.map((column) => values[column])
      );
      const productId = result.insertId;

      if (sizeStock) {
        await syncSizeStock(conn, productId, sizeStock, { removeMissing: false, adminUsername: req.user?.username, reason: 'Cadastro do produto' });
      } else if (sizesText && sizesText.length) {
        await ensureSizesExist(conn, productId, sizesText);
      }
      await conn.commit();
      auditReq(req, 'create', 'product', productId, { name: fields.name });
      notifySubscribers(productId).catch(() => {});
      res.status(201).json({ id: productId, message: 'Produto criado' });
    } catch (error) {
      await conn.rollback();
      sendError(res, error, 'Erro ao criar produto');
    } finally {
      conn.release();
    }
  },

  // Atualiza só os campos enviados (null limpa o campo). O slug muda apenas
  // quando o nome muda.
  async update(req, res) {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'id inválido' });
    let parsed;
    try {
      parsed = parseProductBody(req.body, { create: false });
    } catch (error) {
      return sendError(res, error, 'Erro ao atualizar produto');
    }
    const { fields, sizeStock, sizesText } = parsed;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [current] = await conn.query('SELECT id, name, promo_start, promo_end FROM products WHERE id = ? FOR UPDATE', [id]);
      if (!current.length) {
        await conn.rollback();
        return res.status(404).json({ error: 'Produto não encontrado' });
      }
      await assertReferences(conn, fields);
      if (fields.name !== undefined && fields.name !== current[0].name) fields.slug = makeSlug(fields.name);

      const columns = Object.keys(fields);
      if (columns.length) {
        await conn.query(
          `UPDATE products SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE id = ?`,
          [...columns.map((column) => fields[column]), id]
        );
      }
      if (sizeStock) {
        await syncSizeStock(conn, id, sizeStock, { removeMissing: true, adminUsername: req.user?.username });
      } else if (sizesText) {
        await ensureSizesExist(conn, id, sizesText);
      } else {
        await recalcProduct(conn, id);
      }
      await conn.commit();
      auditReq(req, 'update', 'product', id, { fields: columns, size_stock: Boolean(sizeStock) });
      notifySubscribers(id).catch(() => {});
      res.json({ message: 'Produto atualizado' });
    } catch (error) {
      await conn.rollback();
      sendError(res, error, 'Erro ao atualizar produto');
    } finally {
      conn.release();
    }
  },

  async setActive(req, res) {
    try {
      const id = Number(req.params.id);
      const active = toBool(req.body.active);
      if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'id inválido' });
      if (active === undefined) return res.status(400).json({ error: 'active deve ser booleano' });
      const [result] = await pool.query('UPDATE products SET active = ? WHERE id = ?', [active, id]);
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Produto não encontrado' });
      auditReq(req, active ? 'activate' : 'deactivate', 'product', id);
      if (active) notifySubscribers(id).catch(() => {});
      res.json({ message: active ? 'Produto ativado' : 'Produto inativado', active });
    } catch (error) {
      sendError(res, error, 'Erro ao atualizar produto');
    }
  },

  // Edição rápida de preço ou desconto. Estoque é por tamanho (size_stock).
  async updateInline(req, res) {
    try {
      const body = { ...req.body };
      if (body.field !== undefined) body[body.field] = body.value;
      if (body.stock !== undefined) {
        return res.status(400).json({ error: 'O estoque é por tamanho: use size_stock no PUT do produto' });
      }
      const fields = {};
      if (body.price !== undefined) fields.price = FIELD_RULES.price(body.price);
      if (body.discount_percentage !== undefined) fields.discount_percentage = FIELD_RULES.discount_percentage(body.discount_percentage);
      const columns = Object.keys(fields);
      if (columns.length === 0) return res.status(400).json({ error: 'Envie price ou discount_percentage' });
      const [result] = await pool.query(
        `UPDATE products SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE id = ?`,
        [...columns.map((column) => fields[column]), req.params.id]
      );
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Produto não encontrado' });
      auditReq(req, 'update', 'product', req.params.id, fields);
      res.json({ message: 'Atualizado' });
    } catch (error) {
      sendError(res, error, 'Erro ao atualizar');
    }
  },

  async bulkAction(req, res) {
    const { ids, action } = req.body;
    const list = Array.isArray(ids) ? [...new Set(ids.map(Number))] : [];
    if (!list.length) return res.status(400).json({ error: 'Nenhum produto selecionado' });
    if (list.length > 500 || !list.every((id) => Number.isInteger(id) && id > 0)) {
      return res.status(400).json({ error: 'ids deve ser uma lista de até 500 ids válidos' });
    }
    const updates = {
      activate: 'active = TRUE',
      deactivate: 'active = FALSE',
      feature: 'featured = TRUE',
      unfeature: 'featured = FALSE',
    };
    if (!updates[action] && action !== 'delete') return res.status(400).json({ error: 'Ação inválida' });

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      let result;
      if (action === 'delete') {
        const counts = { deleted: 0, deactivated: 0 };
        for (const id of list) {
          const outcome = await removeProduct(conn, id);
          if (outcome !== 'missing') counts[outcome] += 1;
        }
        result = counts;
      } else {
        const [update] = await conn.query(`UPDATE products SET ${updates[action]} WHERE id IN (?)`, [list]);
        result = { affected: update.affectedRows };
      }
      await conn.commit();
      auditReq(req, `bulk_${action}`, 'product', null, { ids: list, ...result });
      if (action === 'activate') list.forEach((id) => notifySubscribers(id).catch(() => {}));
      res.json({ message: `${action} aplicado a ${list.length} produto(s)`, ...result });
    } catch (error) {
      await conn.rollback();
      sendError(res, error, 'Erro na ação em massa');
    } finally {
      conn.release();
    }
  },

  // Cópia inativa, com os mesmos tamanhos (estoque zerado), peso, medidas, NCM e
  // origem. O código de barras (GTIN) é de cada produto e não vai junto.
  async clone(req, res) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query('SELECT * FROM products WHERE id=?', [req.params.id]);
      if (!rows.length) {
        await conn.rollback();
        return res.status(404).json({ error: 'Produto não encontrado' });
      }
      const p = rows[0];
      const name = `${p.name} (Cópia)`.slice(0, 255);
      const [result] = await conn.query(
        `INSERT INTO products (name, slug, description, price, discount_percentage, brand_id, category_id, supplier_id,
           image_url, image_url_2, image_url_3, image_url_4, sizes, stock, featured, feature_order,
           meta_title, meta_description, tags, promo_start, promo_end, weight_g, height_cm, width_cm, length_cm, ncm, origin, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, FALSE, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE)`,
        [name, makeSlug(name), p.description, p.price, p.discount_percentage, p.brand_id, p.category_id, p.supplier_id,
          p.image_url, p.image_url_2, p.image_url_3, p.image_url_4, p.sizes, p.feature_order,
          p.meta_title, p.meta_description, p.tags, p.promo_start, p.promo_end,
          p.weight_g, p.height_cm, p.width_cm, p.length_cm, p.ncm ?? null, p.origin ?? null]
      );
      const newId = result.insertId;
      await conn.query(
        'INSERT INTO product_sizes (product_id, size, stock) SELECT ?, size, 0 FROM product_sizes WHERE product_id = ?',
        [newId, p.id]
      );
      await recalcProduct(conn, newId);
      await conn.commit();
      auditReq(req, 'clone', 'product', newId, { from: p.id });
      res.status(201).json({ id: newId, message: 'Produto clonado' });
    } catch (error) {
      await conn.rollback();
      sendError(res, error, 'Erro ao clonar produto');
    } finally {
      conn.release();
    }
  },

  async delete(req, res) {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'id inválido' });
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const outcome = await removeProduct(conn, id);
      if (outcome === 'missing') {
        await conn.rollback();
        return res.status(404).json({ error: 'Produto não encontrado' });
      }
      await conn.commit();
      auditReq(req, outcome === 'deleted' ? 'delete' : 'deactivate', 'product', id);
      res.json({
        message: outcome === 'deleted' ? 'Produto removido' : 'Produto tem pedidos ou avaliações: foi inativado',
        deleted: outcome === 'deleted' ? 1 : 0,
        deactivated: outcome === 'deactivated' ? 1 : 0,
      });
    } catch (error) {
      await conn.rollback();
      sendError(res, error, 'Erro ao remover produto');
    } finally {
      conn.release();
    }
  }
};

module.exports = productController;
