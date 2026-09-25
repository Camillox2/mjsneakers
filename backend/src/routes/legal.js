const express = require('express');
const router = express.Router();
const { getSettingValues } = require('../controllers/settingsController');
const { TEMPLATES, fillTemplate } = require('../utils/legalTemplates');

const COMPANY_KEYS = {
  company_name: 'legal_company_name',
  trade_name: 'legal_trade_name',
  cnpj: 'legal_cnpj',
  address: 'legal_address',
  email: 'legal_email',
  phone: 'legal_phone',
  hours: 'legal_hours',
  dpo_name: 'legal_dpo_name',
  dpo_email: 'legal_dpo_email',
};
const PAGES = ['terms', 'returns', 'privacy'];

// Público: dados da empresa e as três páginas. Página vazia devolve o modelo
// padrão (is_default: true) com os dados da empresa já preenchidos.
router.get('/', async (_req, res) => {
  try {
    const keys = [...Object.values(COMPANY_KEYS), ...PAGES.flatMap((page) => [`page_${page}`, `page_${page}_updated_at`])];
    const raw = await getSettingValues(keys);
    const company = Object.fromEntries(Object.entries(COMPANY_KEYS).map(([field, key]) => [field, raw[key] || '']));
    const pages = {};
    for (const page of PAGES) {
      const custom = raw[`page_${page}`];
      pages[page] = custom
        ? { content: custom, updated_at: raw[`page_${page}_updated_at`] || null, is_default: false }
        : { content: fillTemplate(TEMPLATES[page], company), updated_at: null, is_default: true };
    }
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ company, pages });
  } catch (error) {
    console.error('Legal pages error:', error.message);
    res.status(500).json({ error: 'Erro ao buscar as páginas legais' });
  }
});

module.exports = router;
