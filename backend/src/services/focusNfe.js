// Adaptador do Focus NFe (API v2), com o fetch do Node (sem SDK).
// Autenticação: Basic com o token como usuário e senha vazia.
// As variáveis são lidas a cada chamada, para os testes poderem trocar.

const BASES = {
  homologacao: 'https://homologacao.focusnfe.com.br',
  producao: 'https://api.focusnfe.com.br',
};
const REQUEST_TIMEOUT_MS = 20000;

function focusConfig() {
  const env = process.env.FOCUSNFE_ENV === 'producao' ? 'producao' : 'homologacao';
  const token = process.env.FOCUSNFE_TOKEN || '';
  return {
    provider: 'focusnfe',
    env,
    token,
    hasToken: Boolean(token),
    apiBase: String(process.env.FOCUSNFE_API_BASE || BASES[env]).replace(/\/+$/, ''),
  };
}

// { status, data } ou { status: 0, data: null, networkError } quando não houve
// resposta (rede ou tempo esgotado). Nunca registra o corpo (tem CPF).
async function focusRequest(method, path, body) {
  const cfg = focusConfig();
  if (!cfg.token) {
    const error = new Error('Nota fiscal não configurada (FOCUSNFE_TOKEN)');
    error.status = 503;
    throw error;
  }
  const headers = {
    Authorization: `Basic ${Buffer.from(`${cfg.token}:`).toString('base64')}`,
    Accept: 'application/json',
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
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
    const reason = error.name === 'AbortError' ? 'tempo esgotado' : error.message;
    console.error(`[FocusNFe] ${method} ${path.split('?')[0]} sem resposta: ${reason}`);
    return { status: 0, data: null, networkError: reason };
  } finally {
    clearTimeout(timer);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    console.error(`[FocusNFe] ${method} ${path.split('?')[0]} respondeu ${response.status}${data?.codigo ? ` (${data.codigo})` : ''}`);
  }
  return { status: response.status, data };
}

// Links do provedor vêm relativos ao host da API.
function absoluteUrl(pathOrUrl) {
  if (!pathOrUrl) return null;
  const text = String(pathOrUrl);
  if (/^https?:\/\//i.test(text)) return text;
  return `${focusConfig().apiBase}${text.startsWith('/') ? '' : '/'}${text}`;
}

// Status do Focus → status da nossa tabela.
function mapStatus(focusStatus) {
  switch (focusStatus) {
    case 'autorizado': return 'authorized';
    case 'cancelado': return 'cancelled';
    case 'processando_autorizacao': return 'processing';
    case 'erro_autorizacao':
    case 'denegado':
      return 'error';
    default: return null;
  }
}

// Mensagem legível de uma resposta do Focus (erro de validação ou da SEFAZ).
function errorMessageOf(data, fallback) {
  if (!data) return fallback;
  const parts = [];
  if (data.mensagem_sefaz) parts.push(String(data.mensagem_sefaz));
  if (data.mensagem) parts.push(String(data.mensagem));
  if (Array.isArray(data.erros)) {
    for (const item of data.erros.slice(0, 5)) {
      const text = [item.campo, item.mensagem].filter(Boolean).join(': ');
      if (text) parts.push(text);
    }
  }
  return (parts.join(' | ') || fallback).slice(0, 1000);
}

// Campos que guardamos de uma resposta de nota.
function invoiceFieldsOf(data) {
  return {
    status: mapStatus(data?.status),
    number: data?.numero ? String(data.numero).slice(0, 20) : null,
    series: data?.serie ? String(data.serie).slice(0, 5) : null,
    access_key: data?.chave_nfe ? String(data.chave_nfe).replace(/^NFe/, '').slice(0, 44) : null,
    danfe_url: absoluteUrl(data?.caminho_danfe),
    xml_url: absoluteUrl(data?.caminho_xml_nota_fiscal),
  };
}

const emit = (ref, payload) => focusRequest('POST', `/v2/nfe?ref=${encodeURIComponent(ref)}`, payload);
const consult = (ref) => focusRequest('GET', `/v2/nfe/${encodeURIComponent(ref)}`);
const cancel = (ref, justificativa) => focusRequest('DELETE', `/v2/nfe/${encodeURIComponent(ref)}`, { justificativa });

module.exports = { focusConfig, emit, consult, cancel, mapStatus, errorMessageOf, invoiceFieldsOf, absoluteUrl };
