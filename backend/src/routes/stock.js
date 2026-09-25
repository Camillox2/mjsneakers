const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const { body, param } = require('express-validator');
const { pool } = require('../config/db');
const { requireAdmin } = require('../middleware/auth');
const { auditReq } = require('../controllers/auditController');
const { notifySubscribers } = require('../controllers/stockAlertController');
const { validateRequest, pagination, toBool } = require('../utils/validate');
const { normalizeSizeStock, syncSizeStock, recordHistory, recalcProduct } = require('../utils/productSizes');

const stockRoutes = express.Router();
const supplierRoutes = express.Router();

// Um único formato de CSV para modelo, exportação e importação.
const CSV_HEADER = 'product_id,size,stock';
const HISTORY_TYPES = ['sale', 'adjustment', 'return', 'import'];
// Teto por carrinho: soma das reservas ativas de uma sessão.
const MAX_RESERVED_PER_SESSION = 20;

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

function uploadCsv(req, res, next) {
  csvUpload.single('file')(req, res, (error) => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'Arquivo CSV excede o limite de 2 MB' });
    }
    return res.status(400).json({ error: error.message || 'Arquivo CSV inválido' });
  });
}

const productIdValidation = param('productId')
  .isInt({ min: 1 })
  .withMessage('productId deve ser um inteiro positivo')
  .toInt();

