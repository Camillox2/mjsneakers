const crypto = require('crypto');
const { pool } = require('../config/db');
const focus = require('./focusNfe');
const mp = require('./mercadoPago');
const { getSettingValues } = require('../controllers/settingsController');
const { invoiceEmail, paymentAlertEmail } = require('./emailService');
const { sendLater, notifyAdmins } = require('../utils/notify');
const { isValidCpf, isValidCnpj, onlyDigits, cleanCnpj } = require('../utils/cpf');
const { logAudit } = require('../controllers/auditController');

// Nota fiscal eletrônica (NF-e, modelo 55) de venda ao consumidor final pela
// internet. O CPF do cliente não é guardado: vem no corpo do pedido de emissão
// ou do pagamento aprovado no Mercado Pago, só na hora de emitir.

const FISCAL_KEYS = [
  'fiscal_enabled', 'fiscal_auto_emit', 'fiscal_ie', 'fiscal_regime', 'fiscal_uf', 'fiscal_cfop_state',
  'fiscal_cfop_interstate', 'fiscal_nature', 'fiscal_default_ncm', 'fiscal_default_origin', 'fiscal_icms_cst',
  'fiscal_pis_cst', 'fiscal_cofins_cst', 'fiscal_series', 'legal_cnpj',
];
// Padrões que não são imposto (CFOP e natureza de venda comum, origem nacional).
const DEFAULTS = {
  fiscal_cfop_state: '5102',
  fiscal_cfop_interstate: '6102',
  fiscal_nature: 'Venda de mercadoria',
  fiscal_default_origin: '0',
};
const REQUIRED = {
  legal_cnpj: 'CNPJ da empresa (legal_cnpj)',
  fiscal_ie: 'inscrição estadual (fiscal_ie)',
  fiscal_regime: 'regime tributário (fiscal_regime)',
  fiscal_uf: 'UF do emitente (fiscal_uf)',
  fiscal_icms_cst: 'CST/CSOSN do ICMS (fiscal_icms_cst)',
  fiscal_pis_cst: 'CST do PIS (fiscal_pis_cst)',
  fiscal_cofins_cst: 'CST da COFINS (fiscal_cofins_cst)',
};
const PAID_STATUSES = ['confirmed', 'processing', 'shipped', 'delivered'];
const ACTIVE_INVOICE = ['processing', 'authorized'];
const NO_RESPONSE = 'O provedor não respondeu. A nota será consultada de novo em alguns minutos.';

function httpError(status, message, extra = {}) {
  const error = new Error(message);
  error.status = status;
  Object.assign(error, extra);
  return error;
}

async function fiscalSettings() {
  const raw = await getSettingValues(FISCAL_KEYS);
  const settings = {};
  for (const key of FISCAL_KEYS) settings[key] = String(raw[key] ?? '').trim() || DEFAULTS[key] || '';
  return settings;
}

function missingSettings(settings) {
  return Object.entries(REQUIRED).filter(([key]) => !settings[key]).map(([, label]) => label);
}

async function invoiceConfig() {
  const cfg = focus.focusConfig();
  const settings = await fiscalSettings();
  return {
    enabled: settings.fiscal_enabled === 'true',
    provider: cfg.provider,
    env: cfg.env,
    has_token: cfg.hasToken,
    auto_emit: settings.fiscal_auto_emit === 'true',
    missing: missingSettings(settings),
  };
}

