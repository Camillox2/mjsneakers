const { pool } = require('../config/db');

const couponController = {
  async getAll(req, res) {
    try {
      const [rows] = await pool.query('SELECT * FROM coupons ORDER BY created_at DESC');
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar cupons' });
    }
  },

  async create(req, res) {
    try {
      const { code, type, value, min_order, max_uses, valid_until } = req.body;
      if (!code || !value) {
        return res.status(400).json({ error: 'Código e valor são obrigatórios' });
      }
      const upperCode = code.toUpperCase().trim();
      const [existing] = await pool.query('SELECT id FROM coupons WHERE code = ?', [upperCode]);
      if (existing.length > 0) {
        return res.status(409).json({ error: 'Código de cupom já existe' });
      }
      const [result] = await pool.query(
        'INSERT INTO coupons (code, type, value, min_order, max_uses, valid_until) VALUES (?, ?, ?, ?, ?, ?)',
        [upperCode, type || 'percent', value, min_order || 0, max_uses || 0, valid_until || null]
      );
      res.status(201).json({ id: result.insertId, message: 'Cupom criado' });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao criar cupom' });
    }
  },

  async update(req, res) {
    try {
      const { code, type, value, min_order, max_uses, valid_until, active } = req.body;
      await pool.query(
        'UPDATE coupons SET code=?, type=?, value=?, min_order=?, max_uses=?, valid_until=?, active=? WHERE id=?',
        [code?.toUpperCase()?.trim(), type, value, min_order || 0, max_uses || 0, valid_until || null, active ?? true, req.params.id]
      );
      res.json({ message: 'Cupom atualizado' });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao atualizar cupom' });
    }
  },

  async delete(req, res) {
    try {
      await pool.query('DELETE FROM coupons WHERE id = ?', [req.params.id]);
      res.json({ message: 'Cupom removido' });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao remover cupom' });
    }
  },

  // Public: validate a coupon code
  async validate(req, res) {
    try {
      const { code, order_total } = req.body;
      if (!code) return res.status(400).json({ error: 'Código do cupom é obrigatório' });

      const [rows] = await pool.query(
        'SELECT * FROM coupons WHERE code = ? AND active = TRUE',
        [code.toUpperCase().trim()]
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Cupom inválido ou expirado' });
      }

      const coupon = rows[0];

      if (coupon.valid_until && new Date(coupon.valid_until) < new Date()) {
        return res.status(400).json({ error: 'Cupom expirado' });
      }
      if (coupon.max_uses > 0 && coupon.used_count >= coupon.max_uses) {
        return res.status(400).json({ error: 'Cupom esgotado' });
      }
      if (order_total && coupon.min_order > 0 && order_total < coupon.min_order) {
        return res.status(400).json({ error: `Pedido mínimo de R$ ${coupon.min_order.toFixed(2)} para usar este cupom` });
      }

      let discount = 0;
      if (coupon.type === 'percent') {
        discount = (order_total || 0) * (coupon.value / 100);
      } else {
        discount = coupon.value;
      }

      res.json({
        valid: true,
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        discount: Math.round(discount * 100) / 100,
        message: coupon.type === 'percent' ? `${coupon.value}% de desconto aplicado!` : `R$ ${coupon.value.toFixed(2)} de desconto aplicado!`
      });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao validar cupom' });
    }
  }
};

module.exports = couponController;
