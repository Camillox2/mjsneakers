const crypto = require('crypto');
const { pool } = require('../config/db');
const mp = require('./mercadoPago');
const { cancelOrderInTx } = require('../utils/orderCancel');
const { logAudit } = require('../controllers/auditController');
const { notifySubscribers } = require('../controllers/stockAlertController');
const { getSettingValue } = require('../controllers/settingsController');
const { orderConfirmationEmail, adminNewOrderEmail, paymentAlertEmail } = require('./emailService');
const { sendLater, notifyAdmins } = require('../utils/notify');
const { roundMoney } = require('../utils/pricing');
const { autoEmitOnApproval } = require('./invoiceService');

// Pagamentos pelo Mercado Pago (Pix e cartão). Toda mudança de estado passa
// por applyProviderPayment, a mesma máquina de estados do webhook, da
// sincronização do admin, do cartão aprovado na hora e da varredura.

const STORE_NAME = 'Pizantt Drop';
const STATEMENT_DESCRIPTOR = 'PIZANTTDROP';
// Status do Mercado Pago que ainda podem virar pagamento.
const ACTIVE_STATUSES = ['pending', 'in_process', 'authorized'];
const PAYABLE_ORDER_STATES = ['unpaid', 'rejected', 'expired'];

const { httpError } = mp;

// ---------- Token de acesso do pedido (a loja recebe uma vez só) ----------
function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function newOrderToken() {
  const token = crypto.randomBytes(32).toString('hex');
  return { token, hash: hashToken(token) };
}

// Compara em tempo constante; pedido sem hash (antigo) nunca confere.
function tokenMatches(order, token) {
  if (!order || !order.access_token_hash || typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return false;
  const expected = Buffer.from(order.access_token_hash, 'hex');
  const received = Buffer.from(hashToken(token), 'hex');
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

// ---------- Configurações ----------
async function paymentSettings() {
  const clamp = (value, min, max, fallback) => {
    const n = Number(String(value ?? '').replace(',', '.'));
    if (value === '' || value === null || value === undefined || !Number.isFinite(n)) return fallback;
    return Math.min(Math.max(n, min), max);
  };
  const [maxRaw, pixRaw] = await Promise.all([
    getSettingValue('payment_max_installments').catch(() => ''),
    getSettingValue('payment_pix_discount').catch(() => ''),
  ]);
  return {
    maxInstallments: Math.floor(clamp(maxRaw, 1, 12, 12)),
    pixDiscountPercent: clamp(pixRaw, 0, 20, 0),
  };
}

async function publicConfig() {
  const cfg = mp.mpConfig();
  const settings = await paymentSettings();
  return {
    enabled: cfg.enabled,
    public_key: cfg.enabled ? cfg.publicKey : null,
    test_mode: cfg.testMode,
    max_installments: settings.maxInstallments,
    pix_discount_percent: settings.pixDiscountPercent,
    pix_expiration_minutes: cfg.pixExpirationMinutes,
  };
}

function adminConfig() {
  const cfg = mp.mpConfig();
  return {
    enabled: cfg.enabled,
    test_mode: cfg.testMode,
    has_access_token: Boolean(cfg.accessToken),
    has_public_key: Boolean(cfg.publicKey),
    has_webhook_secret: Boolean(cfg.webhookSecret),
    webhook_url: cfg.webhookUrl,
    api_public_url: cfg.apiPublicUrl || null,
  };
}

function requireEnabled() {
  if (!mp.isPaymentEnabled()) throw httpError(503, 'Pagamento online indisponível no momento');
}

// ---------- Mensagens do cartão ----------
const CARD_MESSAGES = {
  accredited: 'Pagamento aprovado!',
  pending_contingency: 'Estamos processando o pagamento. Em até 2 dias úteis você recebe o resultado por e-mail.',
  pending_review_manual: 'Seu pagamento está em análise. Em até 2 dias úteis você recebe o resultado por e-mail.',
  cc_rejected_insufficient_amount: 'O cartão não tem limite suficiente. Tente outro cartão ou pague com Pix.',
  cc_rejected_bad_filled_security_code: 'Código de segurança inválido. Confira o CVV do cartão.',
  cc_rejected_bad_filled_date: 'Data de validade inválida. Confira o vencimento do cartão.',
  cc_rejected_bad_filled_other: 'Confira os dados do cartão e tente de novo.',
  cc_rejected_call_for_authorize: 'O banco pediu autorização. Ligue para a central do cartão e tente de novo.',
  cc_rejected_card_disabled: 'O cartão está bloqueado. Fale com o banco para ativar ou use outro cartão.',
  cc_rejected_duplicated_payment: 'Você já fez um pagamento com esse valor. Se precisar pagar de novo, use outro cartão ou o Pix.',
  cc_rejected_high_risk: 'O pagamento foi recusado por segurança. Tente outro cartão ou pague com Pix.',
  cc_rejected_max_attempts: 'Você atingiu o limite de tentativas. Tente outro cartão ou pague com Pix.',
};
const GENERIC_REJECTED = 'O pagamento foi recusado. Tente outro cartão ou pague com Pix.';
const GENERIC_PENDING = 'Seu pagamento está em análise. Você recebe o resultado por e-mail.';

function cardStatus(status) {
  if (status === 'approved') return 'approved';
  if (status === 'in_process' || status === 'authorized') return 'in_process';
  if (status === 'pending') return 'pending';
  return 'rejected';
}

function cardMessage(status, detail) {
  if (CARD_MESSAGES[detail]) return CARD_MESSAGES[detail];
  const mapped = cardStatus(status);
  if (mapped === 'approved') return CARD_MESSAGES.accredited;
  if (mapped === 'rejected') return GENERIC_REJECTED;
  return GENERIC_PENDING;
}

// ---------- Apoio ----------
function orderIdFromReference(reference) {
  const match = /^order-(\d+)$/.exec(String(reference || ''));
  return match ? Number(match[1]) : null;
}

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0]?.slice(0, 60) || 'Cliente';
}

