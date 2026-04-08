const { pool } = require('../config/db');

const orderController = {
  async getAll(req, res) {
    try {
      const [orders] = await pool.query(
        `SELECT o.*, 
          (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count
         FROM orders o ORDER BY o.created_at DESC`
      );
      res.json(orders);
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar pedidos' });
    }
  },

  async getById(req, res) {
    try {
      const [order] = await pool.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);
      if (order.length === 0) return res.status(404).json({ error: 'Pedido não encontrado' });

      const [items] = await pool.query(
        `SELECT oi.*, p.name as product_name, p.image_url 
         FROM order_items oi 
         LEFT JOIN products p ON oi.product_id = p.id 
         WHERE oi.order_id = ?`,
        [req.params.id]
      );

      res.json({ ...order[0], items });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar pedido' });
    }
  },

  async updateStatus(req, res) {
    try {
      const { status } = req.body;
      const valid = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
      if (!valid.includes(status)) return res.status(400).json({ error: 'Status inválido' });

      await pool.query('UPDATE orders SET status = ? WHERE id = ?', [status, req.params.id]);
      res.json({ message: 'Status atualizado' });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao atualizar status' });
    }
  },

  async delete(req, res) {
    try {
      await pool.query('DELETE FROM order_items WHERE order_id = ?', [req.params.id]);
      await pool.query('DELETE FROM orders WHERE id = ?', [req.params.id]);
      res.json({ message: 'Pedido removido' });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao remover pedido' });
    }
  }
};

module.exports = orderController;