function formatInvoice(row) {
  return {
    id: row.id,
    order_id: row.order_id,
    provider: row.provider,
    ref: row.ref,
    status: row.status,
    number: row.number,
    series: row.series,
    access_key: row.access_key,
    danfe_url: row.danfe_url,
    xml_url: row.xml_url,
    error_message: row.error_message,
    emailed_at: row.emailed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function findInvoice(id) {
  const [rows] = await pool.query('SELECT * FROM invoices WHERE id = ?', [id]);
  return rows[0] || null;
}

async function listForOrder(orderId) {
  const [rows] = await pool.query('SELECT * FROM invoices WHERE order_id = ? ORDER BY id DESC', [orderId]);
  return rows.map(formatInvoice);
}

// ---------- Documento do destinatário (só em memória) ----------

// {type:'cpf'|'cnpj', number} ou null.
function parseDocument(value) {
  if (value === undefined || value === null || value === '') return null;
  const digits = onlyDigits(value);
  if (digits.length === 11 && isValidCpf(digits)) return { type: 'cpf', number: digits };
  const cnpj = cleanCnpj(value);
  if (cnpj.length === 14 && isValidCnpj(cnpj)) return { type: 'cnpj', number: cnpj };
  return null;
}

function documentFromPayment(payment) {
  const identification = payment?.payer?.identification;
  return identification ? parseDocument(identification.number) : null;
}

// Consulta o pagamento aprovado do pedido no Mercado Pago (o CPF não fica no banco).
async function documentFromProvider(orderId) {
  if (!mp.isPaymentEnabled()) return null;
  const [rows] = await pool.query(
    "SELECT provider_payment_id FROM payments WHERE order_id = ? AND status = 'approved' ORDER BY id DESC LIMIT 1",
    [orderId]
  );
  if (!rows.length) return null;
  try {
    const { status, data } = await mp.mpRequest('GET', `/v1/payments/${encodeURIComponent(rows[0].provider_payment_id)}`);
    return status === 200 ? documentFromPayment(data) : null;
  } catch (_error) {
    return null;
  }
}

// ---------- Montagem da nota ----------

const cents = (value) => Math.round(Number(value || 0) * 100);
const money = (valueCents) => Number((valueCents / 100).toFixed(2));

// Reparte um valor (centavos) proporcionalmente aos pesos, somando exato.
function allocate(totalCents, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!totalCents || !sum) return weights.map(() => 0);
  const raw = weights.map((w) => (totalCents * w) / sum);
  const out = raw.map(Math.floor);
  let rest = totalCents - out.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; rest > 0; k = (k + 1) % order.length, rest -= 1) out[order[k][1]] += 1;
  return out;
}

const PAYMENT_CODES = { pix: '17', credit_card: '03', debit_card: '04' };

// PIS/COFINS no Simples Nacional (CST 49 a 99) vão com valores zerados; fora
// do Simples, a loja informa os valores pelo provedor (sem chute de alíquota).
function contributionFields(prefix, cst, regime) {
  const fields = { [`${prefix}_situacao_tributaria`]: cst };
  if (regime === '1' && Number(cst) >= 49) {
    fields[`${prefix}_base_calculo`] = 0;
    fields[`${prefix}_aliquota_porcentual`] = 0;
    fields[`${prefix}_valor`] = 0;
  }
  return fields;
}

