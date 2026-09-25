const { pool } = require('../config/db');
const { sendEmail, stockAlertEmail } = require('../services/emailService');
const { withEffectiveDiscount } = require('../utils/pricing');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const stockAlertController = {
  // Pedido de "avise-me". Com size, vale para aquele tamanho; sem size, para
  // o produto como um todo.
  async subscribe(req, res) {
    try {
      const { product_id } = req.body;
      const email = String(req.body.email || '').toLowerCase().trim();
      const size = req.body.size === undefined || req.body.size === null ? '' : String(req.body.size).trim();
      const productId = Number(product_id);
      if (!Number.isInteger(productId) || productId < 1 || !email) {
        return res.status(400).json({ error: 'product_id e email são obrigatórios' });
      }
      if (email.length > 255 || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'E-mail inválido' });
      if (size.length > 10) return res.status(400).json({ error: 'Tamanho inválido' });

      const [product] = await pool.query('SELECT id, name, stock FROM products WHERE id=? AND active=1', [productId]);
      if (product.length === 0) return res.status(404).json({ error: 'Produto não encontrado' });

      if (size) {
        const [rows] = await pool.query(
          `SELECT ps.stock - COALESCE((SELECT SUM(quantity) FROM cart_reservations cr
             WHERE cr.product_id = ps.product_id AND cr.size = ps.size AND cr.reserved_until > NOW()), 0) AS available
           FROM product_sizes ps WHERE ps.product_id = ? AND ps.size = ?`,
          [productId, size]
        );
        if (rows.length && Number(rows[0].available) > 0) {
          return res.status(400).json({ error: 'Esse tamanho já está disponível!' });
        }
      } else if (Number(product[0].stock) > 0) {
        return res.status(400).json({ error: 'Produto já está disponível!' });
      }

      await pool.query(
        'INSERT IGNORE INTO stock_alerts (product_id, email, size) VALUES (?, ?, ?)',
        [productId, email, size]
      );

      res.status(201).json({ message: 'Aviso criado! Te avisaremos quando o produto voltar ao estoque.' });
    } catch (error) {
      console.error('Stock alert subscribe error:', error);
      res.status(500).json({ error: 'Erro ao criar aviso de estoque' });
    }
  },

  // Chamado depois de qualquer mudança de estoque (fora de transação). Olha o
  // estado atual: aviso do produto sai se o total passou de zero; aviso de
  // tamanho sai se aquele tamanho tem estoque.
  async notifySubscribers(productId) {
    try {
      const [alerts] = await pool.query(
        'SELECT * FROM stock_alerts WHERE product_id=? AND notified=0',
        [productId]
      );
      if (alerts.length === 0) return;

      const [products] = await pool.query('SELECT * FROM products WHERE id=? AND active=1', [productId]);
      if (products.length === 0) return;
      const product = withEffectiveDiscount(products[0]);

      const [sizeRows] = await pool.query('SELECT size, stock FROM product_sizes WHERE product_id=?', [productId]);
      const sizeStock = new Map(sizeRows.map((row) => [row.size, Number(row.stock)]));
      const total = Number(product.stock) || 0;

      let sent = 0;
      for (const alert of alerts) {
        const available = alert.size ? (sizeStock.get(alert.size) || 0) > 0 : total > 0;
        if (!available) continue;
        // Marca antes de enviar: se o e-mail falhar, o aviso não repete em loop.
        const [marked] = await pool.query('UPDATE stock_alerts SET notified=1 WHERE id=? AND notified=0', [alert.id]);
        if (marked.affectedRows !== 1) continue;
        const template = stockAlertEmail(alert.email, product);
        await sendEmail(alert.email, template);
        sent += 1;
      }
      if (sent) console.log(`[StockAlert] Notificados ${sent} inscritos para produto #${productId}`);
    } catch (error) {
      console.error('[StockAlert] Erro ao notificar:', error.message);
    }
  },

  // Admin: pedidos de "avise-me" (os que ainda esperam primeiro).
  async getAll(req, res) {
    try {
      const params = [];
      let where = 'WHERE 1=1';
      if (req.query.notified === '0' || req.query.notified === '1') {
        where += ' AND sa.notified = ?';
        params.push(Number(req.query.notified));
      }
      const [rows] = await pool.query(
        `SELECT sa.id, sa.product_id, p.name AS product_name, NULLIF(sa.size, '') AS size,
           sa.email, sa.notified, sa.created_at, p.stock AS current_stock
         FROM stock_alerts sa
         LEFT JOIN products p ON sa.product_id = p.id
         ${where}
         ORDER BY sa.notified ASC, sa.created_at DESC
         LIMIT 1000`,
        params
      );
      res.json(rows.map((row) => ({ ...row, notified: Boolean(row.notified), current_stock: Number(row.current_stock) || 0 })));
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar avisos' });
    }
  },
};

module.exports = stockAlertController;
