const express = require('express');
const multer = require('multer');
const { body, param, validationResult } = require('express-validator');
const { pool } = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

const stockRoutes = express.Router();
const supplierRoutes = express.Router();

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

function validateRequest(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Dados inválidos',
      details: errors.array().map(({ path, msg }) => ({ field: path, message: msg })),
    });
  }
  next();
}

const productIdValidation = param('productId')
  .isInt({ min: 1 })
  .withMessage('productId deve ser um inteiro positivo')
  .toInt();

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

stockRoutes.get('/product/:productId/sizes', productIdValidation, validateRequest, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT ps.size, ps.stock,
        COALESCE((SELECT SUM(quantity) FROM cart_reservations
          WHERE product_id = ps.product_id AND size = ps.size AND reserved_until > NOW()), 0) AS reserved
       FROM product_sizes ps WHERE ps.product_id = ?
       ORDER BY CAST(ps.size AS UNSIGNED), ps.size`,
      [req.params.productId]
    );

    res.json(rows.map((row) => {
      const stock = Number(row.stock);
      const reserved = Number(row.reserved);
      return { size: row.size, stock, reserved, available: stock - reserved };
    }));
  } catch (error) {
    console.error('Get product sizes error:', error);
    res.status(500).json({ error: 'Erro ao buscar estoque por tamanho' });
  }
});

stockRoutes.get('/product/:productId/history', authMiddleware, productIdValidation, validateRequest, async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const [rows] = await pool.query(
      'SELECT * FROM stock_history WHERE product_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [req.params.productId, limit, offset]
    );
    res.json(rows);
  } catch (error) {
    console.error('Get stock history error:', error);
    res.status(500).json({ error: 'Erro ao buscar histórico de estoque' });
  }
});

stockRoutes.put(
  '/product/:productId/sizes',
  authMiddleware,
  productIdValidation,
  body().isArray({ min: 1 }).withMessage('O body deve ser um array não vazio')
    .custom((items) => {
      const sizes = items.map((item) => String(item?.size ?? '').trim());
      if (new Set(sizes).size !== sizes.length) throw new Error('Tamanhos duplicados não são permitidos');
      return true;
    }),
  body('*.size').isString().trim().notEmpty().withMessage('size é obrigatório')
    .isLength({ max: 10 }).withMessage('size deve ter no máximo 10 caracteres'),
  body('*.stock').isInt({ min: 0 }).withMessage('stock deve ser um inteiro maior ou igual a zero').toInt(),
  validateRequest,
  async (req, res) => {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [products] = await connection.query('SELECT id FROM products WHERE id = ? FOR UPDATE', [req.params.productId]);
      if (products.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: 'Produto não encontrado' });
      }

      for (const item of req.body) {
        const [currentRows] = await connection.query(
          'SELECT stock FROM product_sizes WHERE product_id = ? AND size = ? FOR UPDATE',
          [req.params.productId, item.size]
        );
        const quantityBefore = currentRows.length ? Number(currentRows[0].stock) : 0;

        await connection.query(
          `INSERT INTO product_sizes (product_id, size, stock) VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE stock = VALUES(stock)`,
          [req.params.productId, item.size, item.stock]
        );
        await connection.query(
          `INSERT INTO stock_history
            (product_id, size, type, quantity_change, quantity_before, quantity_after, reason, admin_username)
           VALUES (?, ?, 'adjustment', ?, ?, ?, ?, ?)`,
          [
            req.params.productId,
            item.size,
            item.stock - quantityBefore,
            quantityBefore,
            item.stock,
            'Ajuste manual de estoque',
            req.user?.username || 'admin',
          ]
        );
      }

      await connection.query(
        `UPDATE products SET stock = (
          SELECT COALESCE(SUM(stock), 0) FROM product_sizes WHERE product_id = ?
        ) WHERE id = ?`,
        [req.params.productId, req.params.productId]
      );
      await connection.commit();
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

stockRoutes.post(
  '/import-csv',
  authMiddleware,
  uploadCsv,
  body('_csv').custom((_, { req }) => {
    if (!req.file) throw new Error('Arquivo CSV é obrigatório no campo file');
    return true;
  }),
  validateRequest,
  async (req, res) => {
    const lines = req.file.buffer.toString('utf8')
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .filter((line) => line.trim() !== '');

    if (lines.length < 1) return res.status(400).json({ error: 'Arquivo CSV vazio' });
    if (lines.length > 1000) {
      return res.status(413).json({ error: 'O arquivo CSV não pode conter mais de 1000 linhas' });
    }

    const header = lines[0].split(',').map((value) => value.trim().toLowerCase());
    if (header.join(',') !== 'product_id,size,stock') {
      return res.status(400).json({ error: 'Cabeçalho esperado: product_id,size,stock' });
    }

    const connection = await pool.getConnection();
    const errors = [];
    const changedProductIds = new Set();
    let imported = 0;

    try {
      await connection.beginTransaction();

      for (let index = 1; index < lines.length; index += 1) {
        const lineNumber = index + 1;
        const columns = lines[index].split(',').map((value) => value.trim());
        if (columns.length !== 3) {
          errors.push({ line: lineNumber, reason: 'A linha deve ter product_id,size,stock' });
          continue;
        }

        const productId = Number(columns[0]);
        const size = columns[1];
        const stock = Number(columns[2]);
        if (!Number.isInteger(productId) || productId < 1) {
          errors.push({ line: lineNumber, reason: 'product_id deve ser um inteiro positivo' });
          continue;
        }
        if (!size || size.length > 10) {
          errors.push({ line: lineNumber, reason: 'size é obrigatório e deve ter no máximo 10 caracteres' });
          continue;
        }
        if (!Number.isInteger(stock) || stock < 0) {
          errors.push({ line: lineNumber, reason: 'stock deve ser um inteiro maior ou igual a zero' });
          continue;
        }

        const [products] = await connection.query('SELECT id FROM products WHERE id = ? FOR UPDATE', [productId]);
        if (products.length === 0) {
          errors.push({ line: lineNumber, reason: 'Produto não encontrado' });
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
        await connection.query(
          `INSERT INTO stock_history
            (product_id, size, type, quantity_change, quantity_before, quantity_after, reason, admin_username)
           VALUES (?, ?, 'import', ?, ?, ?, ?, ?)`,
          [
            productId,
            size,
            stock - quantityBefore,
            quantityBefore,
            stock,
            'Importação CSV',
            req.user?.username || 'admin',
          ]
        );
        changedProductIds.add(productId);
        imported += 1;
      }

      for (const productId of changedProductIds) {
        await connection.query(
          `UPDATE products SET stock = (
            SELECT COALESCE(SUM(stock), 0) FROM product_sizes WHERE product_id = ?
          ) WHERE id = ?`,
          [productId, productId]
        );
      }

      await connection.commit();
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
  body('session_id').isString().trim().notEmpty().withMessage('session_id é obrigatório')
    .isLength({ max: 100 }).withMessage('session_id deve ter no máximo 100 caracteres'),
  body('product_id').isInt({ min: 1 }).withMessage('product_id deve ser um inteiro positivo').toInt(),
  body('size').isString().trim().notEmpty().withMessage('size é obrigatório')
    .isLength({ max: 10 }).withMessage('size deve ter no máximo 10 caracteres'),
  body('quantity').isInt({ min: 1 }).withMessage('quantity deve ser um inteiro maior ou igual a 1').toInt(),
  validateRequest,
  async (req, res) => {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [stockRows] = await connection.query(
        'SELECT stock FROM product_sizes WHERE product_id = ? AND size = ? FOR UPDATE',
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

stockRoutes.get('/low-stock', authMiddleware, async (req, res) => {
  try {
    const threshold = req.query.threshold === undefined ? 5 : Number(req.query.threshold);
    if (!Number.isInteger(threshold) || threshold < 1 || threshold > 9999) {
      return res.status(400).json({ error: 'threshold deve ser um inteiro entre 1 e 9999' });
    }
    const [rows] = await pool.query(
      `SELECT p.id, p.name, p.stock, b.name AS brand,
        COALESCE(st.threshold, ?) AS threshold,
        COALESCE(st.notify_email, '') AS notify_email
       FROM products p
       LEFT JOIN brands b ON p.brand_id = b.id
       LEFT JOIN stock_thresholds st ON p.id = st.product_id
       WHERE p.stock <= COALESCE(st.threshold, ?) AND p.active = 1
       ORDER BY p.stock ASC`,
      [threshold, threshold]
    );
    res.json(rows);
  } catch (error) {
    console.error('Low stock error:', error);
    res.status(500).json({ error: 'Erro ao buscar produtos com estoque baixo' });
  }
});

stockRoutes.get('/forecast/:productId', authMiddleware, productIdValidation, validateRequest, async (req, res) => {
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

stockRoutes.put(
  '/threshold/:productId',
  authMiddleware,
  productIdValidation,
  body('threshold').isInt({ min: 1, max: 9999 }).withMessage('threshold deve ser um inteiro entre 1 e 9999').toInt(),
  body('notify_email').optional({ nullable: true, checkFalsy: true }).isEmail().withMessage('notify_email inválido').normalizeEmail(),
  validateRequest,
  async (req, res) => {
    try {
      const [products] = await pool.query('SELECT id FROM products WHERE id = ?', [req.params.productId]);
      if (products.length === 0) return res.status(404).json({ error: 'Produto não encontrado' });
      await pool.query(
        `INSERT INTO stock_thresholds (product_id, threshold, notify_email) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE threshold = VALUES(threshold), notify_email = VALUES(notify_email)`,
        [req.params.productId, req.body.threshold, req.body.notify_email || null]
      );
      res.json({ success: true });
    } catch (error) {
      console.error('Update stock threshold error:', error);
      res.status(500).json({ error: 'Erro ao atualizar alerta de estoque' });
    }
  }
);

stockRoutes.get('/export-csv', authMiddleware, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.id, p.name, ps.size, ps.stock, COALESCE(st.threshold, 5) AS threshold
       FROM products p
       JOIN product_sizes ps ON p.id = ps.product_id
       LEFT JOIN stock_thresholds st ON p.id = st.product_id
       ORDER BY p.name, ps.size`
    );
    const header = 'product_id,product_name,size,stock,threshold\n';
    const csv = header + rows.map((row) => [
      row.id, row.name, row.size, row.stock, row.threshold,
    ].map(csvCell).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="estoque.csv"');
    res.send(`\uFEFF${csv}`);
  } catch (error) {
    console.error('Export stock CSV error:', error);
    res.status(500).json({ error: 'Erro ao exportar estoque' });
  }
});

