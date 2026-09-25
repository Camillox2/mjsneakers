const crypto = require('crypto');
const { DB_TIMEZONE } = require('../config/db');

// Cliente mínimo da API do Mercado Pago, com o fetch do Node (sem SDK).
// As variáveis são lidas a cada chamada, para os testes poderem trocar.

const DEFAULT_API_BASE = 'https://api.mercadopago.com';
const REQUEST_TIMEOUT_MS = 15000;

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function positiveInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function mpConfig() {
  const accessToken = process.env.MP_ACCESS_TOKEN || '';
  const publicKey = process.env.MP_PUBLIC_KEY || '';
  const apiPublicUrl = String(process.env.API_PUBLIC_URL || '').replace(/\/+$/, '');
  return {
    accessToken,
    publicKey,
    webhookSecret: process.env.MP_WEBHOOK_SECRET || '',
    apiBase: String(process.env.MP_API_BASE || DEFAULT_API_BASE).replace(/\/+$/, ''),
    apiPublicUrl,
    webhookUrl: apiPublicUrl ? `${apiPublicUrl}/api/payments/webhook` : null,
    enabled: Boolean(accessToken && publicKey),
    testMode: accessToken.startsWith('TEST-'),
    pixExpirationMinutes: positiveInt(process.env.PIX_EXPIRATION_MINUTES, 30),
    unpaidTtlMinutes: positiveInt(process.env.UNPAID_ORDER_TTL_MINUTES, 60),
  };
}

function isPaymentEnabled() {
  return mpConfig().enabled;
}

// Chamada à API. Devolve { status, data }; rede fora ou tempo esgotado viram
// erro 502. Nunca registra o corpo enviado (pode ter token de cartão e CPF).
async function mpRequest(method, path, { body, idempotencyKey } = {}) {
  const cfg = mpConfig();
  if (!cfg.accessToken) throw httpError(503, 'Pagamento não configurado');
  const headers = { Authorization: `Bearer ${cfg.accessToken}`, Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['X-Idempotency-Key'] = idempotencyKey;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${cfg.apiBase}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    console.error(`[MercadoPago] ${method} ${path.replace(/\d{6,}/g, ':id')} sem resposta: ${error.name === 'AbortError' ? 'tempo esgotado' : error.message}`);
    throw httpError(502, 'Mercado Pago indisponível no momento');
  } finally {
    clearTimeout(timer);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    // Só status e códigos de causa vão para o log.
    const causes = Array.isArray(data?.cause) ? data.cause.map((c) => c.code).filter(Boolean).join(',') : '';
    console.error(`[MercadoPago] ${method} ${path.replace(/\d{6,}/g, ':id')} respondeu ${response.status}${data?.message ? `: ${String(data.message).slice(0, 120)}` : ''}${causes ? ` (causa ${causes})` : ''}`);
  }
  return { status: response.status, data };
}

// Data no formato do Mercado Pago com o fuso da loja, ex.:
// 2026-09-25T14:30:00.000-03:00
function isoWithOffset(date, offset = DB_TIMEZONE) {
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(offset) || ['', '-', '03', '00'];
  const minutes = (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3]));
  return new Date(date.getTime() + minutes * 60000).toISOString().replace('Z', offset);
}

// Guarda só o que interessa do pagamento: nada do pagador, do cartão nem do QR.
function sanitizePayment(payment) {
  if (!payment || typeof payment !== 'object') return null;
  const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj && obj[k] !== undefined).map((k) => [k, obj[k]]));
  return {
    ...pick(payment, [
      'id', 'status', 'status_detail', 'payment_method_id', 'payment_type_id', 'issuer_id', 'currency_id',
      'transaction_amount', 'transaction_amount_refunded', 'installments', 'external_reference',
      'date_created', 'date_approved', 'date_last_updated', 'date_of_expiration', 'money_release_date', 'live_mode',
    ]),
    transaction_details: pick(payment.transaction_details, ['net_received_amount', 'total_paid_amount', 'installment_amount']),
    refunds: Array.isArray(payment.refunds)
      ? payment.refunds.map((r) => pick(r, ['id', 'amount', 'status', 'date_created']))
      : undefined,
  };
}

// Janela aceita entre o ts da assinatura e o relógio do servidor (contra
// reenvio de notificação antiga capturada).
const WEBHOOK_MAX_SKEW_MS = 10 * 60 * 1000;

// O exemplo da documentação traz ts em segundos (ts=1704908010); aceita
// também milissegundos (13 dígitos ou mais).
function tsToMs(ts) {
  if (!/^\d{9,16}$/.test(String(ts))) return null;
  const n = Number(ts);
  return String(ts).length >= 13 ? n : n * 1000;
}

// Valida o header x-signature do webhook ("ts=...,v1=..."). O manifesto é
// id:{data.id};request-id:{x-request-id};ts:{ts}; e a assinatura é o HMAC
// SHA-256 hex dele com a chave secreta. Comparação em tempo constante, e o ts
// tem que estar a no máximo 10 min do relógio do servidor.
function verifyWebhookSignature({ signature, requestId, dataId, secret, now = Date.now() }) {
  if (!signature || !secret) return false;
  const parts = {};
  for (const piece of String(signature).split(',')) {
    const index = piece.indexOf('=');
    if (index > 0) parts[piece.slice(0, index).trim()] = piece.slice(index + 1).trim();
  }
  const { ts, v1 } = parts;
  if (!ts || !v1 || !/^[0-9a-f]{64}$/i.test(v1)) return false;
  const tsMs = tsToMs(ts);
  if (tsMs === null || Math.abs(now - tsMs) > WEBHOOK_MAX_SKEW_MS) return false;
  let manifest = '';
  if (dataId) manifest += `id:${String(dataId).toLowerCase()};`;
  if (requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${ts};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest();
  const received = Buffer.from(v1, 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

// Método do nosso lado a partir do pagamento do Mercado Pago.
function methodOf(payment) {
  if (payment?.payment_method_id === 'pix' || payment?.payment_type_id === 'bank_transfer') return 'pix';
  if (payment?.payment_type_id === 'debit_card') return 'debit_card';
  return 'credit_card';
}

module.exports = {
  mpConfig,
  isPaymentEnabled,
  mpRequest,
  isoWithOffset,
  sanitizePayment,
  verifyWebhookSignature,
  methodOf,
  httpError,
};
