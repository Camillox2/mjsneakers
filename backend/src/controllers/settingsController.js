const { pool } = require('../config/db');
const { auditReq } = require('./auditController');
const { isImageRef } = require('../utils/validate');

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
]);
// Só o admin enxerga (ex.: para onde vai o aviso de pedido novo).
const PRIVATE_KEYS = new Set(['admin_notify_email']);
// Prefixos liberados além da lista: footer_*, store_* e bottom_banner_*.
const PUBLIC_PREFIX_RE = /^(footer|store|bottom_banner)_[a-z0-9_]{1,40}$/;

const BOOL_KEYS = new Set(['maintenance_mode', 'home_promo_enabled', 'ticker_enabled', 'ticker_double', 'bottom_banner_enabled']);
const MAX_VALUE_LENGTH = 5000;

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
  const text = value === null || value === undefined ? '' : String(value).trim();
  if (text.length > MAX_VALUE_LENGTH) throw new Error(`${key}: máximo de ${MAX_VALUE_LENGTH} caracteres`);

  if (BOOL_KEYS.has(key) && text !== '' && text !== 'true' && text !== 'false') {
    throw new Error(`${key}: use true ou false`);
  }
  if (key === 'gift_wrap_price' && text !== '') {
    const n = Number(text.replace(',', '.'));
    if (!Number.isFinite(n) || n < 0 || n > 1000) throw new Error('gift_wrap_price: valor entre 0 e 1000');
    return String(Math.round(n * 100) / 100);
  }
  if (key === 'bottom_banner_product_ids' && text !== '') {
    let ids;
    try { ids = JSON.parse(text); } catch (_error) { ids = null; }
    if (!Array.isArray(ids) || ids.length > 50 || !ids.every((id) => Number.isInteger(id) && id > 0)) {
      throw new Error('bottom_banner_product_ids: lista JSON de ids, ex.: [1,2,3]');
    }
  }
  if (key === 'bottom_banner_image' && !isImageRef(text)) {
    throw new Error('bottom_banner_image: envie antes por /upload e use a URL devolvida');
  }
  if ((key === 'admin_notify_email' || key === 'store_email' || key === 'footer_email' || key === 'contact_email')
      && text !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
    throw new Error(`${key}: e-mail inválido`);
  }
  return text;
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

    const unknown = entries.map(([key]) => key).filter((key) => !isAllowedKey(key));
    if (unknown.length) return res.status(400).json({ error: `Chaves não permitidas: ${unknown.join(', ')}` });

    let normalized;
    try {
      normalized = entries.map(([key, value]) => [key, normalizeValue(key, value)]);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const [key, value] of normalized) {
        await conn.query(
          'INSERT INTO site_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)',
          [key, value]
        );
      }
      await conn.commit();
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

module.exports = settingsController;
module.exports.getSettingValue = getSettingValue;
module.exports.isPublicKey = isPublicKey;
