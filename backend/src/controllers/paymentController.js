const paymentService = require('../services/paymentService');
const mp = require('../services/mercadoPago');
const { isValidCpf, isValidCnpj, onlyDigits, cleanCnpj } = require('../utils/cpf');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sendError(res, error, fallback) {
  if (error.status) return res.status(error.status).json({ error: error.message });
  console.error(fallback, error.message);
  res.status(500).json({ error: fallback });
}

function orderIdOf(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// O token do pedido vem no corpo, na query ou no header X-Order-Token.
function tokenOf(req) {
  const token = req.body?.access_token ?? req.query.access_token ?? req.get('x-order-token');
  return typeof token === 'string' ? token.trim().toLowerCase() : '';
}

const paymentController = {
  async config(req, res) {
    try {
      res.json(await paymentService.publicConfig());
    } catch (error) {
      sendError(res, error, 'Erro ao buscar configuração de pagamento');
    }
  },

  adminConfig(req, res) {
    res.json(paymentService.adminConfig());
  },

  // {order_id, access_token, cpf}
  async pix(req, res) {
    const orderId = orderIdOf(req.body?.order_id);
    const cpf = onlyDigits(req.body?.cpf);
    if (!orderId) return res.status(400).json({ error: 'order_id inválido' });
    if (!isValidCpf(cpf)) return res.status(400).json({ error: 'CPF inválido' });
    try {
      const result = await paymentService.createPix({ orderId, accessToken: tokenOf(req), cpf });
      res.status(result.reused ? 200 : 201).json(result.body);
    } catch (error) {
      sendError(res, error, 'Erro ao gerar Pix');
    }
  },

  // {order_id, access_token, token, issuer_id, payment_method_id, installments,
  //  payer: {email, identification: {type, number}}}. transaction_amount do
  // navegador é ignorado: o valor é o total do pedido no servidor.
  async card(req, res) {
    const body = req.body || {};
    const orderId = orderIdOf(body.order_id);
    const installments = Number(body.installments);
    const payer = body.payer || {};
    const identification = payer.identification || {};
    const docType = String(identification.type || '').toUpperCase();
    const docNumber = docType === 'CNPJ' ? cleanCnpj(identification.number) : onlyDigits(identification.number);
    const email = String(payer.email || '').trim().toLowerCase();

    if (!orderId) return res.status(400).json({ error: 'order_id inválido' });
    if (typeof body.token !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(body.token)) {
      return res.status(400).json({ error: 'Token do cartão inválido' });
    }
    if (typeof body.payment_method_id !== 'string' || !/^[a-z0-9_]{2,30}$/.test(body.payment_method_id)) {
      return res.status(400).json({ error: 'payment_method_id inválido' });
    }
    if (body.issuer_id !== undefined && body.issuer_id !== null && body.issuer_id !== '' && !/^\d{1,20}$/.test(String(body.issuer_id))) {
      return res.status(400).json({ error: 'issuer_id inválido' });
    }
    if (!Number.isInteger(installments) || installments < 1 || installments > 12) {
      return res.status(400).json({ error: 'Parcelas devem ficar entre 1 e 12' });
    }
    if (!EMAIL_RE.test(email) || email.length > 255) return res.status(400).json({ error: 'E-mail do pagador inválido' });
    if (!((docType === 'CPF' && isValidCpf(docNumber)) || (docType === 'CNPJ' && isValidCnpj(docNumber)))) {
      return res.status(400).json({ error: 'CPF ou CNPJ do titular inválido' });
    }

    try {
      const result = await paymentService.payWithCard({
        orderId,
        accessToken: tokenOf(req),
        token: body.token,
        issuerId: body.issuer_id ? String(body.issuer_id) : null,
        paymentMethodId: body.payment_method_id,
        installments,
        payer: { email, identification: { type: docType, number: docNumber } },
      });
      res.json(result);
    } catch (error) {
      sendError(res, error, 'Erro ao processar pagamento');
    }
  },

  // Polling da loja: ?access_token=
  async orderStatus(req, res) {
    const orderId = orderIdOf(req.params.orderId);
    if (!orderId) return res.status(400).json({ error: 'orderId inválido' });
    try {
      res.json(await paymentService.orderPaymentStatus(orderId, tokenOf(req)));
    } catch (error) {
      sendError(res, error, 'Erro ao consultar pagamento');
    }
  },

  // Webhook do Mercado Pago. A assinatura é conferida antes de tudo e o
  // pagamento é sempre buscado na API (o corpo não é confiável).
  async webhook(req, res) {
    const cfg = mp.mpConfig();
    const rawId = req.query['data.id'] ?? req.body?.data?.id;
    const dataId = rawId === undefined || rawId === null ? '' : String(rawId).toLowerCase();
    const type = String(req.query.type || req.query.topic || req.body?.type || '');

    if (!cfg.webhookSecret) {
      if (process.env.NODE_ENV === 'production') {
        console.error('[Pagamento] Webhook recebido sem MP_WEBHOOK_SECRET configurado; recusado.');
        return res.status(503).json({ error: 'Webhook não configurado' });
      }
      console.warn('[Pagamento] MP_WEBHOOK_SECRET ausente: webhook aceito sem conferir assinatura (fora de produção).');
    } else {
      const valid = mp.verifyWebhookSignature({
        signature: req.get('x-signature'),
        requestId: req.get('x-request-id'),
        dataId,
        secret: cfg.webhookSecret,
      });
      if (!valid) return res.status(401).json({ error: 'Assinatura inválida' });
    }

    if (type && type !== 'payment') return res.status(200).json({ received: true, ignored: true });
    if (!/^[0-9a-z]{1,40}$/.test(dataId)) return res.status(200).json({ received: true, ignored: true });
    if (!mp.isPaymentEnabled()) return res.status(200).json({ received: true, ignored: true });

    try {
      const result = await paymentService.syncProviderPayment(dataId, { source: 'webhook' });
      res.status(200).json({ received: true, ...(result.ignored ? { ignored: true } : {}) });
    } catch (error) {
      // 5xx faz o Mercado Pago tentar de novo mais tarde.
      console.error(`[Pagamento] Webhook do pagamento ${dataId}: ${error.message}`);
      res.status(500).json({ error: 'Falha ao processar notificação' });
    }
  },

  async sync(req, res) {
    const orderId = orderIdOf(req.params.orderId);
    if (!orderId) return res.status(400).json({ error: 'orderId inválido' });
    try {
      res.json(await paymentService.syncOrder(orderId, req.user));
    } catch (error) {
      sendError(res, error, 'Erro ao sincronizar pagamento');
    }
  },

  // {amount?}: sem amount, estorno total.
  async refund(req, res) {
    const paymentId = orderIdOf(req.params.paymentId);
    if (!paymentId) return res.status(400).json({ error: 'paymentId inválido' });
    let amount;
    if (req.body?.amount !== undefined && req.body.amount !== null && req.body.amount !== '') {
      amount = Math.round(Number(req.body.amount) * 100) / 100;
      if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'amount deve ser maior que zero' });
    }
    try {
      res.json(await paymentService.refundPayment(paymentId, amount, req.user));
    } catch (error) {
      sendError(res, error, 'Erro ao estornar pagamento');
    }
  },
};

module.exports = paymentController;
