const { pool } = require('../config/db');
const { sendEmail, orderConfirmationEmail, adminNewOrderEmail, orderStatusEmail } = require('../services/emailService');

const orderController = {
  async getAll(req, res) {
    try {
      const { status, search, page, limit: rawLimit } = req.query;
      const limit = Math.min(100, Math.max(1, parseInt(rawLimit) || 50));
      const offset = (Math.max(1, parseInt(page) || 1) - 1) * limit;

      let where = 'WHERE 1=1';
      const params = [];
      if (status) { where += ' AND o.status = ?'; params.push(status); }
      if (search) {
        where += ' AND (o.customer_name LIKE ? OR o.customer_email LIKE ? OR o.id = ?)';
        const t = `%${search}%`;
        params.push(t, t, parseInt(search) || 0);
      }

      const [[{ total }]] = await pool.query(
        `SELECT COUNT(*) as total FROM orders o ${where}`, params
      );

      const [orders] = await pool.query(
        `SELECT o.*,
           (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count
         FROM orders o ${where}
         ORDER BY o.created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );

      res.json({ data: orders, total, page: parseInt(page) || 1, pages: Math.ceil(total / limit) });
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

      const [notes] = await pool.query(
        'SELECT * FROM order_notes WHERE order_id = ? ORDER BY created_at ASC',
        [req.params.id]
      );

      res.json({ ...order[0], items, notes });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar pedido' });
    }
  },

  // Rastreamento público
  async track(req, res) {
    try {
      const { id, email } = req.query;
      if (!id || !email) return res.status(400).json({ error: 'id e email são obrigatórios' });

      const [orders] = await pool.query(
        'SELECT id, customer_name, status, tracking_code, total, shipping_type, created_at, address_city, address_state FROM orders WHERE id = ? AND customer_email = ?',
        [parseInt(id), email.toLowerCase().trim()]
      );
      if (orders.length === 0) return res.status(404).json({ error: 'Pedido não encontrado. Verifique o número e o e-mail.' });

      const order = orders[0];
      const [items] = await pool.query(
        `SELECT oi.quantity, oi.size, oi.price, p.name as product_name, p.image_url
         FROM order_items oi
         LEFT JOIN products p ON oi.product_id = p.id
         WHERE oi.order_id = ?`,
        [order.id]
      );

      res.json({ ...order, items });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao rastrear pedido' });
    }
  },

  async create(req, res) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const {
        customer_name, customer_email, customer_phone,
        items,
        coupon_code, discount_amount,
        shipping_price, shipping_type,
        address_street, address_number, address_complement,
        address_neighborhood, address_city, address_state, address_cep
      } = req.body;

      if (!customer_name || !customer_phone || !items || items.length === 0) {
        await conn.rollback();
        return res.status(400).json({ error: 'Dados do cliente e itens são obrigatórios' });
      }

      // Validate stock
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

      const itemsTotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const total = itemsTotal - (discount_amount || 0) + (shipping_price || 0);

      const [orderResult] = await conn.query(
        `INSERT INTO orders
           (customer_name, customer_email, customer_phone, total, coupon_code, discount_amount,
            shipping_price, shipping_type, address_street, address_number, address_complement,
            address_neighborhood, address_city, address_state, address_cep)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          customer_name, customer_email || null, customer_phone, total,
          coupon_code || null, discount_amount || 0, shipping_price || 0, shipping_type || null,
          address_street, address_number, address_complement,
          address_neighborhood, address_city, address_state, address_cep
        ]
      );

      const orderId = orderResult.insertId;
      const itemsWithNames = [];

      for (const item of items) {
        const [p] = await conn.query('SELECT name FROM products WHERE id=?', [item.product_id]);
        await conn.query(
          'INSERT INTO order_items (order_id, product_id, quantity, size, price) VALUES (?, ?, ?, ?, ?)',
          [orderId, item.product_id, item.quantity, item.size, item.price]
        );
        await conn.query(
          'UPDATE products SET stock = stock - ? WHERE id = ?',
          [item.quantity, item.product_id]
        );
        itemsWithNames.push({ name: p[0]?.name || 'Produto', quantity: item.quantity, price: item.price });
      }

      // Increment coupon usage
      if (coupon_code) {
        await conn.query(
          'UPDATE coupons SET used_count = used_count + 1 WHERE code = ?',
          [coupon_code.toUpperCase()]
        );
      }

      await conn.commit();
      res.status(201).json({ id: orderId, total, message: 'Pedido criado com sucesso!' });
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
      await pool.query('UPDATE orders SET status = ? WHERE id = ?', [status, req.params.id]);
      res.json({ message: 'Status atualizado' });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao atualizar status' });
    }
  },

  async updateTracking(req, res) {
    try {
      const { tracking_code } = req.body;
      await pool.query('UPDATE orders SET tracking_code = ? WHERE id = ?', [tracking_code, req.params.id]);
      res.json({ message: 'Código de rastreio atualizado' });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao atualizar rastreio' });
    }
  },

  async addNote(req, res) {
    try {
      const { note } = req.body;
      const admin_username = req.user?.username || 'admin';
      await pool.query(
        'INSERT INTO order_notes (order_id, admin_username, note) VALUES (?, ?, ?)',
        [req.params.id, admin_username, note]
      );
      res.status(201).json({ message: 'Nota adicionada' });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao adicionar nota' });
    }
  },


  async exportCsv(req, res) {
    try {
      const [rows] = await pool.query(
        `SELECT o.id, o.customer_name, o.customer_email, o.customer_phone, o.total, o.status, o.shipping_type, o.tracking_code, o.address_city, o.address_state, o.created_at FROM orders o ORDER BY o.created_at DESC LIMIT 5000`
      );
      const header = 'ID,Nome,Email,Telefone,Total,Status,Frete,Rastreio,Cidade,Estado,Data\n';
      const csv = header + rows.map(r =>
        [r.id, r.customer_name, r.customer_email, r.customer_phone,
         r.total, r.status, r.shipping_type || '', r.tracking_code || '',
         r.address_city || '', r.address_state || '',
         new Date(r.created_at).toLocaleDateString('pt-BR')
        ].map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(',')
      ).join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="pedidos.csv"');
      res.send('\uFEFF' + csv);
    } catch (error) {
      res.status(500).json({ error: 'Erro ao exportar' });
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