// Aspas só quando precisa; texto que começa com = + - @ vira texto no Excel.
function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",;\r\n]/.test(text) || text !== String(value ?? '') ? `"${text.replace(/"/g, '""')}"` : text;
}

// Separa uma linha de CSV respeitando aspas ("a,b" é uma célula só).
function parseCsvLine(line, delimiter) {
  const cells = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') { current += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else current += char;
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

const reserveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: { error: 'Muitas reservas seguidas. Tente novamente em alguns minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Público: estoque por tamanho. Com ?session_id=, a reserva do próprio
// carrinho não conta contra o disponível.
stockRoutes.get('/product/:productId/sizes', productIdValidation, validateRequest, async (req, res) => {
  try {
    const sessionId = req.query.session_id ? String(req.query.session_id).slice(0, 100) : null;
    const [rows] = await pool.query(
      `SELECT ps.size, ps.stock,
        COALESCE((SELECT SUM(quantity) FROM cart_reservations
          WHERE product_id = ps.product_id AND size = ps.size AND reserved_until > NOW()
            AND (? IS NULL OR session_id <> ?)), 0) AS reserved
       FROM product_sizes ps WHERE ps.product_id = ?
       ORDER BY (ps.size REGEXP '^[0-9]+([.][0-9]+)?$') DESC,
         CASE WHEN ps.size REGEXP '^[0-9]+([.][0-9]+)?$' THEN ps.size + 0 END, ps.size`,
      [sessionId, sessionId, req.params.productId]
    );

    res.json(rows.map((row) => {
      const stock = Number(row.stock);
      const reserved = Number(row.reserved);
      return { size: row.size, stock, reserved, available: Math.max(stock - reserved, 0) };
    }));
  } catch (error) {
    console.error('Get product sizes error:', error);
    res.status(500).json({ error: 'Erro ao buscar estoque por tamanho' });
  }
});

// Histórico de movimentações, geral ou de um produto, sempre paginado:
// { data: [{ id, product_id, product_name, size, type, quantity_change,
//   quantity_before, quantity_after, admin_username, created_at }], total, page, pages }
async function sendHistory(req, res, productId) {
  try {
    const { page, limit, offset } = pagination(req.query, 30, 100);
    const where = ['1=1'];
    const params = [];
    if (productId) { where.push('sh.product_id = ?'); params.push(productId); }
    if (req.query.type) {
      if (!HISTORY_TYPES.includes(req.query.type)) {
        return res.status(400).json({ error: `type deve ser um de: ${HISTORY_TYPES.join(', ')}` });
      }
      where.push('sh.type = ?');
      params.push(req.query.type);
    }
    const whereSql = `WHERE ${where.join(' AND ')}`;
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM stock_history sh ${whereSql}`, params);
    const [rows] = await pool.query(
      `SELECT sh.id, sh.product_id, p.name AS product_name, sh.size, sh.type, sh.quantity_change,
         sh.quantity_before, sh.quantity_after, sh.admin_username, sh.order_id, sh.reason, sh.created_at
       FROM stock_history sh LEFT JOIN products p ON p.id = sh.product_id
       ${whereSql}
       ORDER BY sh.created_at DESC, sh.id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    res.json({ data: rows, total: Number(total), page, pages: Math.ceil(Number(total) / limit) });
  } catch (error) {
    console.error('Get stock history error:', error);
    res.status(500).json({ error: 'Erro ao buscar histórico de estoque' });
  }
}

stockRoutes.get('/history', ...requireAdmin, (req, res) => {
  const productId = req.query.product_id ? Number(req.query.product_id) : null;
  if (productId !== null && (!Number.isInteger(productId) || productId < 1)) {
    return res.status(400).json({ error: 'product_id deve ser um inteiro positivo' });
  }
  return sendHistory(req, res, productId);
});

stockRoutes.get('/product/:productId/history', ...requireAdmin, productIdValidation, validateRequest,
  (req, res) => sendHistory(req, res, req.params.productId));

// Aceita um array puro [{size, stock}] ou {sizes: [...]}. Grava só os
// tamanhos enviados (os demais ficam como estão).
stockRoutes.put(
  '/product/:productId/sizes',
  ...requireAdmin,
  productIdValidation,
  validateRequest,
  async (req, res) => {
    let list;
    try {
      const raw = Array.isArray(req.body) ? req.body : req.body?.sizes;
      if (!Array.isArray(raw) || raw.length === 0) {
        return res.status(400).json({ error: 'Envie uma lista de {size, stock} (array ou {sizes: [...]})' });
      }
      list = normalizeSizeStock(raw);
    } catch (error) {
      return res.status(error.status || 400).json({ error: error.message });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [products] = await connection.query('SELECT id FROM products WHERE id = ? FOR UPDATE', [req.params.productId]);
      if (products.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: 'Produto não encontrado' });
      }
      await syncSizeStock(connection, req.params.productId, list, {
        removeMissing: false,
        adminUsername: req.user?.username,
      });
      await connection.commit();
      auditReq(req, 'update_stock', 'product', req.params.productId, { sizes: list });
      notifySubscribers(req.params.productId).catch(() => {});
      res.json({ success: true });
    } catch (error) {
      await connection.rollback();
      console.error('Update product sizes error:', error);
      res.status(500).json({ error: 'Erro ao atualizar estoque por tamanho' });
    } finally {
      connection.release();
    }
  }
);

// Modelo de importação: o mesmo cabeçalho do export, com o estoque atual.
stockRoutes.get('/csv-template', ...requireAdmin, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT ps.product_id, ps.size, ps.stock FROM product_sizes ps
       JOIN products p ON p.id = ps.product_id ORDER BY p.name, ps.product_id, ps.size LIMIT 5`
    );
    const lines = rows.length
      ? rows.map((row) => [row.product_id, row.size, row.stock].map(csvCell).join(','))
      : ['1,40,10'];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="modelo-estoque.csv"');
    res.send(`﻿${CSV_HEADER}\n${lines.join('\n')}`);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao gerar modelo' });
  }
});

