const { pool } = require('../config/db');
const { orderConfirmationEmail, adminNewOrderEmail, orderStatusEmail } = require('../services/emailService');
// E-mail nunca derruba o pedido: sai depois do commit e engole a falha.
const { sendLater, notifyAdmins } = require('../utils/notify');
const { createWhatsAppNotification } = require('../utils/whatsapp');
const { getShippingOptions } = require('./shippingController');
const { notifySubscribers } = require('./stockAlertController');
const { earnPoints } = require('./loyaltyController');
const { auditReq } = require('./auditController');
const { getSettingValue } = require('./settingsController');
const { unitPrice, roundMoney } = require('../utils/pricing');
const { evaluateCoupon } = require('../utils/coupons');
const { recalcProduct } = require('../utils/productSizes');
const { cancelOrderInTx } = require('../utils/orderCancel');
const { isPaymentEnabled } = require('../services/mercadoPago');
const { newOrderToken, cancelOpenProviderPayments } = require('../services/paymentService');
const { pagination, likeTerm, isDateOnly } = require('../utils/validate');
const { loyaltyConfig, evaluatePointsUse } = require('../utils/loyaltySettings');

// Valores reais do ENUM orders.status (db.js).
const ORDER_STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
// Salvar o rastreio leva a 'shipped' quem ainda estava antes disso.
const BEFORE_SHIPPED = ['pending', 'confirmed', 'processing'];
// Com pagamento online, cada e-mail pode ter no máximo 2 pedidos esperando
// pagamento (cada um segura estoque até vencer).
const MAX_WAITING_PER_EMAIL = 2;

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function sendError(res, error, fallback) {
  if (error.status) return res.status(error.status).json({ error: error.message });
  console.error(fallback, error);
  res.status(500).json({ error: fallback });
}