function buildPayload(order, items, settings, document) {
  const missing = missingSettings(settings);
  if (missing.length) throw httpError(422, `Configure antes: ${missing.join(', ')}`, { code: 'fiscal_config', missing });
  const address = ['address_street', 'address_number', 'address_neighborhood', 'address_city', 'address_state', 'address_cep'];
  if (address.some((key) => !String(order[key] || '').trim())) {
    throw httpError(422, 'O pedido está sem endereço completo (rua, número, bairro, cidade, UF e CEP)', { code: 'order_address' });
  }
  if (!items.length) throw httpError(422, 'O pedido não tem itens', { code: 'order_items' });
  const noNcm = items.filter((item) => !item.ncm && !settings.fiscal_default_ncm);
  if (noNcm.length) {
    throw httpError(422, `Sem NCM: ${noNcm.map((item) => item.product_name || `#${item.product_id}`).join(', ')}. Cadastre no produto ou em fiscal_default_ncm.`, { code: 'fiscal_ncm' });
  }

  const lineCents = items.map((item) => cents(item.price) * Number(item.quantity));
  const productsCents = lineCents.reduce((a, b) => a + b, 0);
  const freightCents = cents(order.shipping_price);
  const otherCents = order.gift_wrap ? cents(order.gift_wrap_price) : 0;
  const totalCents = cents(order.total);
  // Cupom, pontos e desconto do Pix: tudo o que separa a soma do valor pago.
  const discountCents = productsCents + freightCents + otherCents - totalCents;
  if (discountCents < 0 || discountCents > productsCents) {
    throw httpError(422, 'Os valores do pedido não fecham (produtos, frete, desconto e total)', { code: 'order_totals' });
  }
  const discounts = allocate(discountCents, lineCents);
  const freights = allocate(freightCents, lineCents);
  const others = allocate(otherCents, lineCents);

  const destUf = String(order.address_state).trim().toUpperCase();
  const interstate = destUf !== settings.fiscal_uf;
  const cfop = interstate ? settings.fiscal_cfop_interstate : settings.fiscal_cfop_state;
  const regime = settings.fiscal_regime;
  const pickup = /retir/i.test(String(order.shipping_type || ''));

  const payload = {
    natureza_operacao: settings.fiscal_nature,
    data_emissao: mp.isoWithOffset(new Date()),
    tipo_documento: 1,
    finalidade_emissao: 1,
    local_destino: interstate ? 2 : 1,
    consumidor_final: 1,
    presenca_comprador: 2,
    indicador_intermediario: 0,
    cnpj_emitente: cleanCnpj(settings.legal_cnpj),
    inscricao_estadual_emitente: settings.fiscal_ie,
    regime_tributario_emitente: Number(regime),
    nome_destinatario: String(order.customer_name || '').trim().slice(0, 60),
    indicador_inscricao_estadual_destinatario: 9,
    logradouro_destinatario: String(order.address_street).trim().slice(0, 60),
    numero_destinatario: String(order.address_number).trim().slice(0, 60),
    bairro_destinatario: String(order.address_neighborhood).trim().slice(0, 60),
    municipio_destinatario: String(order.address_city).trim().slice(0, 60),
    uf_destinatario: destUf,
    cep_destinatario: onlyDigits(order.address_cep),
    pais_destinatario: 'Brasil',
    modalidade_frete: pickup ? 9 : 0,
    valor_produtos: money(productsCents),
    valor_frete: money(freightCents),
    valor_desconto: money(discountCents),
    valor_outras_despesas: money(otherCents),
    valor_total: money(totalCents),
    informacoes_adicionais_contribuinte: `Pedido #${order.id}`,
    formas_pagamento: [{
      forma_pagamento: PAYMENT_CODES[order.payment_method] || '99',
      valor_pagamento: money(totalCents),
      ...(['credit_card', 'debit_card'].includes(order.payment_method) ? { tipo_integracao: 2 } : {}),
    }],
    items: items.map((item, index) => {
      const quantity = Number(item.quantity);
      const unit = money(cents(item.price));
      const gtin = item.gtin || 'SEM GTIN';
      const line = {
        numero_item: index + 1,
        codigo_produto: String(item.product_id),
        descricao: `${item.product_name || `Produto ${item.product_id}`}${item.size ? ` - Tam. ${item.size}` : ''}`.slice(0, 120),
        cfop,
        codigo_ncm: item.ncm || settings.fiscal_default_ncm,
        unidade_comercial: 'UN',
        quantidade_comercial: quantity,
        valor_unitario_comercial: unit,
        valor_bruto: money(lineCents[index]),
        unidade_tributavel: 'UN',
        quantidade_tributavel: quantity,
        valor_unitario_tributavel: unit,
        codigo_barras_comercial: gtin,
        codigo_barras_tributavel: gtin,
        inclui_no_total: 1,
        icms_origem: item.origin || settings.fiscal_default_origin,
        icms_situacao_tributaria: settings.fiscal_icms_cst,
        ...contributionFields('pis', settings.fiscal_pis_cst, regime),
        ...contributionFields('cofins', settings.fiscal_cofins_cst, regime),
      };
      if (discounts[index]) line.valor_desconto = money(discounts[index]);
      if (freights[index]) line.valor_frete = money(freights[index]);
      if (others[index]) line.valor_outras_despesas = money(others[index]);
      return line;
    }),
  };
  if (order.address_complement) payload.complemento_destinatario = String(order.address_complement).trim().slice(0, 60);
  const phone = onlyDigits(order.customer_phone);
  if (phone.length >= 10 && phone.length <= 14) payload.telefone_destinatario = phone;
  if (document.type === 'cpf') payload.cpf_destinatario = document.number;
  else payload.cnpj_destinatario = document.number;
  if (settings.fiscal_series) payload.serie = settings.fiscal_series;
  return payload;
}

// ---------- Resposta do provedor ----------

// Grava o que veio do provedor; nota recém-autorizada vai por e-mail ao cliente.
async function applyProviderResult(invoice, { status, data, networkError }, { fromEmit = false } = {}) {
  let update = {};
  if (networkError || status === 0) {
    update = { error_message: NO_RESPONSE };
  } else if (status === 404 && !fromEmit) {
    update = invoice.status === 'processing'
      ? { status: 'error', error_message: 'O provedor não encontrou esta nota. Emita de novo.' }
      : { error_message: 'O provedor não encontrou esta nota.' };
  } else if (status >= 500) {
    update = { error_message: NO_RESPONSE };
  } else if (status >= 400) {
    update = { status: 'error', error_message: focus.errorMessageOf(data, `O provedor recusou a nota (HTTP ${status}).`) };
  } else {
    const fields = focus.invoiceFieldsOf(data);
    update = {
      status: fields.status || invoice.status,
      number: fields.number || invoice.number,
      series: fields.series || invoice.series,
      access_key: fields.access_key || invoice.access_key,
      danfe_url: fields.danfe_url || invoice.danfe_url,
      xml_url: fields.xml_url || invoice.xml_url,
      error_message: fields.status === 'error' ? focus.errorMessageOf(data, 'A SEFAZ recusou a nota.') : null,
    };
  }
  const columns = Object.keys(update);
  if (columns.length) {
    await pool.query(
      `UPDATE invoices SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
      [...columns.map((c) => update[c]), invoice.id]
    );
  }
  const fresh = await findInvoice(invoice.id);
  if (fresh.status === 'authorized' && !fresh.emailed_at) await emailInvoice(fresh);
  return fresh;
}

async function emailInvoice(invoice) {
  // Marca antes de enviar: dois syncs ao mesmo tempo não mandam dois e-mails.
  const [marked] = await pool.query('UPDATE invoices SET emailed_at = NOW() WHERE id = ? AND emailed_at IS NULL', [invoice.id]);
  if (!marked.affectedRows) return;
  const [[order]] = await pool.query('SELECT id, customer_name, customer_email FROM orders WHERE id = ?', [invoice.order_id]);
  if (order?.customer_email) sendLater(order.customer_email, () => invoiceEmail(order, invoice));
}

// ---------- Operações ----------

// Emite a nota do pedido. options: {document (CPF/CNPJ em trânsito), actor, source}.
async function emitForOrder(orderId, { document: rawDocument, actor = null, source = 'admin' } = {}) {
  const settings = await fiscalSettings();
  if (settings.fiscal_enabled !== 'true') throw httpError(409, 'A nota fiscal está desligada nas configurações (fiscal_enabled)', { code: 'fiscal_disabled' });
  if (!focus.focusConfig().hasToken) throw httpError(503, 'Nota fiscal não configurada no servidor (FOCUSNFE_TOKEN)', { code: 'fiscal_token' });

  let document = null;
  if (rawDocument !== undefined && rawDocument !== null && rawDocument !== '') {
    document = parseDocument(rawDocument);
    if (!document) throw httpError(400, 'CPF ou CNPJ do cliente inválido', { code: 'document_invalid' });
  }

  const [orderRows] = await pool.query('SELECT * FROM orders WHERE id = ?', [orderId]);
  const order = orderRows[0];
  if (!order) throw httpError(404, 'Pedido não encontrado');
  const paid = order.payment_status === 'approved' || PAID_STATUSES.includes(order.status);
  if (!paid || order.status === 'cancelled' || ['refunded', 'charged_back'].includes(order.payment_status)) {
    throw httpError(409, 'Só dá para emitir nota de pedido pago ou confirmado', { code: 'order_not_paid' });
  }
  const [items] = await pool.query(
    `SELECT oi.product_id, oi.size, oi.quantity, oi.price, p.name AS product_name, p.ncm, p.origin, p.gtin
     FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ? ORDER BY oi.id`,
    [orderId]
  );
  if (!document) document = await documentFromProvider(orderId);
  if (!document) {
    throw httpError(422, 'Informe o CPF ou CNPJ do cliente para emitir a nota (ele não fica guardado na loja).', { code: 'document_required' });
  }
  const payload = buildPayload(order, items, settings, document);

  // Trava o pedido: duas emissões ao mesmo tempo não viram duas notas.
  const conn = await pool.getConnection();
  let invoiceId;
  let ref;
  try {
    await conn.beginTransaction();
    await conn.query('SELECT id FROM orders WHERE id = ? FOR UPDATE', [orderId]);
    const [active] = await conn.query(
      'SELECT id, status FROM invoices WHERE order_id = ? AND status IN (?) LIMIT 1',
      [orderId, ACTIVE_INVOICE]
    );
    if (active.length) {
      throw httpError(409, active[0].status === 'authorized' ? 'Este pedido já tem nota autorizada' : 'Já tem uma nota deste pedido em processamento', {
        code: 'invoice_exists', invoice_id: active[0].id,
      });
    }
    const [[{ attempts }]] = await conn.query('SELECT COUNT(*) AS attempts FROM invoices WHERE order_id = ?', [orderId]);
    // Referência única também entre bancos diferentes na mesma conta do provedor.
    ref = `pedido-${orderId}-${Number(attempts) + 1}-${crypto.randomBytes(3).toString('hex')}`;
    const [result] = await conn.query(
      "INSERT INTO invoices (order_id, provider, ref, status) VALUES (?, 'focusnfe', ?, 'processing')",
      [orderId, ref]
    );
    invoiceId = result.insertId;
    await conn.commit();
  } catch (error) {
    await conn.rollback().catch(() => {});
    throw error;
  } finally {
    conn.release();
  }

  const response = await focus.emit(ref, payload);
  const invoice = await applyProviderResult(await findInvoice(invoiceId), response, { fromEmit: true });
  logAudit({
    adminId: actor?.id, adminUsername: actor?.username || source, action: 'emit', entity: 'invoice', entityId: invoice.id,
    details: { order_id: orderId, ref, status: invoice.status, http: response.status },
    ip: actor?.ip,
  });
  return formatInvoice(invoice);
}

async function syncInvoice(id) {
  const invoice = await findInvoice(id);
  if (!invoice) throw httpError(404, 'Nota não encontrada');
  const response = await focus.consult(invoice.ref);
  return formatInvoice(await applyProviderResult(invoice, response));
}

async function cancelInvoice(id, justification, actor) {
  const text = String(justification || '').trim();
  if (text.length < 15 || text.length > 255) throw httpError(400, 'A justificativa deve ter de 15 a 255 caracteres');
  const invoice = await findInvoice(id);
  if (!invoice) throw httpError(404, 'Nota não encontrada');
  if (invoice.status !== 'authorized') throw httpError(409, 'Só dá para cancelar nota autorizada');
  const { status, data, networkError } = await focus.cancel(invoice.ref, text);
  if (networkError || status === 0 || status >= 500) throw httpError(502, 'O provedor não respondeu. Tente de novo em alguns minutos.');
  if (status >= 400 || data?.status !== 'cancelado') {
    throw httpError(422, focus.errorMessageOf(data, 'O cancelamento foi recusado.'), { code: 'cancel_refused' });
  }
  await pool.query(
    "UPDATE invoices SET status = 'cancelled', error_message = NULL, xml_url = COALESCE(?, xml_url) WHERE id = ?",
    [focus.absoluteUrl(data.caminho_xml_cancelamento), id]
  );
  logAudit({
    adminId: actor?.id, adminUsername: actor?.username, action: 'cancel', entity: 'invoice', entityId: id,
    details: { order_id: invoice.order_id, justification: text.slice(0, 255) }, ip: actor?.ip,
  });
  return formatInvoice(await findInvoice(id));
}

// Chamado no intervalo de 5 min: consulta notas em processamento.
async function syncPendingInvoices() {
  if (!focus.focusConfig().hasToken) return 0;
  const [rows] = await pool.query(
    "SELECT * FROM invoices WHERE status = 'processing' AND updated_at < DATE_SUB(NOW(), INTERVAL 1 MINUTE) ORDER BY id LIMIT 20"
  );
  for (const invoice of rows) {
    try {
      await applyProviderResult(invoice, await focus.consult(invoice.ref));
    } catch (error) {
      console.error('[NF-e] Consulta falhou:', error.message);
    }
  }
  return rows.length;
}

// Pagamento aprovado: emite sozinho se fiscal_auto_emit estiver ligado. O CPF
// vem do pagamento em memória. Nunca lança; falha vira aviso para a equipe.
function autoEmitOnApproval(orderId, payment) {
  setImmediate(async () => {
    try {
      const settings = await fiscalSettings();
      if (settings.fiscal_enabled !== 'true' || settings.fiscal_auto_emit !== 'true' || !focus.focusConfig().hasToken) return;
      const document = documentFromPayment(payment);
      await emitForOrder(orderId, { document: document ? document.number : undefined, source: 'automatico' });
    } catch (error) {
      console.error(`[NF-e] Emissão automática do pedido #${orderId} falhou: ${error.message}`);
      notifyAdmins(() => paymentAlertEmail({
        orderId,
        title: 'Nota fiscal não emitida',
        text: `A emissão automática falhou: ${error.message} Emita pelo painel.`,
      }));
    }
  });
}

module.exports = {
  invoiceConfig,
  listForOrder,
  emitForOrder,
  syncInvoice,
  cancelInvoice,
  syncPendingInvoices,
  autoEmitOnApproval,
  buildPayload,
  allocate,
  parseDocument,
};