stockRoutes.post(
  '/import-csv',
  ...requireAdmin,
  uploadCsv,
  body('_csv').custom((_, { req }) => {
    if (!req.file) throw new Error('Arquivo CSV é obrigatório no campo file');
    return true;
  }),
  validateRequest,
  async (req, res) => {
    const lines = req.file.buffer.toString('utf8')
      .replace(/^﻿/, '')
      .split(/\r?\n/)
      .filter((line) => line.trim() !== '');

    if (lines.length < 1) return res.status(400).json({ error: 'Arquivo CSV vazio' });
    if (lines.length > 1001) {
      return res.status(413).json({ error: 'O arquivo CSV não pode conter mais de 1000 linhas' });
    }

    // Excel em português salva com ponto e vírgula: aceita os dois.
    const delimiter = lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',';
    const header = parseCsvLine(lines[0], delimiter).map((value) => value.toLowerCase()).join(',');
    if (header !== CSV_HEADER) {
      return res.status(400).json({ error: `Cabeçalho esperado: ${CSV_HEADER}` });
    }

    const connection = await pool.getConnection();
    const errors = [];
    const changedProductIds = new Set();
    let imported = 0;
    const fail = (line, reason) => errors.push({ line, reason, message: reason });

    try {
      await connection.beginTransaction();

      for (let index = 1; index < lines.length; index += 1) {
        const lineNumber = index + 1;
        const columns = parseCsvLine(lines[index], delimiter);
        if (columns.length !== 3) {
          fail(lineNumber, 'A linha deve ter product_id,size,stock');
          continue;
        }

        const productId = Number(columns[0]);
        const size = columns[1];
        const stock = Number(columns[2]);
        if (!Number.isInteger(productId) || productId < 1) {
          fail(lineNumber, 'product_id deve ser um inteiro positivo');
          continue;
        }
        if (!size || size.length > 10 || size.includes(',')) {
          fail(lineNumber, 'size é obrigatório, com no máximo 10 caracteres e sem vírgula');
          continue;
        }
        if (!Number.isInteger(stock) || stock < 0 || stock > 100000) {
          fail(lineNumber, 'stock deve ser um inteiro entre 0 e 100000');
          continue;
        }

        const [products] = await connection.query('SELECT id FROM products WHERE id = ? FOR UPDATE', [productId]);
        if (products.length === 0) {
          fail(lineNumber, 'Produto não encontrado');
          continue;
        }

        const [currentRows] = await connection.query(
          'SELECT stock FROM product_sizes WHERE product_id = ? AND size = ? FOR UPDATE',
          [productId, size]
        );
        const quantityBefore = currentRows.length ? Number(currentRows[0].stock) : 0;

        await connection.query(
          `INSERT INTO product_sizes (product_id, size, stock) VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE stock = VALUES(stock)`,
          [productId, size, stock]
        );
        await recordHistory(connection, {
          productId, size, type: 'import', before: quantityBefore, after: stock,
          reason: 'Importação CSV', adminUsername: req.user?.username,
        });
        changedProductIds.add(productId);
        imported += 1;
      }

      for (const productId of changedProductIds) await recalcProduct(connection, productId);

      await connection.commit();
      auditReq(req, 'import_csv', 'stock', null, { imported, errors: errors.length });
      changedProductIds.forEach((productId) => notifySubscribers(productId).catch(() => {}));
      res.json({ imported, errors });
    } catch (error) {
      await connection.rollback();
      console.error('Import stock CSV error:', error);
      res.status(500).json({ error: 'Erro ao importar estoque', imported: 0, errors });
    } finally {
      connection.release();
    }
  }
);

stockRoutes.post(
  '/reserve',
  reserveLimiter,
  body('session_id').isString().trim().notEmpty().withMessage('session_id é obrigatório')
    .isLength({ max: 100 }).withMessage('session_id deve ter no máximo 100 caracteres'),
  body('product_id').isInt({ min: 1 }).withMessage('product_id deve ser um inteiro positivo').toInt(),
  body('size').isString().trim().notEmpty().withMessage('size é obrigatório')
    .isLength({ max: 10 }).withMessage('size deve ter no máximo 10 caracteres'),
  body('quantity').isInt({ min: 1, max: 10 }).withMessage('quantity deve ser um inteiro entre 1 e 10').toInt(),
  validateRequest,
  async (req, res) => {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [[sessionTotal]] = await connection.query(
        `SELECT COALESCE(SUM(quantity), 0) AS reserved FROM cart_reservations
         WHERE session_id = ? AND reserved_until > NOW()`,
        [req.body.session_id]
      );
      if (Number(sessionTotal.reserved) + req.body.quantity > MAX_RESERVED_PER_SESSION) {
        await connection.rollback();
        return res.status(429).json({ error: `Limite de ${MAX_RESERVED_PER_SESSION} unidades reservadas por carrinho` });
      }

      const [stockRows] = await connection.query(
        `SELECT ps.stock FROM product_sizes ps JOIN products p ON p.id = ps.product_id AND p.active = TRUE
         WHERE ps.product_id = ? AND ps.size = ? FOR UPDATE`,
        [req.body.product_id, req.body.size]
      );
      const stock = stockRows.length ? Number(stockRows[0].stock) : 0;
      const [[reservation]] = await connection.query(
        `SELECT COALESCE(SUM(quantity), 0) AS reserved
         FROM cart_reservations
         WHERE product_id = ? AND size = ? AND reserved_until > NOW()`,
        [req.body.product_id, req.body.size]
      );

      if (stock - Number(reservation.reserved) < req.body.quantity) {
        await connection.rollback();
        return res.status(409).json({ error: 'Estoque insuficiente para reserva' });
      }

      const [result] = await connection.query(
        `INSERT INTO cart_reservations
          (session_id, product_id, size, quantity, reserved_until)
         VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE))`,
        [req.body.session_id, req.body.product_id, req.body.size, req.body.quantity]
      );
      const [[created]] = await connection.query(
        'SELECT reserved_until FROM cart_reservations WHERE id = ?',
        [result.insertId]
      );
      await connection.commit();
      res.status(201).json({ success: true, reserved_until: created.reserved_until });
    } catch (error) {
      await connection.rollback();
      console.error('Reserve stock error:', error);
      res.status(500).json({ error: 'Erro ao reservar estoque' });
    } finally {
      connection.release();
    }
  }
);

