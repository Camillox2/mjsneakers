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

  // Public: create order (checkout)
  async create(req, res) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const {
        customer_name, customer_email, customer_phone,
        items, // [{ product_id, quantity, size, price }]
        coupon_code, discount_amount,
        shipping_price, shipping_type,
        address_street, address_number, address_complement,
        address_neighborhood, address_city, address_state, address_cep
      } = req.body;

      if (!customer_name || !customer_phone || !items || items.length === 0) {
        await conn.rollback();
        return res.status(400).json({ error: 'Dados do cliente e itens são obrigatórios' });
      }

      // Validate stock for each item
      for (const item of items) {
        const [product] = await conn.query(
          'SELECT id, name, stock, price FROM products WHERE id = ? AND active = TRUE FOR UPDATE',
          [item.product_id]
        );
        if (product.length === 0) {
          await conn.rollback();
          return res.status(400).json({ error: `Produto #${item.product_id} não encontrado` });
        }
        if (product[0].stock < item.quantity) {
          await conn.rollback();
          return res.status(400).json({ error: `Estoque insuficiente para ${product[0].name}. Disponível: ${product[0].stock}` });
        }
      }

      // Calculate total
      const itemsTotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const total = itemsTotal - (discount_amount || 0) + (shipping_price || 0);

      // Create order
      const [orderResult] = await conn.query(
        `INSERT INTO orders (customer_name, customer_email, customer_phone, total, coupon_code, discount_amount, shipping_price, shipping_type, address_street, address_number, address_complement, address_neighborhood, address_city, address_state, address_cep)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [customer_name, customer_email, customer_phone, total, coupon_code || null, discount_amount || 0, shipping_price || 0, shipping_type || null, address_street, address_number, address_complement, address_neighborhood, address_city, address_state, address_cep]
      );

      const orderId = orderResult.insertId;

      // Insert items and decrement stock
      for (const item of items) {
        await conn.query(
          'INSERT INTO order_items (order_id, product_id, quantity, size, price) VALUES (?, ?, ?, ?, ?)',
          [orderId, item.product_id, item.quantity, item.size, item.price]
        );
        await conn.query(
          'UPDATE products SET stock = stock - ? WHERE id = ?',
          [item.quantity, item.product_id]
        );
      }

      // Increment coupon usage
      if (coupon_code) {
        await conn.query(
          'UPDATE coupons SET used_count = used_count + 1 WHERE code = ?',
          [coupon_code.toUpperCase()]
        );
      }

      await conn.commit();

      res.status(201).json({
        id: orderId,
        total,
        message: 'Pedido criado com sucesso!'
      });
    } catch (error) {
      await conn.rollback();
      console.error('Checkout error:', error);
      res.status(500).json({ error: 'Erro ao criar pedido' });
    } finally {
      conn.release();
    }
  },

  async updateStatus(req, res) {
    try {
      const { status } = req.body;
      const valid = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
      if (!valid.includes(status)) return res.status(400).json({ error: 'Status inválido' });

      // If cancelling, restore stock
      if (status === 'cancelled') {
        const [currentOrder] = await pool.query('SELECT status FROM orders WHERE id = ?', [req.params.id]);
        if (currentOrder.length > 0 && currentOrder[0].status !== 'cancelled') {
          const [items] = await pool.query('SELECT product_id, quantity FROM order_items WHERE order_id = ?', [req.params.id]);
          for (const item of items) {
            await pool.query('UPDATE products SET stock = stock + ? WHERE id = ?', [item.quantity, item.product_id]);
          }
        }
      }

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
