const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const invoices = require('../services/invoiceService');

// Nota fiscal (NF-e). Tudo só para a equipe.
router.use(...requireAdmin);

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function actorOf(req) {
  return { id: req.user?.id, username: req.user?.username, ip: String(req.ip || '').slice(0, 45) };
}

function sendError(res, error, fallback) {
  if (error.status && error.status < 600) {
    const body = { error: error.message };
    if (error.code && typeof error.code === 'string' && !error.code.startsWith('ER_')) body.code = error.code;
    if (error.missing) body.missing = error.missing;
    if (error.invoice_id) body.invoice_id = error.invoice_id;
    return res.status(error.status).json(body);
  }
  console.error(`${fallback}:`, error.message);
  return res.status(500).json({ error: fallback });
}

// {enabled, provider, env, has_token, auto_emit, missing:[...]}
router.get('/config', async (_req, res) => {
  try {
    res.json(await invoices.invoiceConfig());
  } catch (error) {
    sendError(res, error, 'Erro ao buscar a configuração fiscal');
  }
});

router.get('/order/:orderId', async (req, res) => {
  const orderId = parseId(req.params.orderId);
  if (!orderId) return res.status(400).json({ error: 'orderId inválido' });
  try {
    res.json(await invoices.listForOrder(orderId));
  } catch (error) {
    sendError(res, error, 'Erro ao buscar as notas');
  }
});

// {cpf?} (CPF ou CNPJ do cliente, usado só na emissão e não guardado)
router.post('/order/:orderId', async (req, res) => {
  const orderId = parseId(req.params.orderId);
  if (!orderId) return res.status(400).json({ error: 'orderId inválido' });
  const document = req.body?.cpf ?? req.body?.document;
  if (document !== undefined && document !== null && typeof document !== 'string') {
    return res.status(400).json({ error: 'cpf deve ser texto' });
  }
  try {
    const invoice = await invoices.emitForOrder(orderId, { document, actor: actorOf(req) });
    res.status(201).json(invoice);
  } catch (error) {
    sendError(res, error, 'Erro ao emitir a nota');
  }
});

router.post('/:id/sync', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'id inválido' });
  try {
    res.json(await invoices.syncInvoice(id));
  } catch (error) {
    sendError(res, error, 'Erro ao consultar a nota');
  }
});

// {justification} (15 a 255 caracteres)
router.post('/:id/cancel', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'id inválido' });
  try {
    res.json(await invoices.cancelInvoice(id, req.body?.justification, actorOf(req)));
  } catch (error) {
    sendError(res, error, 'Erro ao cancelar a nota');
  }
});

module.exports = router;