stockRoutes.delete(
  '/reserve/:sessionId',
  reserveLimiter,
  param('sessionId').isString().trim().notEmpty().isLength({ max: 100 }).withMessage('sessionId inválido'),
  validateRequest,
  async (req, res) => {
    try {
      const [result] = await pool.query('DELETE FROM cart_reservations WHERE session_id = ?', [req.params.sessionId]);
      res.json({ success: true, deleted: result.affectedRows });
    } catch (error) {
      console.error('Delete reservations error:', error);
      res.status(500).json({ error: 'Erro ao remover reservas' });
    }
  }
);

// Produtos ativos no limite ou abaixo. threshold = limite efetivo (o do
// produto em stock_thresholds ou o padrão ?threshold=, 5 se não vier).
stockRoutes.get('/low-stock', ...requireAdmin, async (req, res) => {
  try {
    const threshold = req.query.threshold === undefined ? 5 : Number(req.query.threshold);
    if (!Number.isInteger(threshold) || threshold < 0 || threshold > 9999) {
      return res.status(400).json({ error: 'threshold deve ser um inteiro entre 0 e 9999' });
    }
    const [rows] = await pool.query(
      `SELECT p.id, p.name, p.stock, p.image_url, b.name AS brand,
        COALESCE(st.threshold, ?) AS threshold,
        COALESCE(st.notify_email, '') AS notify_email
       FROM products p
       LEFT JOIN brands b ON p.brand_id = b.id
       LEFT JOIN stock_thresholds st ON p.id = st.product_id
       WHERE p.stock <= COALESCE(st.threshold, ?) AND p.active = 1
       ORDER BY p.stock ASC, p.name ASC`,
      [threshold, threshold]
    );
    res.json(rows.map((row) => ({ ...row, stock: Number(row.stock), threshold: Number(row.threshold) })));
  } catch (error) {
    console.error('Low stock error:', error);
    res.status(500).json({ error: 'Erro ao buscar produtos com estoque baixo' });
  }
});