supplierRoutes.use(authMiddleware);

supplierRoutes.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM suppliers WHERE active = 1 ORDER BY name');
    res.json(rows);
  } catch (error) {
    console.error('Get suppliers error:', error);
    res.status(500).json({ error: 'Erro ao buscar fornecedores' });
  }
});

const supplierValidations = [
  body('name').isString().trim().notEmpty().withMessage('name é obrigatório')
    .isLength({ max: 255 }).withMessage('name deve ter no máximo 255 caracteres'),
  body('contact_name').optional({ nullable: true }).isString().trim().isLength({ max: 255 }),
  body('email').optional({ nullable: true, checkFalsy: true }).isEmail().withMessage('email inválido').normalizeEmail(),
  body('phone').optional({ nullable: true }).isString().trim().isLength({ max: 50 }),
  body('lead_days').optional().isInt({ min: 0, max: 3650 }).withMessage('lead_days deve ser um inteiro entre 0 e 3650').toInt(),
  body('notes').optional({ nullable: true }).isString().trim(),
];

supplierRoutes.post('/', supplierValidations, validateRequest, async (req, res) => {
  try {
    const { name, contact_name, email, phone, lead_days = 7, notes } = req.body;
    const [result] = await pool.query(
      `INSERT INTO suppliers (name, contact_name, email, phone, lead_days, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, contact_name || null, email || null, phone || null, lead_days, notes || null]
    );
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
      const [result] = await pool.query(
        `UPDATE suppliers SET name = ?, contact_name = ?, email = ?, phone = ?, lead_days = ?, notes = ?
         WHERE id = ?`,
        [name, contact_name || null, email || null, phone || null, lead_days, notes || null, req.params.id]
      );
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Fornecedor não encontrado' });
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
      res.json({ success: true });
    } catch (error) {
      console.error('Delete supplier error:', error);
      res.status(500).json({ error: 'Erro ao remover fornecedor' });
    }
  }
);

module.exports = { stockRoutes, supplierRoutes };
