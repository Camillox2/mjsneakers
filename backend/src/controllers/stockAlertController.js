const { pool } = require('../config/db');
const { sendEmail, stockAlertEmail } = require('../services/emailService');

const stockAlertController = {
  async subscribe(req, res) {
    try {
      const { product_id, email } = req.body;
      if (!product_id || !email) return res.status(400).json({ error: 'product_id e email são obrigatórios' });

      const [product] = await pool.query('SELECT id, name, stock FROM products WHERE id=? AND active=1', [product_id]);
      if (product.length === 0) return res.status(404).json({ error: 'Produto não encontrado' });
      if (product[0].stock > 0) return res.status(400).json({ error: 'Produto já está disponível!' });

      await pool.query(
        'INSERT IGNORE INTO stock_alerts (product_id, email) VALUES (?, ?)',
        [product_id, email.toLowerCase().trim()]
      );

      res.status(201).json({ message: 'Aviso criado! Te avisaremos quando o produto voltar ao estoque.' });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao criar aviso de estoque' });
    }
  },

  // Chamado internamente quando estoque é reposto
  async notifySubscribers(productId) {
    try {
      const [alerts] = await pool.query(
        'SELECT * FROM stock_alerts WHERE product_id=? AND notified=0',
        [productId]
      );
      if (alerts.length === 0) return;

      const [products] = await pool.query('SELECT * FROM products WHERE id=?', [productId]);
      if (products.length === 0) return;

      for (const alert of alerts) {
        const template = stockAlertEmail(alert.email, products[0]);
        await sendEmail(alert.email, template);
        await pool.query('UPDATE stock_alerts SET notified=1 WHERE id=?', [alert.id]);
      }
      console.log(`[StockAlert] Notificados ${alerts.length} inscritos para produto #${productId}`);
    } catch (error) {
      console.error('[StockAlert] Erro ao notificar:', error.message);
    }
  },

  async getAll(req, res) {
    try {
      const [rows] = await pool.query(
        `SELECT sa.*, p.name as product_name, p.stock as current_stock
         FROM stock_alerts sa
         LEFT JOIN products p ON sa.product_id = p.id
         ORDER BY sa.created_at DESC`
      );
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar avisos' });
    }
  },
};

module.exports = stockAlertController;
