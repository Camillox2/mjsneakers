const { pool } = require('../config/db');
const { CUSTOMER_COOKIE, setSessionCookies, clearCookie, cookiesOf, CSRF_COOKIE } = require('../utils/cookies');
const { signCustomerToken, CUSTOMER_SESSION_DAYS } = require('../middleware/customerAuth');
const { issueCode, checkCode } = require('../utils/emailCodes');
const { loyaltyConfig, pointsValue } = require('../utils/loyaltySettings');
const { exportByEmail, anonymizeByEmail } = require('../utils/privacyData');
const { roundMoney } = require('../utils/pricing');
const { logAudit } = require('./auditController');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_SENT = 'Se o e-mail estiver certo, enviamos um código de 6 dígitos. Ele vale por 10 minutos.';

function normalizeEmail(value) {
  return String(value || '').toLowerCase().trim();
}

function profileOf(customer) {
  return {
    email: customer.email,
    name: customer.name || null,
    phone: customer.phone || null,
    marketing_opt_in: Boolean(customer.marketing_opt_in),
  };
}

// Cupons que aparecem na conta: ativos, válidos, visíveis, para o e-mail ou
// para todos, e ainda não usados por ele (quando são de uso único).
async function accountCoupons(email) {
  const [rows] = await pool.query(
    `SELECT c.code, c.description, c.type, c.value, c.min_order, c.valid_until
     FROM coupons c
     WHERE c.active = TRUE AND c.visible_in_account = TRUE
       AND (c.valid_until IS NULL OR c.valid_until > NOW())
       AND (c.max_uses = 0 OR c.used_count < c.max_uses)
       AND (c.customer_email IS NULL OR c.customer_email = ?)
       AND NOT (c.once_per_email = TRUE AND EXISTS (
         SELECT 1 FROM coupon_redemptions cr WHERE cr.coupon_id = c.id AND cr.customer_email = ?))
     ORDER BY c.created_at DESC`,
    [email, email]
  );
  return rows.map((row) => ({ ...row, value: Number(row.value), min_order: Number(row.min_order) }));
}

async function pointsOf(email) {
  const [rows] = await pool.query('SELECT points FROM loyalty_points WHERE customer_email = ?', [email]);
  return rows.length ? Math.max(Number(rows[0].points) || 0, 0) : 0;
}