// Previsão de todos os ativos numa consulta só. Sem venda em 30 dias, a
// estimativa é null e vai para o fim da lista.
stockRoutes.get('/forecast', ...requireAdmin, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.id AS product_id, p.name, b.name AS brand, p.image_url, p.stock,
         COALESCE(s.sold30, 0) / 30 AS avgSalesPerDay30
       FROM products p
       LEFT JOIN brands b ON b.id = p.brand_id
       LEFT JOIN (
         SELECT oi.product_id, SUM(oi.quantity) AS sold30
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
         WHERE o.status <> 'cancelled' AND o.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
         GROUP BY oi.product_id
       ) s ON s.product_id = p.id
       WHERE p.active = TRUE`
    );
    const data = rows.map((row) => {
      const stock = Number(row.stock) || 0;
      const avg = Math.round(Number(row.avgSalesPerDay30) * 1000) / 1000;
      return {
        product_id: row.product_id,
        name: row.name,
        brand: row.brand,
        image_url: row.image_url,
        stock,
        avgSalesPerDay30: avg,
        estimatedDaysLeft30: avg > 0 ? Math.round((stock / avg) * 10) / 10 : null,
      };
    });
    data.sort((a, b) => {
      if (a.estimatedDaysLeft30 === null && b.estimatedDaysLeft30 === null) return a.name.localeCompare(b.name);
      if (a.estimatedDaysLeft30 === null) return 1;
      if (b.estimatedDaysLeft30 === null) return -1;
      return a.estimatedDaysLeft30 - b.estimatedDaysLeft30;
    });
    res.json(data);
  } catch (error) {
    console.error('Stock forecast error:', error);
    res.status(500).json({ error: 'Erro ao calcular previsão de estoque' });
  }
});

stockRoutes.get('/forecast/:productId', ...requireAdmin, productIdValidation, validateRequest, async (req, res) => {
  try {
    const [products] = await pool.query('SELECT stock FROM products WHERE id = ?', [req.params.productId]);
    if (products.length === 0) return res.status(404).json({ error: 'Produto não encontrado' });

    const [[sales]] = await pool.query(
      `SELECT
        COALESCE(SUM(CASE WHEN o.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
          AND o.status <> 'cancelled' THEN oi.quantity ELSE 0 END), 0) / 30 AS avg30,
        COALESCE(SUM(CASE WHEN o.created_at >= DATE_SUB(NOW(), INTERVAL 60 DAY)
          AND o.status <> 'cancelled' THEN oi.quantity ELSE 0 END), 0) / 60 AS avg60
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.id
       WHERE oi.product_id = ?`,
      [req.params.productId]
    );
    const currentStock = Number(products[0].stock);
    const avgSalesPerDay30 = Number(sales.avg30);
    const avgSalesPerDay60 = Number(sales.avg60);
    res.json({
      avgSalesPerDay30,
      avgSalesPerDay60,
      currentStock,
      estimatedDaysLeft30: avgSalesPerDay30 > 0 ? currentStock / avgSalesPerDay30 : null,
      estimatedDaysLeft60: avgSalesPerDay60 > 0 ? currentStock / avgSalesPerDay60 : null,
    });
  } catch (error) {
    console.error('Stock forecast error:', error);
    res.status(500).json({ error: 'Erro ao calcular previsão de estoque' });
  }
});

// Limite de alerta do produto. Aceita notify_email (ou email, nome antigo).
stockRoutes.put(
  '/threshold/:productId',
  ...requireAdmin,
  productIdValidation,
  body('threshold').isInt({ min: 0, max: 9999 }).withMessage('threshold deve ser um inteiro entre 0 e 9999').toInt(),
  body('notify_email').optional({ nullable: true, checkFalsy: true }).isEmail().withMessage('notify_email inválido').normalizeEmail(),
  body('email').optional({ nullable: true, checkFalsy: true }).isEmail().withMessage('email inválido').normalizeEmail(),
  validateRequest,
  async (req, res) => {
    try {
      const [products] = await pool.query('SELECT id FROM products WHERE id = ?', [req.params.productId]);
      if (products.length === 0) return res.status(404).json({ error: 'Produto não encontrado' });
      const notifyEmail = req.body.notify_email || req.body.email || null;
      await pool.query(
        `INSERT INTO stock_thresholds (product_id, threshold, notify_email) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE threshold = VALUES(threshold), notify_email = VALUES(notify_email)`,
        [req.params.productId, req.body.threshold, notifyEmail]
      );
      auditReq(req, 'update_threshold', 'product', req.params.productId, { threshold: req.body.threshold, notify_email: notifyEmail });
      res.json({ success: true });
    } catch (error) {
      console.error('Update stock threshold error:', error);
      res.status(500).json({ error: 'Erro ao atualizar alerta de estoque' });
    }
  }
);

stockRoutes.get('/export-csv', ...requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT ps.product_id, ps.size, ps.stock
       FROM product_sizes ps
       JOIN products p ON p.id = ps.product_id
       ORDER BY p.name, ps.product_id, ps.size`
    );
    const csv = `${CSV_HEADER}\n` + rows.map((row) => [row.product_id, row.size, row.stock].map(csvCell).join(',')).join('\n');
    auditReq(req, 'export_csv', 'stock', null, { rows: rows.length });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="estoque.csv"');
    res.send(`﻿${csv}`);
  } catch (error) {
    console.error('Export stock CSV error:', error);
    res.status(500).json({ error: 'Erro ao exportar estoque' });
  }
});