// Filtros comuns da lista, das contagens e do CSV de pedidos (admin).
function buildOrderFilters(query, { withStatus = true } = {}) {
  const where = ['1=1'];
  const params = [];
  if (withStatus && query.status) {
    if (!ORDER_STATUSES.includes(query.status)) throw httpError(400, `status deve ser um de: ${ORDER_STATUSES.join(', ')}`);
    where.push('o.status = ?');
    params.push(query.status);
  }
  if (query.search) {
    const term = likeTerm(query.search);
    const id = Number(String(query.search).replace(/^#/, ''));
    where.push('(o.customer_name LIKE ? OR o.customer_email LIKE ? OR o.customer_phone LIKE ? OR o.tracking_code LIKE ? OR o.id = ?)');
    params.push(term, term, term, term, Number.isInteger(id) ? id : 0);
  }
  if (query.date_from) {
    if (!isDateOnly(query.date_from)) throw httpError(400, 'date_from deve ser YYYY-MM-DD');
    where.push('o.created_at >= ?');
    params.push(`${query.date_from} 00:00:00`);
  }
  if (query.date_to) {
    if (!isDateOnly(query.date_to)) throw httpError(400, 'date_to deve ser YYYY-MM-DD');
    where.push('o.created_at < DATE_ADD(?, INTERVAL 1 DAY)');
    params.push(`${query.date_to} 00:00:00`);
  }
  return { where: `WHERE ${where.join(' AND ')}`, params };
}

function formatOrder(order, items = []) {
  // O hash do token do pedido nunca sai do banco.
  const { access_token_hash: _hash, ...safe } = order;
  return {
    ...safe,
    gift_wrap: Boolean(order.gift_wrap),
    stock_restored: Boolean(order.stock_restored),
    loyalty_awarded: Boolean(order.loyalty_awarded),
    loyalty_reversed: Boolean(order.loyalty_reversed),
    items,
    items_count: items.reduce((sum, item) => sum + Number(item.quantity), 0),
  };
}

async function loadItems(conn, orderIds) {
  const map = new Map();
  if (!orderIds.length) return map;
  const [rows] = await conn.query(
    `SELECT oi.id, oi.order_id, oi.product_id, oi.size, oi.quantity, oi.price,
       p.name AS product_name, p.image_url, b.name AS brand_name
     FROM order_items oi
     LEFT JOIN products p ON oi.product_id = p.id
     LEFT JOIN brands b ON p.brand_id = b.id
     WHERE oi.order_id IN (?)
     ORDER BY oi.id`,
    [orderIds]
  );
  for (const row of rows) {
    const list = map.get(row.order_id) || [];
    list.push({ ...row, line_total: roundMoney(Number(row.price) * Number(row.quantity)) });
    map.set(row.order_id, list);
  }
  return map;
}

function csvCell(value) {
  let text = String(value ?? '');
  // Evita que o Excel trate texto do cliente como fórmula.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

// ---------- Cálculo do pedido (usado pelo POST /orders e pelo /orders/quote) ----------
// Soma quantidades repetidas e busca o preço vigente de cada produto.
async function priceLines(items) {
  const requested = new Map();
  for (const item of items) {
    const key = `${item.product_id}:${item.size}`;
    const entry = requested.get(key) || { product_id: item.product_id, size: item.size, quantity: 0 };
    entry.quantity += item.quantity;
    requested.set(key, entry);
  }
  const lines = [...requested.values()];
  if (lines.some((line) => line.quantity > 50)) throw httpError(400, 'Máximo de 50 unidades por produto e tamanho');

  const productIds = [...new Set(lines.map((line) => line.product_id))];
  const [products] = await pool.query(
    `SELECT id, name, price, discount_percentage, promo_start, promo_end
     FROM products WHERE id IN (?) AND active = TRUE`,
    [productIds]
  );
  const byId = new Map(products.map((product) => [product.id, product]));
  const missing = productIds.find((id) => !byId.has(id));
  if (missing) throw httpError(400, `Produto #${missing} não encontrado ou indisponível`);

  const now = new Date();
  return lines.map((line) => {
    const product = byId.get(line.product_id);
    const unit = unitPrice(product, now);
    return { ...line, name: product.name, unit, lineTotal: roundMoney(unit * line.quantity) };
  });
}

function weightItemsOf(priced) {
  const byProduct = new Map();
  for (const line of priced) byProduct.set(line.product_id, (byProduct.get(line.product_id) || 0) + line.quantity);
  return [...byProduct.entries()].map(([product_id, quantity]) => ({ product_id, quantity }));
}

// Opção de frete escolhida: pela regra (shipping_rule_id) ou pelo nome das
// opções padrão (id null).
function chooseShipping(options, body) {
  const ruleId = body.shipping_rule_id ? Number(body.shipping_rule_id) : null;
  const typeName = String(body.shipping_type || '').trim().toLowerCase();
  return ruleId
    ? options.find((opt) => opt.id === ruleId) || null
    : options.find((opt) => opt.id === null && opt.name.toLowerCase() === typeName)
      || (options.length === 1 && !typeName ? options[0] : null);
}

// Embrulho só entra no total se tiver preço configurado.
async function giftWrapPriceOf(body) {
  if (!body.gift_wrap) return 0;
  const configured = Number(await getSettingValue('gift_wrap_price'));
  return Number.isFinite(configured) && configured > 0 ? roundMoney(configured) : 0;
}

const orderController = {
  // Admin: lista com filtros, itens, endereço, frete, cupom e presente.
  async getAll(req, res) {
    try {
      const { page, limit, offset } = pagination(req.query, 20, 100);
      const { where, params } = buildOrderFilters(req.query);

      const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM orders o ${where}`, params);
      const [orders] = await pool.query(
        `SELECT o.* FROM orders o ${where}
         ORDER BY o.created_at DESC, o.id DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );
      const items = await loadItems(pool, orders.map((order) => order.id));
      res.json({
        data: orders.map((order) => formatOrder(order, items.get(order.id) || [])),
        total: Number(total),
        page,
        pages: Math.ceil(Number(total) / limit),
      });
    } catch (error) {
      sendError(res, error, 'Erro ao buscar pedidos');
    }
  },

  // Admin: {pending: n, ..., all: n}, com os mesmos filtros (menos status).
  async statusCounts(req, res) {
    try {
      const { where, params } = buildOrderFilters(req.query, { withStatus: false });
      const [rows] = await pool.query(`SELECT o.status, COUNT(*) AS total FROM orders o ${where} GROUP BY o.status`, params);
      const counts = Object.fromEntries(ORDER_STATUSES.map((status) => [status, 0]));
      let all = 0;
      for (const row of rows) {
        if (row.status in counts) counts[row.status] = Number(row.total);
        all += Number(row.total);
      }
      res.json({ ...counts, all });
    } catch (error) {
      sendError(res, error, 'Erro ao contar pedidos');
    }
  },

  async getById(req, res) {
    try {
      const [order] = await pool.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);
      if (order.length === 0) return res.status(404).json({ error: 'Pedido não encontrado' });
      const items = await loadItems(pool, [order[0].id]);
      const [notes] = await pool.query(
        'SELECT * FROM order_notes WHERE order_id = ? ORDER BY created_at ASC',
        [req.params.id]
      );
      const [payments] = await pool.query(
        `SELECT id, provider_payment_id, method, status, status_detail, amount, installments, created_at, updated_at
         FROM payments WHERE order_id = ? ORDER BY id`,
        [req.params.id]
      );
      res.json({ ...formatOrder(order[0], items.get(order[0].id) || []), notes, payments });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar pedido' });
    }
  },

  // Rastreamento público
  async track(req, res) {
    try {
      const id = Number(req.query.id);
      const email = String(req.query.email || '').toLowerCase().trim();
      if (!Number.isInteger(id) || id < 1 || !email) return res.status(400).json({ error: 'id e email são obrigatórios' });

      const [orders] = await pool.query(
        `SELECT id, customer_name, status, payment_status, tracking_code, total, subtotal, discount_amount, points_used,
           points_discount, pix_discount_amount, shipping_price, shipping_type, created_at, address_city, address_state
         FROM orders WHERE id = ? AND customer_email = ?`,
        [id, email]
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

  /**
   * Cria o pedido com tudo calculado no servidor: preço de cada item (com a
   * promoção vigente), cupom, pontos, frete e embrulho. price, discount_amount,
   * shipping_price e total do corpo são ignorados.
   */
  async create(req, res) {
    const body = req.body;
    const customerEmail = String(body.customer_email || '').toLowerCase().trim();
    const sessionId = body.session_id ? String(body.session_id) : null;
    const usePoints = body.use_points === undefined || body.use_points === null || body.use_points === '' ? 0 : Number(body.use_points);

    let pricing;
    let loyalty = null;
    try {
      if ((await getSettingValue('maintenance_mode')) === 'true') {
        throw httpError(503, 'A loja está em manutenção. Tente novamente em instantes.');
      }
      if (isPaymentEnabled() && customerEmail) {
        const [[{ waiting }]] = await pool.query(
          "SELECT COUNT(*) AS waiting FROM orders WHERE customer_email = ? AND status = 'pending' AND payment_status <> 'approved'",
          [customerEmail]
        );
        if (Number(waiting) >= MAX_WAITING_PER_EMAIL) {
          throw httpError(429, 'Você já tem um pedido esperando pagamento. Pague ou espere ele vencer.');
        }
      }
      // Pontos só com a conta logada (cookie pz_cli + CSRF) e o mesmo e-mail do pedido.
      if (usePoints) {
        if (!Number.isInteger(usePoints) || usePoints < 0) throw httpError(400, 'use_points deve ser um inteiro positivo');
        if (!req.customer) throw httpError(401, 'Entre na sua conta para usar pontos');
        if (!req.customerCsrfOk) throw httpError(403, 'Sessão expirada ou página desatualizada. Recarregue e tente de novo.');
        if (req.customer.email !== customerEmail) throw httpError(403, 'Os pontos só valem para o e-mail da sua conta');
        loyalty = await loyaltyConfig();
      }

      const priced = await priceLines(body.items);
      const subtotal = roundMoney(priced.reduce((sum, line) => sum + line.lineTotal, 0));
      const options = await getShippingOptions({
        cep: body.address_cep,
        items: weightItemsOf(priced),
        orderTotal: subtotal,
        fallbackUf: body.address_state,
      });
      const option = chooseShipping(options, body);
      if (!option) {
        throw httpError(400, 'A opção de frete escolhida não está disponível para este CEP. Calcule o frete de novo.');
      }
      const shippingPrice = option.is_free ? 0 : roundMoney(option.price);
      const giftWrapPrice = await giftWrapPriceOf(body);

      pricing = { priced, subtotal, option, shippingPrice, giftWrapPrice };
    } catch (error) {
      if (error.status === 502) return res.status(400).json({ error: 'Não foi possível calcular o frete para este CEP agora. Tente novamente.' });
      return sendError(res, error, 'Erro ao criar pedido');
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const { priced, subtotal, option, shippingPrice, giftWrapPrice } = pricing;

      // Cupom revalidado aqui, com o uso reservado de forma atômica.
      let discount = 0;
      let coupon = null;
      if (body.coupon_code) {
        const code = String(body.coupon_code).toUpperCase().trim();
        const [coupons] = await conn.query('SELECT * FROM coupons WHERE code = ? FOR UPDATE', [code]);
        coupon = coupons[0];
        if (!coupon) throw httpError(400, 'Cupom inválido ou expirado');
        if (coupon.customer_email && coupon.customer_email !== customerEmail) throw httpError(400, 'Cupom inválido ou expirado');
        let redeemed = false;
        if (coupon.once_per_email) {
          if (!customerEmail) throw httpError(400, 'Informe o e-mail para usar este cupom');
          const [used] = await conn.query(
            'SELECT id FROM coupon_redemptions WHERE coupon_id = ? AND customer_email = ?',
            [coupon.id, customerEmail]
          );
          redeemed = used.length > 0;
        }
        discount = evaluateCoupon(coupon, { subtotal, redeemedByEmail: redeemed }).discount;
        const [reserve] = await conn.query(
          'UPDATE coupons SET used_count = used_count + 1 WHERE id = ? AND active = TRUE AND (max_uses = 0 OR used_count < max_uses)',
          [coupon.id]
        );
        if (reserve.affectedRows !== 1) throw httpError(409, 'Cupom esgotado');
      }

      // Pontos: depois do cupom e antes do frete; saldo travado e debitado aqui.
      let pointsUsed = 0;
      let pointsDiscount = 0;
      if (usePoints) {
        const [balanceRows] = await conn.query('SELECT points FROM loyalty_points WHERE customer_email = ? FOR UPDATE', [customerEmail]);
        const balance = balanceRows.length ? Number(balanceRows[0].points) : 0;
        const use = evaluatePointsUse({ usePoints, balance, subtotal, afterCoupon: roundMoney(subtotal - discount), config: loyalty });
        const [debit] = await conn.query(
          'UPDATE loyalty_points SET points = points - ?, total_redeemed = total_redeemed + ? WHERE customer_email = ? AND points >= ?',
          [use.points, use.points, customerEmail, use.points]
        );
        if (debit.affectedRows !== 1) throw httpError(409, 'Saldo de pontos mudou. Confira e tente de novo.');
        pointsUsed = use.points;
        pointsDiscount = use.discount;
      }

      // Estoque: trava cada tamanho e desconta as reservas de outros carrinhos
      // (a do próprio cliente, pelo session_id, não conta contra ele).
      for (const line of priced) {
        const [rows] = await conn.query(
          'SELECT stock FROM product_sizes WHERE product_id = ? AND size = ? FOR UPDATE',
          [line.product_id, line.size]
        );
        if (!rows.length) throw httpError(409, `Tamanho ${line.size} indisponível para ${line.name}`);
        const [[reservation]] = await conn.query(
          `SELECT COALESCE(SUM(quantity), 0) AS reserved
           FROM cart_reservations
           WHERE product_id = ? AND size = ? AND reserved_until > NOW()
             AND (? IS NULL OR session_id <> ?)`,
          [line.product_id, line.size, sessionId, sessionId]
        );
        const available = Number(rows[0].stock) - Number(reservation.reserved);
        if (available < line.quantity) {
          throw httpError(409, `Estoque insuficiente para ${line.name}, tamanho ${line.size}. Disponível: ${Math.max(available, 0)}`);
        }
        line.stockBefore = Number(rows[0].stock);
      }

      const total = roundMoney(Math.max(subtotal - discount - pointsDiscount, 0) + shippingPrice + giftWrapPrice);
      // Token de acesso do pedido: vai para a loja uma única vez; no banco, só o hash.
      const orderToken = newOrderToken();

      const [orderResult] = await conn.query(
        `INSERT INTO orders
          (customer_name, customer_email, customer_phone, subtotal, total, coupon_code, discount_amount,
           points_used, points_discount,
           shipping_price, shipping_type, shipping_rule_id, gift_wrap, gift_wrap_price, gift_message,
           address_street, address_number, address_complement, address_neighborhood,
           address_city, address_state, address_cep, payment_status, access_token_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unpaid', ?)`,
        [
          body.customer_name, customerEmail || null, body.customer_phone, subtotal, total,
          coupon ? coupon.code : null, discount, pointsUsed, pointsDiscount,
          shippingPrice, option.name, option.id || null,
          Boolean(body.gift_wrap), giftWrapPrice, body.gift_wrap ? (body.gift_message || null) : null,
          body.address_street, body.address_number, body.address_complement || null, body.address_neighborhood,
          body.address_city, body.address_state, body.address_cep, orderToken.hash,
        ]
      );
      const orderId = orderResult.insertId;

      if (pointsUsed) {
        await conn.query(
          'INSERT INTO loyalty_transactions (customer_email, order_id, type, points, description) VALUES (?, ?, ?, ?, ?)',
          [customerEmail, orderId, 'redeem', -pointsUsed, `Desconto no pedido #${orderId}: R$ ${pointsDiscount.toFixed(2)}`]
        );
      }

      for (const line of priced) {
        await conn.query(
          'INSERT INTO order_items (order_id, product_id, quantity, size, price) VALUES (?, ?, ?, ?, ?)',
          [orderId, line.product_id, line.quantity, line.size, line.unit]
        );
        const [stockUpdate] = await conn.query(
          `UPDATE product_sizes SET stock = stock - ?
           WHERE product_id = ? AND size = ? AND stock >= ?`,
          [line.quantity, line.product_id, line.size, line.quantity]
        );
        if (stockUpdate.affectedRows !== 1) {
          throw httpError(409, `Estoque insuficiente para ${line.name}, tamanho ${line.size}`);
        }
        await conn.query(
          `INSERT INTO stock_history
            (product_id, size, type, quantity_change, quantity_before, quantity_after, reason, order_id)
           VALUES (?, ?, 'sale', ?, ?, ?, ?, ?)`,
          [line.product_id, line.size, -line.quantity, line.stockBefore, line.stockBefore - line.quantity, 'Venda', orderId]
        );
      }
      for (const productId of new Set(priced.map((line) => line.product_id))) {
        await recalcProduct(conn, productId);
      }

      if (coupon && coupon.once_per_email) {
        await conn.query(
          'INSERT INTO coupon_redemptions (coupon_id, customer_email, order_id) VALUES (?, ?, ?)',
          [coupon.id, customerEmail, orderId]
        );
      }
      if (sessionId) {
        await conn.query('DELETE FROM cart_reservations WHERE session_id = ?', [sessionId]);
      }

      await conn.commit();

      const orderForEmail = {
        id: orderId, customer_name: body.customer_name, customer_email: customerEmail, customer_phone: body.customer_phone,
        total, subtotal, discount_amount: discount, coupon_code: coupon ? coupon.code : null,
        points_used: pointsUsed, points_discount: pointsDiscount,
        shipping_price: shippingPrice, shipping_type: option.name,
        address_street: body.address_street, address_number: body.address_number, address_complement: body.address_complement,
        address_neighborhood: body.address_neighborhood, address_city: body.address_city, address_state: body.address_state,
        address_cep: body.address_cep,
      };
      const emailItems = priced.map((line) => ({
        product_id: line.product_id, product_name: line.name, size: line.size, quantity: line.quantity, price: line.unit,
      }));
      // Com pagamento online ligado, confirmação e aviso à equipe saem só na
      // aprovação do pagamento (services/paymentService).
      const paymentRequired = isPaymentEnabled();
      if (!paymentRequired) {
        sendLater(customerEmail, () => orderConfirmationEmail(orderForEmail, emailItems));
        notifyAdmins(() => adminNewOrderEmail(orderForEmail, emailItems));
      }

      res.status(201).json({
        id: orderId,
        message: 'Pedido criado com sucesso!',
        subtotal,
        discount_amount: discount,
        points_used: pointsUsed,
        points_discount: pointsDiscount,
        shipping_price: shippingPrice,
        shipping_type: option.name,
        shipping_rule_id: option.id || null,
        gift_wrap_price: giftWrapPrice,
        coupon_code: coupon ? coupon.code : null,
        total,
        items: emailItems.map((item) => ({ ...item, line_total: roundMoney(item.price * item.quantity) })),
        access_token: orderToken.token,
        payment_required: paymentRequired,
        payment_status: 'unpaid',
      });
    } catch (error) {
      await conn.rollback();
      if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Este cupom já foi usado com este e-mail' });
      sendError(res, error, 'Erro ao criar pedido');
    } finally {
      conn.release();
    }
  },

  /**
   * Simula o pedido sem criar nada: mesmo corpo do POST /orders. Devolve os
   * valores que o pedido teria e, em messages, o que impediria a compra
   * (cupom, pontos, frete ou estoque), sem dar erro por isso.
   */
  async quote(req, res) {
    const body = req.body;
    const customerEmail = String(body.customer_email || (req.customer ? req.customer.email : '')).toLowerCase().trim();
    const messages = [];
    try {
      const priced = await priceLines(body.items);
      const subtotal = roundMoney(priced.reduce((sum, line) => sum + line.lineTotal, 0));

      // Estoque (sem reservar): só avisa.
      for (const line of priced) {
        const [rows] = await pool.query(
          `SELECT ps.stock - COALESCE((SELECT SUM(quantity) FROM cart_reservations cr WHERE cr.product_id = ps.product_id
             AND cr.size = ps.size AND cr.reserved_until > NOW() AND (? IS NULL OR cr.session_id <> ?)), 0) AS available
           FROM product_sizes ps WHERE ps.product_id = ? AND ps.size = ?`,
          [body.session_id || null, body.session_id || null, line.product_id, line.size]
        );
        const available = rows.length ? Number(rows[0].available) : 0;
        if (available < line.quantity) {
          messages.push(`Estoque insuficiente para ${line.name}, tamanho ${line.size}. Disponível: ${Math.max(available, 0)}`);
        }
      }

      let couponCode = null;
      let couponDiscount = 0;
      if (body.coupon_code) {
        const code = String(body.coupon_code).toUpperCase().trim();
        const [coupons] = await pool.query('SELECT * FROM coupons WHERE code = ?', [code]);
        const coupon = coupons[0];
        try {
          if (!coupon || (coupon.customer_email && coupon.customer_email !== customerEmail)) throw httpError(400, 'Cupom inválido ou expirado');
          let redeemed = false;
          if (coupon.once_per_email && customerEmail) {
            const [used] = await pool.query('SELECT id FROM coupon_redemptions WHERE coupon_id = ? AND customer_email = ?', [coupon.id, customerEmail]);
            redeemed = used.length > 0;
          }
          couponDiscount = evaluateCoupon(coupon, { subtotal, redeemedByEmail: redeemed }).discount;
          couponCode = coupon.code;
        } catch (error) {
          messages.push(error.message);
        }
      }

      let pointsUsed = 0;
      let pointsDiscount = 0;
      const usePoints = Number(body.use_points || 0);
      if (usePoints) {
        try {
          if (!req.customer) throw httpError(401, 'Entre na sua conta para usar pontos');
          if (customerEmail !== req.customer.email) throw httpError(403, 'Os pontos só valem para o e-mail da sua conta');
          const config = await loyaltyConfig();
          const [balanceRows] = await pool.query('SELECT points FROM loyalty_points WHERE customer_email = ?', [req.customer.email]);
          const balance = balanceRows.length ? Number(balanceRows[0].points) : 0;
          const use = evaluatePointsUse({ usePoints, balance, subtotal, afterCoupon: roundMoney(subtotal - couponDiscount), config });
          pointsUsed = use.points;
          pointsDiscount = use.discount;
        } catch (error) {
          messages.push(error.message);
        }
      }

      let shippingPrice = 0;
      let option = null;
      if (body.address_cep) {
        try {
          const options = await getShippingOptions({
            cep: String(body.address_cep).replace(/\D/g, ''),
            items: weightItemsOf(priced),
            orderTotal: subtotal,
            fallbackUf: body.address_state,
          });
          option = chooseShipping(options, body);
          if (option) shippingPrice = option.is_free ? 0 : roundMoney(option.price);
          else messages.push('Escolha uma opção de frete disponível para este CEP.');
        } catch (error) {
          messages.push(error.status === 502 ? 'Não foi possível calcular o frete agora.' : error.message);
        }
      } else {
        messages.push('Informe o CEP para calcular o frete.');
      }

      const giftWrapPrice = await giftWrapPriceOf(body);
      const total = roundMoney(Math.max(subtotal - couponDiscount - pointsDiscount, 0) + shippingPrice + giftWrapPrice);
      const pixPercent = Math.min(Math.max(Number(await getSettingValue('payment_pix_discount')) || 0, 0), 20);
      const pixDiscountPreview = roundMoney(Math.min(subtotal * (pixPercent / 100), Math.max(total - 0.01, 0)));

      res.json({
        subtotal,
        coupon_code: couponCode,
        coupon_discount: couponDiscount,
        points_used: pointsUsed,
        points_discount: pointsDiscount,
        shipping_price: shippingPrice,
        shipping_type: option ? option.name : null,
        shipping_rule_id: option ? option.id || null : null,
        gift_wrap_price: giftWrapPrice,
        pix_discount_preview: pixDiscountPreview,
        total,
        items: priced.map((line) => ({
          product_id: line.product_id, product_name: line.name, size: line.size, quantity: line.quantity,
          price: line.unit, line_total: line.lineTotal,
        })),
        messages,
      });
    } catch (error) {
      sendError(res, error, 'Erro ao calcular o pedido');
    }
  },

  // Admin: muda o status. Cancelar devolve o estoque uma única vez (e, se o
  // pedido já tinha creditado pontos, estorna uma única vez); entregar credita
  // os pontos de fidelidade uma única vez; o cliente recebe e-mail.
  async updateStatus(req, res) {
    const status = req.body.status;
    if (!ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status deve ser um de: ${ORDER_STATUSES.join(', ')}` });
    }
    const conn = await pool.getConnection();
    let restored = [];
    let order;
    let points = 0;
    let reversal = { reversed: 0 };
    let loyaltyReversed = false;
    let pointsRefunded = 0;
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query('SELECT * FROM orders WHERE id = ? FOR UPDATE', [req.params.id]);
      order = rows[0];
      if (!order) throw httpError(404, 'Pedido não encontrado');
      if (order.status === status) {
        await conn.rollback();
        conn.release();
        return res.json({
          message: 'Status inalterado', status, changed: false, stock_restored: false,
          loyalty_points: 0, loyalty_reversed: false, loyalty_points_reversed: 0, points_refunded: 0, payment_refund_needed: false,
        });
      }
      if (order.status === 'cancelled') throw httpError(409, 'Pedido cancelado não pode mudar de status');

      if (status === 'cancelled') {
        // Mesma rotina de cancelamento do pagamento e da varredura.
        const cancelled = await cancelOrderInTx(conn, order, req.user?.username);
        restored = cancelled.restored;
        loyaltyReversed = cancelled.loyaltyReversed;
        reversal = { reversed: cancelled.pointsReversed };
        pointsRefunded = cancelled.pointsRefunded;
      } else {
        await conn.query('UPDATE orders SET status = ? WHERE id = ?', [status, order.id]);
      }
      if (status === 'delivered' && !order.loyalty_awarded && order.customer_email) {
        const [mark] = await conn.query(
          'UPDATE orders SET loyalty_awarded = TRUE WHERE id = ? AND loyalty_awarded = FALSE',
          [order.id]
        );
        if (mark.affectedRows === 1) {
          const amount = Number(order.total) - Number(order.shipping_price || 0) - Number(order.gift_wrap_price || 0);
          points = await earnPoints(conn, {
            orderId: order.id, customerEmail: order.customer_email, customerName: order.customer_name, amount,
          });
        }
      }
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      conn.release();
      return sendError(res, error, 'Erro ao atualizar status');
    }
    conn.release();

    auditReq(req, 'update_status', 'order', order.id, {
      from: order.status, to: status, stock_restored: restored.length > 0, points,
      loyalty_reversed: loyaltyReversed ? reversal.reversed : undefined,
    });
    restored.forEach((productId) => notifySubscribers(productId).catch(() => {}));
    if (order.customer_email) {
      sendLater(order.customer_email, () => orderStatusEmail(order, status, status === 'shipped' ? order.tracking_code : null));
    }
    // Pedido cancelado com Pix ou cartão ainda aberto: cancela lá também, para
    // o cliente não pagar um pedido que não vai sair.
    if (status === 'cancelled' && isPaymentEnabled()) {
      cancelOpenProviderPayments(order.id)
        .catch((error) => console.error(`[Pagamento] Cancelar pagamentos do pedido #${order.id}: ${error.message}`));
    }
    res.json({
      message: 'Status atualizado',
      status,
      changed: true,
      stock_restored: restored.length > 0,
      loyalty_points: points,
      loyalty_reversed: loyaltyReversed,
      loyalty_points_reversed: reversal.reversed,
      points_refunded: pointsRefunded,
      // Pedido pago e cancelado: o dinheiro só volta com o estorno no painel.
      payment_refund_needed: status === 'cancelled' && order.payment_status === 'approved',
    });
  },

  // Admin: grava o rastreio e, se o pedido ainda não saiu, marca como enviado.
  async updateTracking(req, res) {
    const connection = await pool.getConnection();
    let order;
    let newStatus;
    let waLink = null;
    try {
      const { tracking_code } = req.body;
      await connection.beginTransaction();
      const [orders] = await connection.query(
        'SELECT * FROM orders WHERE id = ? FOR UPDATE',
        [req.params.id]
      );
      if (orders.length === 0) throw httpError(404, 'Pedido não encontrado');
      order = orders[0];
      if (order.status === 'cancelled') throw httpError(409, 'Pedido cancelado não recebe rastreio');

      newStatus = BEFORE_SHIPPED.includes(order.status) ? 'shipped' : order.status;
      await connection.query('UPDATE orders SET tracking_code = ?, status = ? WHERE id = ?', [tracking_code, newStatus, order.id]);
      if (order.customer_phone) {
        const notification = await createWhatsAppNotification(connection, { ...order, tracking_code });
        waLink = notification.wa_link;
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      connection.release();
      return sendError(res, error, 'Erro ao atualizar rastreio');
    }
    connection.release();

    const trackingCode = req.body.tracking_code;
    auditReq(req, 'update_tracking', 'order', order.id, { tracking_code: trackingCode, from: order.status, to: newStatus });
    const becameShipped = newStatus === 'shipped' && order.status !== 'shipped';
    const codeChanged = newStatus === 'shipped' && order.tracking_code !== trackingCode;
    if (order.customer_email && (becameShipped || codeChanged)) {
      sendLater(order.customer_email, () => orderStatusEmail(order, 'shipped', trackingCode));
    }
    res.json({ message: 'Código de rastreio atualizado', wa_link: waLink, status: newStatus });
  },

  async addNote(req, res) {
    try {
      const note = String(req.body.note || '').trim();
      if (!note || note.length > 2000) return res.status(400).json({ error: 'A nota deve ter de 1 a 2000 caracteres' });
      const [orders] = await pool.query('SELECT id FROM orders WHERE id = ?', [req.params.id]);
      if (!orders.length) return res.status(404).json({ error: 'Pedido não encontrado' });
      const admin_username = req.user?.username || 'admin';
      const [result] = await pool.query(
        'INSERT INTO order_notes (order_id, admin_username, note) VALUES (?, ?, ?)',
        [req.params.id, admin_username, note]
      );
      auditReq(req, 'add_note', 'order', req.params.id);
      res.status(201).json({ id: result.insertId, message: 'Nota adicionada' });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao adicionar nota' });
    }
  },

  // CSV com os mesmos filtros da lista (status, datas e busca).
  async exportCsv(req, res) {
    try {
      const { where, params } = buildOrderFilters(req.query);
      const [rows] = await pool.query(
        `SELECT o.id, o.created_at, o.status, o.customer_name, o.customer_email, o.customer_phone,
           o.subtotal, o.discount_amount, o.coupon_code, o.shipping_type, o.shipping_price, o.gift_wrap_price, o.total,
           o.tracking_code, o.address_street, o.address_number, o.address_complement, o.address_neighborhood,
           o.address_city, o.address_state, o.address_cep,
           (SELECT SUM(quantity) FROM order_items WHERE order_id = o.id) AS items_count
         FROM orders o ${where}
         ORDER BY o.created_at DESC LIMIT 10000`,
        params
      );
      const header = 'ID,Data,Status,Nome,Email,Telefone,Itens,Subtotal,Desconto,Cupom,Frete,Valor frete,Embrulho,Total,Rastreio,Endereco,Numero,Complemento,Bairro,Cidade,UF,CEP\n';
      const csv = header + rows.map(r => [
        r.id, new Date(r.created_at).toLocaleString('pt-BR'), r.status, r.customer_name, r.customer_email, r.customer_phone,
        r.items_count, r.subtotal, r.discount_amount, r.coupon_code, r.shipping_type, r.shipping_price, r.gift_wrap_price, r.total,
        r.tracking_code, r.address_street, r.address_number, r.address_complement, r.address_neighborhood,
        r.address_city, r.address_state, r.address_cep,
      ].map(csvCell).join(',')).join('\n');
      auditReq(req, 'export_csv', 'order', null, { filters: req.query, rows: rows.length });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="pedidos.csv"');
      res.send('﻿' + csv);
    } catch (error) {
      sendError(res, error, 'Erro ao exportar');
    }
  },

  // Só pedido cancelado pode ser apagado (o estoque já voltou no cancelamento).
  async delete(req, res) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query('SELECT id, status FROM orders WHERE id = ? FOR UPDATE', [req.params.id]);
      if (!rows.length) throw httpError(404, 'Pedido não encontrado');
      if (rows[0].status !== 'cancelled') throw httpError(409, 'Cancele o pedido antes de apagar');
      const [[{ payments }]] = await conn.query('SELECT COUNT(*) AS payments FROM payments WHERE order_id = ?', [req.params.id]);
      if (Number(payments) > 0) throw httpError(409, 'Pedido com pagamento registrado não pode ser apagado');
      await conn.query('DELETE FROM whatsapp_notifications WHERE order_id = ?', [req.params.id]);
      await conn.query('DELETE FROM shipping_labels WHERE order_id = ?', [req.params.id]);
      await conn.query('DELETE FROM coupon_redemptions WHERE order_id = ?', [req.params.id]);
      await conn.query('DELETE FROM order_items WHERE order_id = ?', [req.params.id]);
      await conn.query('DELETE FROM orders WHERE id = ?', [req.params.id]);
      await conn.commit();
      auditReq(req, 'delete', 'order', req.params.id);
      res.json({ message: 'Pedido removido' });
    } catch (error) {
      await conn.rollback();
      sendError(res, error, 'Erro ao remover pedido');
    } finally {
      conn.release();
    }
  }
};

module.exports = orderController;
module.exports.ORDER_STATUSES = ORDER_STATUSES;
