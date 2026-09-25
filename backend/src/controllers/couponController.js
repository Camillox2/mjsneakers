const { pool } = require('../config/db');
const { auditReq } = require('./auditController');
const { evaluateCoupon } = require('../utils/coupons');
const { toMysqlDateTime, toBool } = require('../utils/validate');

const CODE_RE = /^[A-Z0-9_-]{3,50}$/;

// Aceita os nomes antigos do admin ('percentage', expires_at) e grava no
// formato do banco ('percent', valid_until).
function readCoupon(body, { partial }) {
  const fields = {};
  if (body.code !== undefined || !partial) {
    const code = String(body.code ?? '').toUpperCase().trim();
    if (!CODE_RE.test(code)) return { error: 'Código deve ter de 3 a 50 letras, números, _ ou -' };
    fields.code = code;
  }
  if (body.type !== undefined || !partial) {
    const raw = body.type === undefined ? 'percent' : String(body.type);
    const type = raw === 'percentage' ? 'percent' : raw;
    if (!['percent', 'fixed'].includes(type)) return { error: 'Tipo deve ser percent ou fixed' };
    fields.type = type;
  }
  if (body.value !== undefined || !partial) {
    const value = Number(body.value);
    if (!Number.isFinite(value) || value <= 0 || value > 100000) return { error: 'Valor deve ser maior que zero' };
    fields.value = Math.round(value * 100) / 100;
  }
  if (body.min_order !== undefined) {
    const n = body.min_order === '' || body.min_order === null ? 0 : Number(body.min_order);
    if (!Number.isFinite(n) || n < 0) return { error: 'Pedido mínimo inválido' };
    fields.min_order = Math.round(n * 100) / 100;
  }
  if (body.max_uses !== undefined) {
    const n = body.max_uses === '' || body.max_uses === null ? 0 : Number(body.max_uses);
    if (!Number.isInteger(n) || n < 0 || n > 10000000) return { error: 'Máximo de usos deve ser um inteiro (0 = ilimitado)' };
    fields.max_uses = n;
  }
  const until = body.valid_until !== undefined ? body.valid_until : body.expires_at;
  if (until !== undefined) {
    try {
      fields.valid_until = toMysqlDateTime(until);
    } catch (_error) {
      return { error: 'Validade inválida' };
    }
  }
  if (body.description !== undefined) {
    const text = body.description === null ? '' : String(body.description).trim();
    if (text.length > 160) return { error: 'Descrição deve ter no máximo 160 caracteres' };
    fields.description = text || null;
  }
  if (body.customer_email !== undefined) {
    const email = body.customer_email === null ? '' : String(body.customer_email).toLowerCase().trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'customer_email inválido' };
    fields.customer_email = email || null;
  }
  for (const flag of ['active', 'once_per_email', 'visible_in_account']) {
    if (body[flag] === undefined) continue;
    const value = toBool(body[flag]);
    if (value === undefined) return { error: `${flag} deve ser booleano` };
    fields[flag] = value;
  }
  return { fields };
}

function formatCoupon(row) {
  return {
    ...row, active: Boolean(row.active), once_per_email: Boolean(row.once_per_email), visible_in_account: Boolean(row.visible_in_account),
  };
}

const couponController = {
  async getAll(req, res) {
    try {
      const [rows] = await pool.query('SELECT * FROM coupons ORDER BY created_at DESC');
      res.json(rows.map(formatCoupon));
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar cupons' });
    }
  },

  async create(req, res) {
    const { fields, error } = readCoupon(req.body, { partial: false });
    if (error) return res.status(400).json({ error });
    if (fields.type === 'percent' && fields.value > 100) return res.status(400).json({ error: 'Porcentagem deve ser no máximo 100' });
    try {
      const columns = Object.keys(fields);
      const [result] = await pool.query(
        `INSERT INTO coupons (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
        columns.map((c) => fields[c])
      );
      auditReq(req, 'create', 'coupon', result.insertId, fields);
      res.status(201).json({ id: result.insertId, message: 'Cupom criado' });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Código de cupom já existe' });
      console.error('Create coupon error:', err);
      res.status(500).json({ error: 'Erro ao criar cupom' });
    }
  },

  // Atualiza só o que veio no corpo.
  async update(req, res) {
    const { fields, error } = readCoupon(req.body, { partial: true });
    if (error) return res.status(400).json({ error });
    const columns = Object.keys(fields);
    if (!columns.length) return res.status(400).json({ error: 'Nada para atualizar' });
    try {
      if (fields.type === 'percent' || fields.value !== undefined) {
        const [[current]] = await pool.query('SELECT type, value FROM coupons WHERE id = ?', [req.params.id]);
        if (!current) return res.status(404).json({ error: 'Cupom não encontrado' });
        const type = fields.type || current.type;
        const value = fields.value ?? Number(current.value);
        if (type === 'percent' && value > 100) return res.status(400).json({ error: 'Porcentagem deve ser no máximo 100' });
      }
      const [result] = await pool.query(
        `UPDATE coupons SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
        [...columns.map((c) => fields[c]), req.params.id]
      );
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Cupom não encontrado' });
      auditReq(req, 'update', 'coupon', req.params.id, fields);
      res.json({ message: 'Cupom atualizado' });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Código de cupom já existe' });
      res.status(500).json({ error: 'Erro ao atualizar cupom' });
    }
  },

  async delete(req, res) {
    try {
      const [result] = await pool.query('DELETE FROM coupons WHERE id = ?', [req.params.id]);
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Cupom não encontrado' });
      auditReq(req, 'delete', 'coupon', req.params.id);
      res.json({ message: 'Cupom removido' });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao remover cupom' });
    }
  },

  // Public: validate a coupon code. É só uma prévia: o pedido revalida tudo.
  async validate(req, res) {
    try {
      const { code } = req.body;
      if (!code) return res.status(400).json({ error: 'Código do cupom é obrigatório' });
      const orderTotal = Number(req.body.order_total ?? req.body.orderTotal ?? 0) || 0;
      const email = String(req.body.email || '').toLowerCase().trim();

      const [rows] = await pool.query('SELECT * FROM coupons WHERE code = ?', [String(code).toUpperCase().trim()]);
      const coupon = rows[0];
      if (!coupon || !coupon.active) return res.status(404).json({ error: 'Cupom inválido ou expirado' });
      // Cupom exclusivo de um e-mail: sem o e-mail certo, é como se não existisse.
      if (coupon.customer_email && coupon.customer_email !== email) {
        return res.status(404).json({ error: 'Cupom inválido ou expirado' });
      }

      let redeemed = false;
      if (coupon.once_per_email && email) {
        const [used] = await pool.query(
          'SELECT id FROM coupon_redemptions WHERE coupon_id = ? AND customer_email = ?',
          [coupon.id, email]
        );
        redeemed = used.length > 0;
      }

      let result;
      try {
        result = evaluateCoupon(coupon, { subtotal: orderTotal, redeemedByEmail: redeemed });
      } catch (error) {
        return res.status(error.status || 400).json({ error: error.message });
      }

      const value = Number(coupon.value);
      res.json({
        valid: true,
        code: coupon.code,
        type: coupon.type,
        value,
        discount: result.discount,
        once_per_email: Boolean(coupon.once_per_email),
        message: coupon.type === 'percent' ? `${value}% de desconto aplicado!` : `R$ ${value.toFixed(2)} de desconto aplicado!`
      });
    } catch (error) {
      console.error('Validate coupon error:', error);
      res.status(500).json({ error: 'Erro ao validar cupom' });
    }
  }
};

module.exports = couponController;