// Tira campos vazios (o Mercado Pago só recebe dado que o pedido tem).
function compact(value) {
  if (Array.isArray(value)) return value.map(compact);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    const clean = compact(item);
    if (clean === undefined || clean === null || clean === '') continue;
    if (typeof clean === 'object' && !Array.isArray(clean) && Object.keys(clean).length === 0) continue;
    out[key] = clean;
  }
  return out;
}

// Telefone do pedido em DDD + número (sem o 55); fora do formato, não vai.
function splitPhone(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.length >= 12 && digits.startsWith('55')) digits = digits.slice(2);
  if (digits.length < 10 || digits.length > 11) return undefined;
  return { area_code: digits.slice(0, 2), number: digits.slice(2) };
}

// Dados do pedido que ajudam a aprovar o cartão e a barrar fraude:
// additional_info.items e additional_info.payer, mais nome e endereço no payer.
async function antifraudData(conn, order) {
  const [items] = await conn.query(
    `SELECT oi.product_id, oi.quantity, oi.price, p.name FROM order_items oi
     LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ? ORDER BY oi.id`,
    [order.id]
  );
  const names = String(order.customer_name || '').trim().split(/\s+/).filter(Boolean);
  const firstNamePart = names[0];
  const lastNamePart = names.slice(1).join(' ');
  const streetNumber = /^\d{1,9}$/.test(String(order.address_number || '').trim()) ? Number(order.address_number) : undefined;
  return {
    additionalInfo: compact({
      items: items.map((item) => ({
        id: String(item.product_id),
        title: String(item.name || `Produto ${item.product_id}`).slice(0, 256),
        quantity: Number(item.quantity),
        unit_price: Number(item.price),
        category_id: 'fashion',
      })),
      payer: {
        first_name: firstNamePart,
        last_name: lastNamePart,
        phone: splitPhone(order.customer_phone),
        address: { zip_code: order.address_cep, street_name: order.address_street, street_number: streetNumber },
      },
    }),
    payerExtra: compact({
      first_name: firstNamePart,
      last_name: lastNamePart,
      address: {
        zip_code: order.address_cep,
        street_name: order.address_street,
        street_number: order.address_number ? String(order.address_number) : undefined,
        neighborhood: order.address_neighborhood,
        city: order.address_city,
        federal_unit: order.address_state,
      },
    }),
  };
}

function pixView(row) {
  if (!row) return null;
  return {
    qr_code: row.qr_code,
    qr_code_base64: row.qr_code_base64,
    ticket_url: row.ticket_url,
    expires_at: row.expires_at,
  };
}

async function hasOtherActivePayment(conn, orderId, providerId) {
  const [[row]] = await conn.query(
    `SELECT COUNT(*) AS total FROM payments
     WHERE order_id = ? AND superseded = 0 AND (provider_payment_id IS NULL OR provider_payment_id <> ?)
       AND status IN ('pending','in_process','authorized','approved')`,
    [orderId, providerId]
  );
  return Number(row.total) > 0;
}

async function loadOrderItems(orderId) {
  const [items] = await pool.query(
    `SELECT oi.product_id, oi.size, oi.quantity, oi.price, p.name AS product_name
     FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?`,
    [orderId]
  );
  return items;
}

function audit(actor, action, orderId, details) {
  logAudit({
    adminId: actor?.id || null,
    adminUsername: actor?.username || 'mercadopago',
    action,
    entity: 'order',
    entityId: orderId,
    details,
  });
}