supplierRoutes.use(...requireAdmin);

// ?all=1 traz também os inativos.
supplierRoutes.get('/', async (req, res) => {
  try {
    const all = req.query.all === '1';
    const [rows] = await pool.query(`SELECT * FROM suppliers ${all ? '' : 'WHERE active = 1'} ORDER BY name`);
    res.json(rows.map((row) => ({ ...row, active: Boolean(row.active) })));
  } catch (error) {
    console.error('Get suppliers error:', error);
    res.status(500).json({ error: 'Erro ao buscar fornecedores' });
  }
});

// lead_days é o nome do campo; lead_time_days (nome antigo do admin) também vale.
function leadDaysAlias(req, _res, next) {
  if (req.body && req.body.lead_days === undefined && req.body.lead_time_days !== undefined) {
    req.body.lead_days = req.body.lead_time_days;
  }
  next();
}

const supplierValidations = [
  leadDaysAlias,
  body('name').isString().trim().notEmpty().withMessage('name é obrigatório')
    .isLength({ max: 255 }).withMessage('name deve ter no máximo 255 caracteres'),
  body('contact_name').optional({ nullable: true }).isString().trim().isLength({ max: 255 }),
  body('email').optional({ nullable: true, checkFalsy: true }).isEmail().withMessage('email inválido').normalizeEmail(),
  body('phone').optional({ nullable: true }).isString().trim().isLength({ max: 50 }),
  body('lead_days').optional({ nullable: true, checkFalsy: true }).isInt({ min: 0, max: 3650 })
    .withMessage('lead_days deve ser um inteiro entre 0 e 3650').toInt(),
  body('notes').optional({ nullable: true }).isString().trim().isLength({ max: 5000 }),
  body('active').optional().custom((value) => toBool(value) !== undefined).withMessage('active deve ser booleano'),
];

supplierRoutes.post('/', supplierValidations, validateRequest, async (req, res) => {
  try {
    const { name, contact_name, email, phone, lead_days = 7, notes } = req.body;
    const active = req.body.active === undefined ? true : toBool(req.body.active);
    const [result] = await pool.query(
      `INSERT INTO suppliers (name, contact_name, email, phone, lead_days, notes, active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, contact_name || null, email || null, phone || null, lead_days || 0, notes || null, active]
    );
    auditReq(req, 'create', 'supplier', result.insertId, { name });
    res.status(201).json({ id: result.insertId, success: true });
  } catch (error) {
    console.error('Create supplier error:', error);
    res.status(500).json({ error: 'Erro ao criar fornecedor' });
  }
});

supplierRoutes.put(
  '/:id',
  param('id').isInt({ min: 1 }).withMessage('id deve ser um inteiro positivo').toInt(),
  supplierValidations,
  validateRequest,
  async (req, res) => {
    try {
      const { name, contact_name, email, phone, lead_days = 7, notes } = req.body;
      const active = req.body.active === undefined ? null : toBool(req.body.active);
      const [result] = await pool.query(
        `UPDATE suppliers SET name = ?, contact_name = ?, email = ?, phone = ?, lead_days = ?, notes = ?,
           active = COALESCE(?, active)
         WHERE id = ?`,
        [name, contact_name || null, email || null, phone || null, lead_days || 0, notes || null, active, req.params.id]
      );
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Fornecedor não encontrado' });
      auditReq(req, 'update', 'supplier', req.params.id, { name, active });
      res.json({ success: true });
    } catch (error) {
      console.error('Update supplier error:', error);
      res.status(500).json({ error: 'Erro ao atualizar fornecedor' });
    }
  }
);

supplierRoutes.delete(
  '/:id',
  param('id').isInt({ min: 1 }).withMessage('id deve ser um inteiro positivo').toInt(),
  validateRequest,
  async (req, res) => {
    try {
      const [result] = await pool.query('UPDATE suppliers SET active = 0 WHERE id = ?', [req.params.id]);
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Fornecedor não encontrado' });
      auditReq(req, 'deactivate', 'supplier', req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Delete supplier error:', error);
      res.status(500).json({ error: 'Erro ao remover fornecedor' });
    }
  }
);

module.exports = { stockRoutes, supplierRoutes };