const accountController = {
  // {email} → 202 sempre (não revela se o e-mail existe).
  async requestCode(req, res) {
    const email = normalizeEmail(req.body?.email);
    if (!EMAIL_RE.test(email) || email.length > 255) return res.status(400).json({ error: 'E-mail inválido' });
    try {
      await issueCode(email, 'login');
    } catch (error) {
      console.error('Account code error:', error.message);
    }
    res.status(202).json({ message: CODE_SENT });
  },

  // {email, code} → cookie pz_cli (30 dias) e pz_csrf.
  async verify(req, res) {
    const email = normalizeEmail(req.body?.email);
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'E-mail inválido' });
    try {
      const result = await checkCode(email, 'login', req.body?.code);
      if (!result.ok) {
        return res.status(401).json({ error: 'Código inválido ou vencido', attempts_left: result.attemptsLeft });
      }
      // Nome e telefone do último pedido, na primeira vez.
      const [[last]] = await pool.query(
        'SELECT customer_name, customer_phone FROM orders WHERE customer_email = ? ORDER BY id DESC LIMIT 1',
        [email]
      ).then(([rows]) => [rows.length ? rows : [{}]]);
      await pool.query(
        `INSERT INTO customers (email, name, phone, last_login_at) VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE last_login_at = NOW(), deleted_at = NULL`,
        [email, last.customer_name || null, last.customer_phone || null]
      );
      const [[customer]] = await pool.query('SELECT * FROM customers WHERE email = ?', [email]);
      const csrfToken = setSessionCookies(res, {
        name: CUSTOMER_COOKIE,
        token: signCustomerToken(customer),
        maxAgeMs: CUSTOMER_SESSION_DAYS * 24 * 60 * 60 * 1000,
        // Reaproveita o pz_csrf que a página já tem (se for válido).
        csrfToken: /^[0-9a-f]{48}$/.test(cookiesOf(req)[CSRF_COOKIE] || '') ? cookiesOf(req)[CSRF_COOKIE] : undefined,
      });
      res.json({ customer: profileOf(customer), csrf_token: csrfToken });
    } catch (error) {
      console.error('Account verify error:', error.message);
      res.status(500).json({ error: 'Erro ao entrar na conta' });
    }
  },

  logout(req, res) {
    clearCookie(res, CUSTOMER_COOKIE);
    res.json({ message: 'Você saiu da sua conta' });
  },

  async me(req, res) {
    try {
      const config = await loyaltyConfig();
      const points = await pointsOf(req.customer.email);
      res.json({
        ...profileOf(req.customer),
        points,
        points_value: pointsValue(points, config),
        loyalty: config,
        coupons: await accountCoupons(req.customer.email),
      });
    } catch (error) {
      console.error('Account me error:', error.message);
      res.status(500).json({ error: 'Erro ao buscar a conta' });
    }
  },

  // {name, phone, marketing_opt_in}: só o que vier.
  async updateProfile(req, res) {
    const fields = {};
    if (req.body?.name !== undefined) {
      const name = String(req.body.name || '').trim();
      if (name.length > 255) return res.status(400).json({ error: 'Nome muito longo' });
      fields.name = name || null;
    }
    if (req.body?.phone !== undefined) {
      const phone = String(req.body.phone || '').trim();
      if (phone && !/^[0-9()+\s-]{8,20}$/.test(phone)) return res.status(400).json({ error: 'Telefone inválido' });
      fields.phone = phone || null;
    }
    if (req.body?.marketing_opt_in !== undefined) {
      if (typeof req.body.marketing_opt_in !== 'boolean') return res.status(400).json({ error: 'marketing_opt_in deve ser booleano' });
      fields.marketing_opt_in = req.body.marketing_opt_in;
    }
    const columns = Object.keys(fields);
    if (!columns.length) return res.status(400).json({ error: 'Nada para atualizar' });
    try {
      await pool.query(
        `UPDATE customers SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
        [...columns.map((c) => fields[c]), req.customer.id]
      );
      const [[customer]] = await pool.query('SELECT * FROM customers WHERE id = ?', [req.customer.id]);
      res.json(profileOf(customer));
    } catch (error) {
      res.status(500).json({ error: 'Erro ao salvar o perfil' });
    }
  },

  async orders(req, res) {
    try {
      const [rows] = await pool.query(
        `SELECT o.id, o.created_at, o.status, o.payment_status, o.payment_method, o.payment_installments AS installments,
           o.total, o.tracking_code,
           COALESCE((SELECT SUM(quantity) FROM order_items WHERE order_id = o.id), 0) AS items_count
         FROM orders o WHERE o.customer_email = ? ORDER BY o.created_at DESC, o.id DESC LIMIT 200`,
        [req.customer.email]
      );
      res.json(rows.map((row) => ({ ...row, items_count: Number(row.items_count) })));
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar pedidos' });
    }
  },

  async orderDetail(req, res) {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'id inválido' });
    try {
      const [orders] = await pool.query('SELECT * FROM orders WHERE id = ? AND customer_email = ?', [id, req.customer.email]);
      const order = orders[0];
      if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
      const [items] = await pool.query(
        `SELECT oi.product_id, p.name AS product_name, p.image_url, oi.size, oi.quantity, oi.price
         FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ? ORDER BY oi.id`,
        [id]
      );
      res.json({
        id: order.id,
        created_at: order.created_at,
        status: order.status,
        items: items.map((item) => ({ ...item, line_total: roundMoney(Number(item.price) * Number(item.quantity)) })),
        subtotal: order.subtotal,
        coupon_code: order.coupon_code,
        discount_amount: order.discount_amount,
        points_used: Number(order.points_used) || 0,
        points_discount: Number(order.points_discount) || 0,
        shipping: { type: order.shipping_type, price: order.shipping_price },
        gift_wrap: Boolean(order.gift_wrap),
        gift_wrap_price: order.gift_wrap_price,
        total: order.total,
        address: {
          street: order.address_street, number: order.address_number, complement: order.address_complement,
          neighborhood: order.address_neighborhood, city: order.address_city, state: order.address_state, cep: order.address_cep,
        },
        payment: {
          status: order.payment_status, method: order.payment_method, installments: order.payment_installments,
          paid_at: order.paid_at, pix_discount_amount: order.pix_discount_amount,
        },
        tracking_code: order.tracking_code,
      });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar o pedido' });
    }
  },

  // {points, history:[{id, type, points (com sinal), description, created_at, order_id}]}
  async points(req, res) {
    try {
      const [history] = await pool.query(
        `SELECT id, type, points, description, created_at, order_id FROM loyalty_transactions
         WHERE customer_email = ? ORDER BY created_at DESC, id DESC LIMIT 200`,
        [req.customer.email]
      );
      res.json({ points: await pointsOf(req.customer.email), history });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar pontos' });
    }
  },

  async getWishlist(req, res) {
    try {
      const [rows] = await pool.query(
        'SELECT product_id FROM customer_wishlist WHERE customer_id = ? ORDER BY created_at, product_id',
        [req.customer.id]
      );
      res.json(rows.map((row) => row.product_id));
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar favoritos' });
    }
  },

  // Corpo: [ids] ou {product_ids:[ids]}. Substitui a lista inteira.
  async putWishlist(req, res) {
    const raw = Array.isArray(req.body) ? req.body : req.body?.product_ids;
    if (!Array.isArray(raw) || raw.length > 200) return res.status(400).json({ error: 'Envie uma lista de até 200 ids' });
    const ids = [...new Set(raw.map(Number))];
    if (!ids.every((id) => Number.isInteger(id) && id > 0)) return res.status(400).json({ error: 'ids inválidos' });
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('DELETE FROM customer_wishlist WHERE customer_id = ?', [req.customer.id]);
      let valid = [];
      if (ids.length) {
        const [existing] = await conn.query('SELECT id FROM products WHERE id IN (?)', [ids]);
        const found = new Set(existing.map((row) => row.id));
        valid = ids.filter((id) => found.has(id));
        if (valid.length) {
          await conn.query('INSERT INTO customer_wishlist (customer_id, product_id) VALUES ?', [valid.map((id) => [req.customer.id, id])]);
        }
      }
      await conn.commit();
      res.json(valid);
    } catch (error) {
      await conn.rollback();
      res.status(500).json({ error: 'Erro ao salvar favoritos' });
    } finally {
      conn.release();
    }
  },

  // Tudo o que a loja guarda deste e-mail (LGPD, art. 18).
  async exportData(req, res) {
    try {
      const data = await exportByEmail(req.customer.email);
      logAudit({ adminUsername: 'cliente', action: 'self_export', entity: 'customer', entityId: req.customer.id });
      res.set('Content-Disposition', 'attachment; filename="meus-dados.json"');
      res.json(data);
    } catch (error) {
      console.error('Account export error:', error.message);
      res.status(500).json({ error: 'Erro ao exportar os dados' });
    }
  },

  // Sem code: manda um código por e-mail (202). Com code: apaga a conta e
  // anonimiza os dados (pedido com nota fiscal mantém os dados fiscais).
  async deleteAccount(req, res) {
    const email = req.customer.email;
    try {
      if (!req.body?.code) {
        await issueCode(email, 'delete');
        return res.status(202).json({ message: 'Enviamos um código para o seu e-mail. Confirme com ele para apagar a conta.' });
      }
      const result = await checkCode(email, 'delete', req.body.code);
      if (!result.ok) return res.status(401).json({ error: 'Código inválido ou vencido', attempts_left: result.attemptsLeft });
      const summary = await anonymizeByEmail(email);
      logAudit({ adminUsername: 'cliente', action: 'self_delete', entity: 'customer', entityId: req.customer.id, details: summary });
      clearCookie(res, CUSTOMER_COOKIE);
      res.json({ message: 'Sua conta foi apagada e seus dados, anonimizados.', summary });
    } catch (error) {
      console.error('Account delete error:', error.message);
      res.status(500).json({ error: 'Erro ao apagar a conta' });
    }
  },
};

module.exports = accountController;