// ---------- Máquina de estados ----------
/**
 * Aplica o pagamento do Mercado Pago (já buscado na API, nunca o corpo do
 * webhook) ao nosso registro e ao pedido, numa transação. Idempotente:
 * o mesmo estado aplicado duas vezes não muda nada.
 * Devolve { ignored } ou { order_id, order_status, payment_status, changes }.
 */
async function applyProviderPayment(payment, { actor = null, source = 'webhook' } = {}) {
  if (!payment || payment.id === undefined || payment.id === null) return { ignored: true, reason: 'sem id' };
  const providerId = String(payment.id);
  const mpStatus = String(payment.status || '');
  const detail = payment.status_detail ? String(payment.status_detail).slice(0, 80) : null;
  const amount = roundMoney(Number(payment.transaction_amount) || 0);
  const installments = Number.isInteger(Number(payment.installments)) ? Number(payment.installments) : null;

  const conn = await pool.getConnection();
  const effects = { approvedNow: false, approvedOnCancelled: false, duplicate: false, cancelled: null, statusChanged: false };
  let order;
  let result;
  try {
    await conn.beginTransaction();
    let [rows] = await conn.query('SELECT * FROM payments WHERE provider_payment_id = ? FOR UPDATE', [providerId]);
    let row = rows[0];
    if (!row) {
      // Pagamento que não temos (ex.: resposta perdida): acha pelo external_reference.
      const orderId = orderIdFromReference(payment.external_reference);
      if (!orderId) {
        await conn.rollback();
        return { ignored: true, reason: 'external_reference desconhecido' };
      }
      const [orders] = await conn.query('SELECT id FROM orders WHERE id = ?', [orderId]);
      if (!orders.length) {
        await conn.rollback();
        return { ignored: true, reason: 'pedido inexistente' };
      }
      await conn.query(
        `INSERT INTO payments (order_id, provider, provider_payment_id, method, status, status_detail, amount, installments, idempotency_key)
         VALUES (?, 'mercadopago', ?, ?, 'unknown', ?, ?, ?, ?)`,
        [orderId, providerId, mp.methodOf(payment), detail, amount, installments, `recuperado-${providerId}`.slice(0, 64)]
      );
      [rows] = await conn.query('SELECT * FROM payments WHERE provider_payment_id = ? FOR UPDATE', [providerId]);
      row = rows[0];
    }

    const [orderRows] = await conn.query('SELECT * FROM orders WHERE id = ? FOR UPDATE', [row.order_id]);
    order = orderRows[0];
    const previousStatus = row.status;
    const sameAsBefore = previousStatus === mpStatus;

    await conn.query(
      `UPDATE payments SET status = ?, status_detail = ?, amount = ?, installments = COALESCE(?, installments), raw = ?
       WHERE id = ?`,
      [mpStatus, detail, amount, installments, JSON.stringify(mp.sanitizePayment(payment)), row.id]
    );

    const orderUpdate = {};
    if (mpStatus === 'approved') {
      if (!sameAsBefore) {
        if (order.payment_status === 'approved') {
          effects.duplicate = true;
        } else {
          orderUpdate.payment_status = 'approved';
          orderUpdate.payment_method = row.method;
          orderUpdate.payment_installments = installments;
          const paidAt = payment.date_approved ? new Date(payment.date_approved) : new Date();
          orderUpdate.paid_at = Number.isNaN(paidAt.getTime()) ? new Date() : paidAt;
          // Pix com desconto: o total do pedido passa a ser o valor pago.
          if (row.method === 'pix' && amount > 0 && amount < Number(order.total) - 0.004) {
            orderUpdate.pix_discount_amount = roundMoney(Number(order.total) - amount);
            orderUpdate.total = amount;
          }
          if (order.status === 'pending') {
            orderUpdate.status = 'confirmed';
            effects.approvedNow = true;
          } else if (order.status === 'cancelled') {
            effects.approvedOnCancelled = true;
          }
        }
      }
    } else if (ACTIVE_STATUSES.includes(mpStatus)) {
      if (PAYABLE_ORDER_STATES.includes(order.payment_status)) orderUpdate.payment_status = 'pending';
    } else if (mpStatus === 'rejected') {
      if (['unpaid', 'pending'].includes(order.payment_status) && !(await hasOtherActivePayment(conn, order.id, providerId))) {
        orderUpdate.payment_status = 'rejected';
      }
    } else if (mpStatus === 'cancelled' || mpStatus === 'expired') {
      // Pix vencido ou pagamento cancelado sem pagar: cancela o pedido. O Pix
      // que nós mesmos cancelamos para trocar por cartão (superseded) não conta.
      if (!row.superseded && order.payment_status !== 'approved' && !(await hasOtherActivePayment(conn, order.id, providerId))) {
        if (order.payment_status !== 'expired') orderUpdate.payment_status = 'expired';
        if (order.status === 'pending') {
          effects.cancelled = await cancelOrderInTx(conn, order, actor?.username || 'mercadopago');
        }
      }
    } else if (mpStatus === 'refunded' || mpStatus === 'charged_back') {
      if (!sameAsBefore) {
        // Só mexe no pedido se foi este o pagamento que pagou o pedido.
        const [[{ approvedOthers }]] = await conn.query(
          `SELECT COUNT(*) AS approvedOthers FROM payments
           WHERE order_id = ? AND provider_payment_id <> ? AND status = 'approved'`,
          [order.id, providerId]
        );
        if (Number(approvedOthers) === 0) {
          orderUpdate.payment_status = mpStatus;
          if (!['shipped', 'delivered', 'cancelled'].includes(order.status)) {
            effects.cancelled = await cancelOrderInTx(conn, order, actor?.username || 'mercadopago');
          }
        }
      }
    }

    const columns = Object.keys(orderUpdate).filter((key) => orderUpdate[key] !== undefined);
    if (columns.length) {
      await conn.query(
        `UPDATE orders SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
        [...columns.map((c) => orderUpdate[c]), order.id]
      );
      effects.statusChanged = true;
    }
    await conn.commit();

    const [[fresh]] = await pool.query('SELECT id, status, payment_status FROM orders WHERE id = ?', [order.id]);
    result = { order_id: order.id, order_status: fresh.status, payment_status: fresh.payment_status, provider_status: mpStatus };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }

  // Efeitos fora da transação: auditoria, e-mails e avisos de estoque.
  if (effects.statusChanged || effects.duplicate) {
    audit(actor, `payment_${mpStatus || 'update'}`, order.id, {
      source, provider_payment_id: providerId, status_detail: detail, amount,
      order_status: result.order_status, payment_status: result.payment_status,
    });
  }
  if (effects.approvedNow) {
    const items = await loadOrderItems(order.id).catch(() => []);
    const [[paidOrder]] = await pool.query('SELECT * FROM orders WHERE id = ?', [order.id]);
    sendLater(paidOrder.customer_email, () => orderConfirmationEmail(paidOrder, items));
    notifyAdmins(() => adminNewOrderEmail(paidOrder, items));
    // Nota fiscal automática (fiscal_auto_emit): o CPF vai só em memória.
    autoEmitOnApproval(order.id, payment);
  }
  if (effects.approvedOnCancelled) {
    notifyAdmins(() => paymentAlertEmail({
      orderId: order.id,
      title: 'Pagamento aprovado em pedido cancelado',
      text: 'O cliente pagou depois do cancelamento. Estorne o pagamento pelo painel ou combine a entrega com o cliente.',
    }));
  }
  if (effects.duplicate) {
    notifyAdmins(() => paymentAlertEmail({
      orderId: order.id,
      title: 'Pagamento em dobro',
      text: 'Um segundo pagamento foi aprovado para um pedido que já estava pago. Estorne um deles pelo painel.',
    }));
  }
  if (effects.cancelled) {
    effects.cancelled.restored.forEach((productId) => notifySubscribers(productId).catch(() => {}));
  }
  return result;
}

// Busca o pagamento na API e aplica.
async function syncProviderPayment(providerId, options) {
  const { status, data } = await mp.mpRequest('GET', `/v1/payments/${encodeURIComponent(providerId)}`);
  if (status === 404) return { ignored: true, reason: 'pagamento não encontrado no Mercado Pago' };
  if (status >= 400 || !data) throw httpError(502, 'Não foi possível consultar o pagamento no Mercado Pago');
  return applyProviderPayment(data, options);
}

// Cancela no Mercado Pago os pagamentos ainda abertos do pedido (Pix que o
// cliente trocou por cartão, pedido cancelado pelo admin ou vencido). Marca
// antes como superseded para o webhook de cancelamento não mexer no pedido.
async function cancelOpenProviderPayments(orderId, { onlyPix = false } = {}) {
  const [rows] = await pool.query(
    `SELECT id, provider_payment_id, method FROM payments
     WHERE order_id = ? AND superseded = 0 AND provider_payment_id IS NOT NULL AND status IN ('pending','in_process','authorized')`,
    [orderId]
  );
  const results = [];
  for (const row of rows) {
    if (onlyPix && row.method !== 'pix') continue;
    await pool.query('UPDATE payments SET superseded = 1 WHERE id = ?', [row.id]);
    const { status, data } = await mp.mpRequest('PUT', `/v1/payments/${encodeURIComponent(row.provider_payment_id)}`, {
      body: { status: 'cancelled' },
    });
    let final = status < 400 && data ? data : null;
    if (!final || final.status !== 'cancelled') {
      // Não cancelou: confere se já tinha vencido ou sido recusado lá.
      const check = await mp.mpRequest('GET', `/v1/payments/${encodeURIComponent(row.provider_payment_id)}`);
      final = check.status < 400 ? check.data : null;
    }
    const ok = Boolean(final) && ['cancelled', 'rejected', 'expired'].includes(final.status);
    if (ok) {
      await pool.query('UPDATE payments SET status = ?, status_detail = ?, raw = ? WHERE id = ?',
        [final.status, final.status_detail || 'by_collector', JSON.stringify(mp.sanitizePayment(final)), row.id]);
    } else {
      await pool.query('UPDATE payments SET superseded = 0 WHERE id = ?', [row.id]);
    }
    results.push({ id: row.id, cancelled: ok, provider_status: final?.status || null });
  }
  return results;
}

// ---------- Pix ----------
async function createPix({ orderId, accessToken, cpf }) {
  requireEnabled();
  const cfg = mp.mpConfig();
  const settings = await paymentSettings();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [orders] = await conn.query('SELECT * FROM orders WHERE id = ? FOR UPDATE', [orderId]);
    const order = orders[0];
    if (!order || !tokenMatches(order, accessToken)) throw httpError(404, 'Pedido não encontrado');
    if (order.payment_status === 'approved') throw httpError(409, 'Este pedido já está pago');
    if (order.status !== 'pending') throw httpError(409, 'Este pedido não aceita mais pagamento');

    // Pix ainda válido: devolve o mesmo, sem criar outro.
    const [existing] = await conn.query(
      `SELECT * FROM payments WHERE order_id = ? AND method = 'pix' AND superseded = 0
         AND status = 'pending' AND expires_at > NOW()
       ORDER BY id DESC LIMIT 1`,
      [order.id]
    );
    const subtotal = Number(order.subtotal ?? order.total);
    const discount = roundMoney(Math.min(subtotal * (settings.pixDiscountPercent / 100), Number(order.total)));
    if (existing.length) {
      await conn.commit();
      const row = existing[0];
      return {
        reused: true,
        body: {
          payment_id: row.id, status: 'pending', amount: Number(row.amount), original_amount: Number(order.total),
          discount_amount: roundMoney(Number(order.total) - Number(row.amount)), ...pixView(row),
        },
      };
    }
    if (!PAYABLE_ORDER_STATES.includes(order.payment_status)) {
      // 'pending' só aceita Pix novo se o que está aberto é Pix já vencido.
      const [open] = await conn.query(
        `SELECT id, method, expires_at FROM payments WHERE order_id = ? AND superseded = 0
           AND status IN ('pending','in_process','authorized')`,
        [order.id]
      );
      const blocking = open.filter((row) => row.method !== 'pix' || !row.expires_at || new Date(row.expires_at) > new Date());
      if (blocking.length) throw httpError(409, 'Já existe um pagamento em análise para este pedido');
      // Pix vencido fica marcado: o aviso de expiração dele não cancela o pedido.
      if (open.length) await conn.query('UPDATE payments SET superseded = 1 WHERE id IN (?)', [open.map((row) => row.id)]);
    }

    const amount = roundMoney(Number(order.total) - discount);
    if (amount < 0.01) throw httpError(409, 'Este pedido não tem valor a pagar');
    const idempotencyKey = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + cfg.pixExpirationMinutes * 60000);
    const requestBody = {
      transaction_amount: amount,
      description: `Pedido #${order.id} ${STORE_NAME}`,
      payment_method_id: 'pix',
      external_reference: `order-${order.id}`,
      date_of_expiration: mp.isoWithOffset(expiresAt),
      payer: {
        email: order.customer_email,
        first_name: firstName(order.customer_name),
        identification: { type: 'CPF', number: cpf },
      },
    };
    if (cfg.webhookUrl) requestBody.notification_url = cfg.webhookUrl;

    const { status, data } = await mp.mpRequest('POST', '/v1/payments', { body: requestBody, idempotencyKey });
    if (status >= 400 || !data || data.id === undefined) {
      if (status >= 400 && status < 500) throw httpError(400, 'O Mercado Pago recusou os dados do pagamento. Confira o CPF e tente de novo.');
      throw httpError(502, 'Não foi possível gerar o Pix agora. Tente novamente em instantes.');
    }
    const tx = data.point_of_interaction?.transaction_data || {};
    const providerExpires = data.date_of_expiration ? new Date(data.date_of_expiration) : expiresAt;
    const [insert] = await conn.query(
      `INSERT INTO payments (order_id, provider, provider_payment_id, method, status, status_detail, amount, installments,
         qr_code, qr_code_base64, ticket_url, expires_at, idempotency_key, raw)
       VALUES (?, 'mercadopago', ?, 'pix', ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
      [order.id, String(data.id), data.status || 'pending', data.status_detail || null, amount,
        tx.qr_code || null, tx.qr_code_base64 || null, tx.ticket_url || null,
        Number.isNaN(providerExpires.getTime()) ? expiresAt : providerExpires, idempotencyKey,
        JSON.stringify(mp.sanitizePayment(data))]
    );
    await conn.query("UPDATE orders SET payment_status = 'pending', payment_method = 'pix' WHERE id = ?", [order.id]);
    await conn.commit();
    const [[row]] = await pool.query('SELECT * FROM payments WHERE id = ?', [insert.insertId]);
    return {
      reused: false,
      body: {
        payment_id: row.id, status: 'pending', amount, original_amount: Number(order.total), discount_amount: discount,
        ...pixView(row),
      },
    };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

// ---------- Cartão (Card Payment Brick) ----------
async function payWithCard({ orderId, accessToken, token, issuerId, paymentMethodId, installments, payer }) {
  requireEnabled();
  const cfg = mp.mpConfig();
  const settings = await paymentSettings();
  if (installments > settings.maxInstallments) {
    throw httpError(400, `Parcelamento máximo de ${settings.maxInstallments}x`);
  }

  const conn = await pool.getConnection();
  let payment;
  let ourPaymentId = null;
  let amount;
  try {
    await conn.beginTransaction();
    const [orders] = await conn.query('SELECT * FROM orders WHERE id = ? FOR UPDATE', [orderId]);
    const order = orders[0];
    if (!order || !tokenMatches(order, accessToken)) throw httpError(404, 'Pedido não encontrado');
    if (order.payment_status === 'approved') throw httpError(409, 'Este pedido já está pago');
    if (order.status !== 'pending') throw httpError(409, 'Este pedido não aceita mais pagamento');

    const [open] = await conn.query(
      `SELECT method FROM payments WHERE order_id = ? AND superseded = 0 AND status IN ('pending','in_process','authorized')`,
      [order.id]
    );
    if (open.some((row) => row.method !== 'pix')) throw httpError(409, 'Já existe um pagamento em análise para este pedido');
    await conn.commit();

    // Cliente trocou o Pix pelo cartão: cancela o Pix aberto antes de cobrar.
    if (open.length) {
      const cancelled = await cancelOpenProviderPayments(order.id, { onlyPix: true });
      if (cancelled.some((c) => !c.cancelled)) {
        throw httpError(409, 'Não foi possível trocar o Pix pelo cartão agora. Se você já pagou o Pix, aguarde a confirmação.');
      }
    }

    amount = roundMoney(Number(order.total));
    const idempotencyKey = crypto.randomUUID();
    const extra = await antifraudData(conn, order);
    const requestBody = {
      transaction_amount: amount,
      token,
      description: `Pedido #${order.id} ${STORE_NAME}`,
      installments,
      payment_method_id: paymentMethodId,
      external_reference: `order-${order.id}`,
      statement_descriptor: STATEMENT_DESCRIPTOR,
      payer: {
        ...extra.payerExtra,
        email: payer.email,
        identification: { type: payer.identification.type, number: payer.identification.number },
      },
      additional_info: extra.additionalInfo,
    };
    if (issuerId) requestBody.issuer_id = issuerId;
    if (cfg.webhookUrl) requestBody.notification_url = cfg.webhookUrl;

    const { status, data } = await mp.mpRequest('POST', '/v1/payments', { body: requestBody, idempotencyKey });
    if (status >= 500 || !data) throw httpError(502, 'Não foi possível processar o pagamento agora. Tente novamente em instantes.');
    if (status >= 400 || data.id === undefined) {
      // Mercado Pago recusou a requisição (token vencido, dado inválido): é um desfecho, não erro nosso.
      const cause = Array.isArray(data.cause) && data.cause[0]?.code ? `mp_error_${data.cause[0].code}` : 'mp_invalid_request';
      return {
        payment_id: null, status: 'rejected', status_detail: String(cause).slice(0, 80),
        message: 'Não foi possível processar o cartão. Confira os dados e tente de novo.', amount, installments,
      };
    }
    payment = data;
    const [insert] = await pool.query(
      `INSERT INTO payments (order_id, provider, provider_payment_id, method, status, status_detail, amount, installments, idempotency_key, raw)
       VALUES (?, 'mercadopago', ?, ?, 'created', ?, ?, ?, ?, ?)`,
      [order.id, String(data.id), mp.methodOf(data), data.status_detail || null, amount, installments, idempotencyKey,
        JSON.stringify(mp.sanitizePayment(data))]
    );
    ourPaymentId = insert.insertId;
  } catch (error) {
    await conn.rollback().catch(() => {});
    throw error;
  } finally {
    conn.release();
  }

  // Mesma rotina do webhook (aprovado na hora já confirma o pedido).
  await applyProviderPayment(payment, { source: 'card' });
  return {
    payment_id: ourPaymentId,
    status: cardStatus(payment.status),
    status_detail: payment.status_detail || null,
    message: cardMessage(payment.status, payment.status_detail),
    amount,
    installments,
  };
}

// ---------- Consulta da loja (polling) ----------
async function orderPaymentStatus(orderId, accessToken) {
  const [orders] = await pool.query('SELECT * FROM orders WHERE id = ?', [orderId]);
  const order = orders[0];
  if (!order || !tokenMatches(order, accessToken)) throw httpError(404, 'Pedido não encontrado');
  const [payments] = await pool.query(
    'SELECT * FROM payments WHERE order_id = ? AND superseded = 0 ORDER BY id DESC LIMIT 1',
    [order.id]
  );
  const last = payments[0];
  const pixOpen = last && last.method === 'pix' && last.status === 'pending' && last.expires_at && new Date(last.expires_at) > new Date();
  return {
    order_id: order.id,
    order_status: order.status,
    payment_status: order.payment_status,
    payment_method: order.payment_method,
    installments: order.payment_installments,
    amount: last ? Number(last.amount) : Number(order.total),
    paid_at: order.paid_at,
    pix: pixOpen ? pixView(last) : null,
  };
}

// ---------- Admin ----------
async function syncOrder(orderId, actor) {
  const [orders] = await pool.query('SELECT id FROM orders WHERE id = ?', [orderId]);
  if (!orders.length) throw httpError(404, 'Pedido não encontrado');
  const [rows] = await pool.query(
    'SELECT provider_payment_id FROM payments WHERE order_id = ? AND provider_payment_id IS NOT NULL ORDER BY id',
    [orderId]
  );
  let ids = rows.map((row) => row.provider_payment_id);
  if (!ids.length) {
    // Sem registro local: procura pelo external_reference.
    const { status, data } = await mp.mpRequest('GET', `/v1/payments/search?external_reference=order-${orderId}&sort=date_created&criteria=desc`);
    if (status >= 400) throw httpError(502, 'Não foi possível consultar o Mercado Pago');
    ids = (data?.results || []).map((p) => String(p.id));
  }
  for (const id of ids) await syncProviderPayment(id, { actor, source: 'sync' });
  const [[order]] = await pool.query('SELECT id, status, payment_status FROM orders WHERE id = ?', [orderId]);
  const [payments] = await pool.query(
    `SELECT id, provider_payment_id, method, status, status_detail, amount, installments, created_at, updated_at
     FROM payments WHERE order_id = ? ORDER BY id`,
    [orderId]
  );
  return { order_id: order.id, order_status: order.status, payment_status: order.payment_status, synced: ids.length, payments };
}

async function refundPayment(paymentId, amount, actor) {
  requireEnabled();
  const [rows] = await pool.query('SELECT * FROM payments WHERE id = ?', [paymentId]);
  const row = rows[0];
  if (!row) throw httpError(404, 'Pagamento não encontrado');
  if (!row.provider_payment_id) throw httpError(409, 'Pagamento sem registro no Mercado Pago');

  // Confere no Mercado Pago que está aprovado antes de estornar.
  const current = await mp.mpRequest('GET', `/v1/payments/${encodeURIComponent(row.provider_payment_id)}`);
  if (current.status >= 400 || !current.data) throw httpError(502, 'Não foi possível consultar o pagamento no Mercado Pago');
  if (current.data.status !== 'approved') {
    await applyProviderPayment(current.data, { actor, source: 'refund' });
    throw httpError(409, `Só pagamento aprovado pode ser estornado (situação atual: ${current.data.status})`);
  }
  const paid = Number(current.data.transaction_amount) || 0;
  const alreadyRefunded = Number(current.data.transaction_amount_refunded) || 0;
  const available = roundMoney(paid - alreadyRefunded);
  if (amount !== undefined && (amount <= 0 || amount > available)) {
    throw httpError(400, `Valor do estorno deve ficar entre 0,01 e ${available.toFixed(2).replace('.', ',')}`);
  }

  const refund = await mp.mpRequest('POST', `/v1/payments/${encodeURIComponent(row.provider_payment_id)}/refunds`, {
    body: amount === undefined ? {} : { amount },
    idempotencyKey: crypto.randomUUID(),
  });
  if (refund.status >= 400 || !refund.data) throw httpError(502, 'O Mercado Pago não aceitou o estorno. Tente de novo.');

  const state = await syncProviderPayment(row.provider_payment_id, { actor, source: 'refund' });
  logAudit({
    adminId: actor?.id, adminUsername: actor?.username, action: 'refund', entity: 'payment', entityId: row.id,
    details: { order_id: row.order_id, amount: refund.data.amount ?? amount ?? available, refund_id: refund.data.id },
  });
  return {
    refund_id: refund.data.id ?? null,
    amount: Number(refund.data.amount ?? amount ?? available),
    order_id: row.order_id,
    order_status: state.order_status,
    payment_status: state.payment_status,
    provider_status: state.provider_status,
  };
}

// ---------- Varredura de pedidos não pagos ----------
let sweeping = false;
async function sweepUnpaidOrders() {
  if (!mp.isPaymentEnabled() || sweeping) return { skipped: true };
  sweeping = true;
  const summary = { checked: 0, approved: 0, cancelled: 0, kept: 0, errors: 0 };
  try {
    const { unpaidTtlMinutes } = mp.mpConfig();
    const [candidates] = await pool.query(
      `SELECT o.id FROM orders o
       WHERE o.status = 'pending' AND o.payment_status <> 'approved'
         AND (o.created_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)
           OR EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id AND p.method = 'pix' AND p.superseded = 0
                        AND p.status = 'pending' AND p.expires_at < NOW()))
       ORDER BY o.id LIMIT 100`,
      [unpaidTtlMinutes]
    );
    for (const { id } of candidates) {
      summary.checked += 1;
      try {
        // Antes de cancelar, confere cada pagamento no Mercado Pago.
        const [rows] = await pool.query(
          'SELECT provider_payment_id FROM payments WHERE order_id = ? AND provider_payment_id IS NOT NULL AND superseded = 0',
          [id]
        );
        for (const row of rows) await syncProviderPayment(row.provider_payment_id, { source: 'sweep' });

        const [[order]] = await pool.query('SELECT status, payment_status FROM orders WHERE id = ?', [id]);
        if (order.payment_status === 'approved') { summary.approved += 1; continue; }
        if (order.status !== 'pending') { summary.cancelled += 1; continue; }
        // Cartão em análise segue esperando o resultado.
        const [[{ inReview }]] = await pool.query(
          `SELECT COUNT(*) AS inReview FROM payments WHERE order_id = ? AND superseded = 0 AND method <> 'pix'
             AND status IN ('pending','in_process','authorized')`,
          [id]
        );
        if (Number(inReview) > 0) { summary.kept += 1; continue; }

        await cancelOpenProviderPayments(id).catch(() => []);
        const cancelled = await cancelUnpaidOrder(id);
        if (cancelled) summary.cancelled += 1;
        else summary.kept += 1;
      } catch (error) {
        summary.errors += 1;
        console.error(`[Pagamento] Varredura do pedido #${id}: ${error.message}`);
      }
    }
    if (summary.checked) console.log('[Pagamento] Varredura de pedidos não pagos:', JSON.stringify(summary));
    return summary;
  } finally {
    sweeping = false;
  }
}

// Cancela (com devolução de estoque) um pedido que ficou sem pagamento.
async function cancelUnpaidOrder(orderId) {
  const conn = await pool.getConnection();
  let result = null;
  try {
    await conn.beginTransaction();
    const [[order]] = await conn.query('SELECT * FROM orders WHERE id = ? FOR UPDATE', [orderId]);
    if (!order || order.status !== 'pending' || order.payment_status === 'approved') {
      await conn.rollback();
      return false;
    }
    result = await cancelOrderInTx(conn, order, 'varredura');
    await conn.query("UPDATE orders SET payment_status = 'expired' WHERE id = ?", [orderId]);
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
  logAudit({ adminUsername: 'varredura', action: 'cancel_unpaid', entity: 'order', entityId: orderId, details: { stock_restored: result.restored.length > 0 } });
  result.restored.forEach((productId) => notifySubscribers(productId).catch(() => {}));
  return true;
}

module.exports = {
  newOrderToken,
  tokenMatches,
  paymentSettings,
  publicConfig,
  adminConfig,
  applyProviderPayment,
  syncProviderPayment,
  cancelOpenProviderPayments,
  createPix,
  payWithCard,
  orderPaymentStatus,
  syncOrder,
  refundPayment,
  sweepUnpaidOrders,
  CARD_MESSAGES,
};
