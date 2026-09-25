const { pool } = require('../config/db');
const { auditReq } = require('./auditController');
const { isImageRef } = require('../utils/validate');
const { isValidCnpj } = require('../utils/cpf');

// Lista branca de /api/settings. Tudo que a loja e o admin leem ou gravam hoje.
// As configurações visuais (tema, seções, CSS) ficam em /api/appearance.
const PUBLIC_KEYS = new Set([
  'store_name', 'store_email', 'store_phone', 'store_whatsapp', 'store_instagram', 'store_facebook', 'store_address',
  'maintenance_mode', 'maintenance_message',
  'home_promo_enabled', 'home_promo_tag', 'home_promo_text', 'home_promo_button_text', 'home_promo_button_link',
  'primary_color', 'bg_color', 'card_color', 'text_color',
  'footer_email', 'footer_credit', 'footer_phone', 'footer_instagram', 'footer_address',
  'contact_email', 'contact_phone',
  'ticker_enabled', 'ticker_speed', 'ticker_double',
  'bottom_banner_enabled', 'bottom_banner_product_ids', 'bottom_banner_title', 'bottom_banner_subtitle',
  'bottom_banner_image', 'bottom_banner_bg_color', 'bottom_banner_button_text', 'bottom_banner_button_link',
  'gift_wrap_price',
  'payment_max_installments', 'payment_pix_discount',
  // Programa de pontos
  'loyalty_enabled', 'loyalty_points_per_real', 'loyalty_points_per_real_discount', 'loyalty_max_redeem_percent', 'loyalty_min_redeem',
  // Dados da empresa e páginas legais (page_*_updated_at é gravado pelo servidor)
  'legal_company_name', 'legal_trade_name', 'legal_cnpj', 'legal_address', 'legal_email', 'legal_phone', 'legal_hours',
  'legal_dpo_name', 'legal_dpo_email',
  'page_terms', 'page_returns', 'page_privacy',
  'page_terms_updated_at', 'page_returns_updated_at', 'page_privacy_updated_at',
]);
// Só o admin enxerga: aviso de pedido novo, exigência de 2FA e dados fiscais.
const PRIVATE_KEYS = new Set([
  'admin_notify_email', 'admin_require_2fa',
  'fiscal_enabled', 'fiscal_auto_emit', 'fiscal_ie', 'fiscal_regime', 'fiscal_cfop_state', 'fiscal_cfop_interstate',
  'fiscal_nature', 'fiscal_default_ncm', 'fiscal_default_origin', 'fiscal_icms_cst', 'fiscal_pis_cst', 'fiscal_cofins_cst',
  'fiscal_series', 'fiscal_uf',
]);
// Gravadas só pelo servidor (não aceitas no PUT).
const SERVER_KEYS = new Set(['page_terms_updated_at', 'page_returns_updated_at', 'page_privacy_updated_at']);
// Prefixos liberados além da lista: footer_*, store_* e bottom_banner_*.
const PUBLIC_PREFIX_RE = /^(footer|store|bottom_banner)_[a-z0-9_]{1,40}$/;
// Mudar estas exige a verificação em duas etapas ligada em quem muda.
const TWO_FACTOR_KEY_RE = /^(fiscal_|payment_|admin_require_2fa$)/;
// Só o super_admin muda estas.
const OWNER_KEYS = new Set(['admin_require_2fa']);
// Links de botão: caminho da loja, âncora ou http(s), como no banner. Nada de javascript:.
const LINK_KEY_RE = /_link$/;
const SAFE_LINK_RE = /^(\/|#|https?:\/\/)/i;

const BOOL_KEYS = new Set([
  'maintenance_mode', 'home_promo_enabled', 'ticker_enabled', 'ticker_double', 'bottom_banner_enabled',
  'loyalty_enabled', 'admin_require_2fa', 'fiscal_enabled', 'fiscal_auto_emit',
]);
const PAGE_KEYS = new Set(['page_terms', 'page_returns', 'page_privacy']);
const MAX_VALUE_LENGTH = 5000;
const MAX_PAGE_LENGTH = 40000;
const EMAIL_KEYS = new Set(['admin_notify_email', 'store_email', 'footer_email', 'contact_email', 'legal_email', 'legal_dpo_email']);
// Inteiros com faixa: [mínimo, máximo].
const INT_KEYS = {
  payment_max_installments: [1, 12],
  loyalty_points_per_real: [0, 1000],
  loyalty_points_per_real_discount: [1, 100000],
  loyalty_max_redeem_percent: [0, 100],
  loyalty_min_redeem: [0, 10000000],
};
// Códigos fiscais: só dígitos, com tamanho fixo ou faixa.
const FISCAL_PATTERNS = {
  fiscal_regime: /^[13]$/,
  fiscal_cfop_state: /^\d{4}$/,
  fiscal_cfop_interstate: /^\d{4}$/,
  fiscal_default_ncm: /^\d{8}$/,
  fiscal_default_origin: /^[0-8]$/,
  fiscal_icms_cst: /^\d{2,3}$/,
  fiscal_pis_cst: /^\d{2}$/,
  fiscal_cofins_cst: /^\d{2}$/,
  fiscal_series: /^\d{1,3}$/,
  fiscal_ie: /^(ISENTO|\d{2,14})$/,
  fiscal_uf: /^(AC|AL|AM|AP|BA|CE|DF|ES|GO|MA|MG|MS|MT|PA|PB|PE|PI|PR|RJ|RN|RO|RR|RS|SC|SE|SP|TO)$/,
};

function isPublicKey(key) {
  return PUBLIC_KEYS.has(key) || PUBLIC_PREFIX_RE.test(key);
}
function isAllowedKey(key) {
  return typeof key === 'string' && (isPublicKey(key) || PRIVATE_KEYS.has(key));
}

// Converte e valida o valor de uma chave; devolve a string a gravar.
function normalizeValue(key, value) {
  if (value !== null && value !== undefined && !['string', 'number', 'boolean'].includes(typeof value)) {
    throw new Error(`${key}: valor deve ser texto, número ou booleano`);
  }
  const raw = value === null || value === undefined ? '' : String(value);
  // Páginas legais guardam o markdown como veio (só tira espaço das pontas).
  const text = raw.trim();
  const max = PAGE_KEYS.has(key) ? MAX_PAGE_LENGTH : MAX_VALUE_LENGTH;
  if (text.length > max) throw new Error(`${key}: máximo de ${max} caracteres`);

  if (BOOL_KEYS.has(key) && text !== '' && text !== 'true' && text !== 'false') {
    throw new Error(`${key}: use true ou false`);
  }
  if (key === 'gift_wrap_price' && text !== '') {
    const n = Number(text.replace(',', '.'));
    if (!Number.isFinite(n) || n < 0 || n > 1000) throw new Error('gift_wrap_price: valor entre 0 e 1000');
    return String(Math.round(n * 100) / 100);
  }
  if (INT_KEYS[key] && text !== '') {
    const [min, maxValue] = INT_KEYS[key];
    const n = Number(text);
    if (!Number.isInteger(n) || n < min || n > maxValue) throw new Error(`${key}: inteiro de ${min} a ${maxValue}`);
    return String(n);
  }
  if (key === 'payment_pix_discount' && text !== '') {
    const n = Number(text.replace(',', '.'));
    if (!Number.isFinite(n) || n < 0 || n > 20) throw new Error('payment_pix_discount: percentual de 0 a 20');
    return String(Math.round(n * 100) / 100);
  }
  if (FISCAL_PATTERNS[key] && text !== '' && !FISCAL_PATTERNS[key].test(text.toUpperCase())) {
    throw new Error(`${key}: formato inválido`);
  }
  if (key === 'legal_cnpj' && text !== '' && !isValidCnpj(text)) {
    throw new Error('legal_cnpj: CNPJ inválido');
  }
  if (key === 'bottom_banner_product_ids' && text !== '') {
    let ids;
    try { ids = JSON.parse(text); } catch (_error) { ids = null; }
    if (!Array.isArray(ids) || ids.length > 50 || !ids.every((id) => Number.isInteger(id) && id > 0)) {
      throw new Error('bottom_banner_product_ids: lista JSON de ids, ex.: [1,2,3]');
    }
  }
  if (LINK_KEY_RE.test(key) && text !== '' && !SAFE_LINK_RE.test(text)) {
    throw new Error(`${key}: o link deve começar com /, # ou http(s)://`);
  }
  if (key === 'bottom_banner_image' && !isImageRef(text)) {
    throw new Error('bottom_banner_image: envie antes por /upload e use a URL devolvida');
  }
  if (EMAIL_KEYS.has(key) && text !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
    throw new Error(`${key}: e-mail inválido`);
  }
  return key === 'fiscal_ie' || key === 'fiscal_uf' ? text.toUpperCase() : text;
}

async function readSettings(filter) {
  const [rows] = await pool.query('SELECT setting_key, setting_value FROM site_settings');
  const settings = {};
  rows.forEach(row => { if (filter(row.setting_key)) settings[row.setting_key] = row.setting_value; });
  return settings;
}

const settingsController = {
  // Público: só as chaves públicas.
  async getAll(req, res) {
    try {
      res.json(await readSettings(isPublicKey));
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar configurações' });
    }
  },

  // Admin: mesmo formato do público (objeto chave: valor), com as privadas.
  async getAdmin(req, res) {
    try {
      res.json(await readSettings(isAllowedKey));
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar configurações' });
    }
  },

  async get(req, res) {
    try {
      if (!isPublicKey(req.params.key)) return res.status(404).json({ error: 'Configuração não encontrada' });
      const [rows] = await pool.query('SELECT setting_value FROM site_settings WHERE setting_key = ?', [req.params.key]);
      if (rows.length === 0) return res.status(404).json({ error: 'Configuração não encontrada' });
      res.json({ value: rows[0].setting_value });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar configuração' });
    }
  },

  // Aceita {key, value} ou {settings: {chave: valor}}; tudo numa transação.
  async upsert(req, res) {
    let entries;
    if (req.body && req.body.settings && typeof req.body.settings === 'object' && !Array.isArray(req.body.settings)) {
      entries = Object.entries(req.body.settings);
    } else if (req.body && typeof req.body.key === 'string') {
      entries = [[req.body.key, req.body.value]];
    } else {
      return res.status(400).json({ error: 'Envie {key, value} ou {settings: {...}}' });
    }
    if (!entries.length || entries.length > 100) return res.status(400).json({ error: 'Envie de 1 a 100 configurações' });

    const unknown = entries.map(([key]) => key).filter((key) => !isAllowedKey(key) || SERVER_KEYS.has(key));
    if (unknown.length) return res.status(400).json({ error: `Chaves não permitidas: ${unknown.join(', ')}` });
    if (!req.user.totp_enabled && entries.some(([key]) => TWO_FACTOR_KEY_RE.test(key))) {
      return res.status(403).json({ code: '2fa_required', error: 'Ligue a verificação em duas etapas para mudar pagamento, fiscal ou segurança.' });
    }
    // A regra de segurança da equipe é do dono: um admin não pode se livrar dela.
    if (req.user.role !== 'super_admin' && entries.some(([key]) => OWNER_KEYS.has(key))) {
      return res.status(403).json({ error: 'Só o dono pode mudar a exigência das duas etapas.' });
    }

    let normalized;
    try {
      normalized = entries.map(([key, value]) => [key, normalizeValue(key, value)]);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const upsert = (key, value) => conn.query(
        'INSERT INTO site_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)',
        [key, value]
      );
      for (const [key, value] of normalized) {
        if (PAGE_KEYS.has(key)) {
          // Data de atualização da página legal só muda se o texto mudou.
          const [[current]] = await conn.query('SELECT setting_value FROM site_settings WHERE setting_key = ?', [key])
            .then(([rows]) => [rows.length ? rows : [{ setting_value: null }]]);
          if (String(current.setting_value ?? '') !== value) await upsert(`${key}_updated_at`, new Date().toISOString());
        }
        await upsert(key, value);
      }
      await conn.commit();
      if (normalized.some(([key]) => key === 'admin_require_2fa')) {
        require('../middleware/auth').invalidateSettingsCache();
      }
      auditReq(req, 'update', 'settings', null, { keys: normalized.map(([key]) => key) });
      res.json({ message: 'Configuração salva', saved: normalized.length });
    } catch (error) {
      await conn.rollback();
      res.status(500).json({ error: 'Erro ao salvar configuração' });
    } finally {
      conn.release();
    }
  }
};

// Leitura interna (pedido, e-mail). Devolve '' se não existir.
async function getSettingValue(key) {
  const [rows] = await pool.query('SELECT setting_value FROM site_settings WHERE setting_key = ?', [key]);
  return rows.length ? String(rows[0].setting_value ?? '') : '';
}

// Várias de uma vez: { chave: valor } ('' para as que não existem).
async function getSettingValues(keys) {
  const [rows] = await pool.query('SELECT setting_key, setting_value FROM site_settings WHERE setting_key IN (?)', [keys]);
  const map = Object.fromEntries(keys.map((key) => [key, '']));
  for (const row of rows) map[row.setting_key] = String(row.setting_value ?? '');
  return map;
}

module.exports = settingsController;
module.exports.getSettingValue = getSettingValue;
module.exports.getSettingValues = getSettingValues;
module.exports.isPublicKey = isPublicKey;
