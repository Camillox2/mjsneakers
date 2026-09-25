const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');
const { auditReq } = require('./auditController');

const VISUAL_SETTING_KEYS = [
  'home_sections_order',
  'home_sections_visibility',
  'typography_heading_font',
  'typography_body_font',
  'typography_heading_size',
  'grid_columns_desktop',
  'show_price_strikethrough',
  'show_discount_badge',
  'show_product_rating',
  'custom_css',
  'announcement_bar',
  'popup_config',
  'og_tags',
  'hero_texts',
  'trust_strip',
  'footer_texts',
  'active_theme_id',
];

const HOME_ORDER_DEFAULT = ['banner', 'ticker', 'brands', 'featured', 'catalog', 'newsletter', 'bottom_banner'];
const HOME_VISIBILITY_DEFAULT = Object.fromEntries(HOME_ORDER_DEFAULT.map((key) => [key, true]));

const SYSTEM_THEMES = [
  {
    id: -1,
    name: 'Dark Gold',
    system: true,
    config: {
      '--primary-color': '#FFD700', '--bg-color': '#111111', '--card-color': '#1a1a1a',
      '--text-color': '#f5f5f5', '--border-color': '#2a2a2a',
      typography_heading_font: 'Bebas Neue', typography_body_font: 'Inter',
    },
  },
  {
    id: -2,
    name: 'Clean White',
    system: true,
    config: {
      '--primary-color': '#000000', '--bg-color': '#ffffff', '--card-color': '#f5f5f5',
      '--text-color': '#111111', '--border-color': '#e0e0e0',
      typography_heading_font: 'Montserrat', typography_body_font: 'Open Sans',
    },
  },
  {
    id: -3,
    name: 'Urban Red',
    system: true,
    config: {
      '--primary-color': '#E63946', '--bg-color': '#1a1a1a', '--card-color': '#242424',
      '--text-color': '#f5f5f5', '--border-color': '#333333',
      typography_heading_font: 'Oswald', typography_body_font: 'Roboto',
    },
  },
  {
    id: -4,
    name: 'Ocean Blue',
    system: true,
    config: {
      '--primary-color': '#00B4D8', '--bg-color': '#0D1B2A', '--card-color': '#1b2d3e',
      '--text-color': '#e0f4ff', '--border-color': '#1e3a52',
      typography_heading_font: 'Syne', typography_body_font: 'DM Sans',
    },
  },
  {
    id: -5,
    name: 'Forest Green',
    system: true,
    config: {
      '--primary-color': '#52B788', '--bg-color': '#1B2D1E', '--card-color': '#243828',
      '--text-color': '#e8f5e9', '--border-color': '#2d4a30',
      typography_heading_font: 'Raleway', typography_body_font: 'Nunito',
    },
  },
];

const GOOGLE_FONTS = [
  { name: 'Inter', url: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap' },
  { name: 'Poppins', url: 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap' },
  { name: 'Roboto', url: 'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap' },
  { name: 'Montserrat', url: 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap' },
  { name: 'Playfair Display', url: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&display=swap' },
  { name: 'Oswald', url: 'https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&display=swap' },
  { name: 'Raleway', url: 'https://fonts.googleapis.com/css2?family=Raleway:wght@400;500;600;700&display=swap' },
  { name: 'Nunito', url: 'https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700&display=swap' },
  { name: 'Lato', url: 'https://fonts.googleapis.com/css2?family=Lato:wght@400;700&display=swap' },
  { name: 'Open Sans', url: 'https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700&display=swap' },
  { name: 'Ubuntu', url: 'https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;500;700&display=swap' },
  { name: 'Fira Sans', url: 'https://fonts.googleapis.com/css2?family=Fira+Sans:wght@400;500;600;700&display=swap' },
  { name: 'Barlow', url: 'https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&display=swap' },
  { name: 'DM Sans', url: 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap' },
  { name: 'Syne', url: 'https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&display=swap' },
  { name: 'Space Grotesk', url: 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap' },
  { name: 'Bebas Neue', url: 'https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap' },
  { name: 'Anton', url: 'https://fonts.googleapis.com/css2?family=Anton&display=swap' },
  { name: 'Righteous', url: 'https://fonts.googleapis.com/css2?family=Righteous&display=swap' },
  { name: 'Kanit', url: 'https://fonts.googleapis.com/css2?family=Kanit:wght@400;500;600;700&display=swap' },
];

const OG_UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'og');

function parseSettingValue(value) {
  try {
    return JSON.parse(value);
  } catch (_error) {
    return value;
  }
}

function serializeSettingValue(value) {
  return value !== null && typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
}

function stripScriptTags(value) {
  return String(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script\b[^>]*\/?\s*>/gi, '');
}

function sanitizeCustomCss(value) {
  return stripScriptTags(value).replace(/javascript\s*:/gi, '');
}

function sanitizeHtmlContent(value) {
  if (typeof value === 'string') return stripScriptTags(value).replace(/javascript\s*:/gi, '');
  if (Array.isArray(value)) return value.map(sanitizeHtmlContent);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeHtmlContent(item)]));
  }
  return value;
}

async function upsertSetting(connection, key, value) {
  await connection.query(
    `INSERT INTO site_settings (setting_key, setting_value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = NOW()`,
    [key, serializeSettingValue(value)]
  );
}

function parseSection(row) {
  return { ...row, content: parseSettingValue(row.content) };
}

const appearanceController = {
  // Público: chaves visuais e as públicas de /settings (nunca as privadas).
  async getSettings(_req, res) {
    try {
      const { isPublicKey } = require('./settingsController');
      const visual = new Set(VISUAL_SETTING_KEYS);
      const [rows] = await pool.query('SELECT * FROM site_settings');
      const settings = Object.fromEntries(
        rows
          .filter((row) => visual.has(row.setting_key) || isPublicKey(row.setting_key))
          .map((row) => [row.setting_key, parseSettingValue(row.setting_value)])
      );
      res.json(settings);
    } catch (error) {
      console.error('Get appearance settings error:', error);
      res.status(500).json({ error: 'Erro ao buscar configurações visuais' });
    }
  },

  async saveSettings(req, res) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const entries = Object.entries(req.body);
      for (const [key, value] of entries) await upsertSetting(connection, key, value);
      await connection.commit();
      auditReq(req, 'update', 'appearance', null, { keys: entries.map(([key]) => key) });
      res.json({ saved: entries.length });
    } catch (error) {
      await connection.rollback();
      console.error('Save appearance settings error:', error);
      res.status(500).json({ error: 'Erro ao salvar configurações visuais' });
    } finally {
      connection.release();
    }
  },

  async getSectionsConfig(_req, res) {
    try {
      const [settingsRows, sections] = await Promise.all([
        pool.query(
          `SELECT setting_key, setting_value FROM site_settings
           WHERE setting_key IN ('home_sections_order', 'home_sections_visibility')`
        ).then(([rows]) => rows),
        pool.query('SELECT * FROM custom_sections WHERE active = 1 ORDER BY sort_order')
          .then(([rows]) => rows.map(parseSection)),
      ]);
      const settings = Object.fromEntries(
        settingsRows.map((row) => [row.setting_key, parseSettingValue(row.setting_value)])
      );
      res.json({
        order: settings.home_sections_order || HOME_ORDER_DEFAULT,
        visibility: settings.home_sections_visibility || HOME_VISIBILITY_DEFAULT,
        custom_sections: sections,
      });
    } catch (error) {
      console.error('Get sections config error:', error);
      res.status(500).json({ error: 'Erro ao buscar configuração das seções' });
    }
  },

  async saveSectionsConfig(req, res) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await upsertSetting(connection, 'home_sections_order', req.body.order);
      await upsertSetting(connection, 'home_sections_visibility', req.body.visibility);
      await connection.commit();
      auditReq(req, 'update', 'sections_config', null, req.body);
      res.json({ success: true });
    } catch (error) {
      await connection.rollback();
      console.error('Save sections config error:', error);
      res.status(500).json({ error: 'Erro ao salvar configuração das seções' });
    } finally {
      connection.release();
    }
  },

  async getCustomSections(_req, res) {
    try {
      const [rows] = await pool.query('SELECT * FROM custom_sections ORDER BY sort_order');
      res.json(rows.map(parseSection));
    } catch (error) {
      console.error('Get custom sections error:', error);
      res.status(500).json({ error: 'Erro ao buscar seções personalizadas' });
    }
  },

  async createCustomSection(req, res) {
    try {
      const { type, title = null, content, position_after = null, active = true, sort_order = 0 } = req.body;
      const [result] = await pool.query(
        `INSERT INTO custom_sections (type, title, content, position_after, active, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [type, title, JSON.stringify(content), position_after, active, sort_order]
      );
      const [[created]] = await pool.query('SELECT * FROM custom_sections WHERE id = ?', [result.insertId]);
      auditReq(req, 'create', 'custom_section', result.insertId, { type, title });
      res.status(201).json(parseSection(created));
    } catch (error) {
      console.error('Create custom section error:', error);
      res.status(500).json({ error: 'Erro ao criar seção personalizada' });
    }
  },

  async updateCustomSection(req, res) {
    try {
      const { type, title = null, content, position_after = null, active = true, sort_order = 0 } = req.body;
      const [result] = await pool.query(
        `UPDATE custom_sections SET type = ?, title = ?, content = ?, position_after = ?, active = ?, sort_order = ?
         WHERE id = ?`,
        [type, title, JSON.stringify(content), position_after, active, sort_order, req.params.id]
      );
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Seção personalizada não encontrada' });
      const [[updated]] = await pool.query('SELECT * FROM custom_sections WHERE id = ?', [req.params.id]);
      auditReq(req, 'update', 'custom_section', req.params.id, { type, title });
      res.json(parseSection(updated));
    } catch (error) {
      console.error('Update custom section error:', error);
      res.status(500).json({ error: 'Erro ao atualizar seção personalizada' });
    }
  },

  async deleteCustomSection(req, res) {
    try {
      const [result] = await pool.query('DELETE FROM custom_sections WHERE id = ?', [req.params.id]);
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Seção personalizada não encontrada' });
      auditReq(req, 'delete', 'custom_section', req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Delete custom section error:', error);
      res.status(500).json({ error: 'Erro ao remover seção personalizada' });
    }
  },

  async getThemePresets(_req, res) {
    try {
      const [[rows], [activeRows]] = await Promise.all([
        pool.query('SELECT * FROM theme_presets ORDER BY created_at DESC'),
        pool.query("SELECT setting_value FROM site_settings WHERE setting_key = 'active_theme_id'"),
      ]);
      const activeThemeId = activeRows.length ? Number(parseSettingValue(activeRows[0].setting_value)) : null;
      const systemThemes = SYSTEM_THEMES.map((theme) => ({
        ...theme,
        is_active: theme.id === activeThemeId,
      }));
      const savedThemes = rows.map((row) => ({
        ...row,
        system: false,
        config: parseSettingValue(row.config),
      }));
      res.json([...systemThemes, ...savedThemes]);
    } catch (error) {
      console.error('Get theme presets error:', error);
      res.status(500).json({ error: 'Erro ao buscar temas' });
    }
  },

  async createThemePreset(req, res) {
    try {
      const [result] = await pool.query(
        'INSERT INTO theme_presets (name, config) VALUES (?, ?)',
        [req.body.name, JSON.stringify(req.body.config)]
      );
      const [[created]] = await pool.query('SELECT * FROM theme_presets WHERE id = ?', [result.insertId]);
      auditReq(req, 'create', 'theme_preset', result.insertId, { name: req.body.name });
      res.status(201).json({ ...created, system: false, config: parseSettingValue(created.config) });
    } catch (error) {
      console.error('Create theme preset error:', error);
      res.status(500).json({ error: 'Erro ao salvar tema' });
    }
  },

  async activateThemePreset(req, res) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const themeId = Number(req.params.id);
      await connection.query('UPDATE theme_presets SET is_active = 0');

      let config;
      if (themeId < 0) {
        const systemTheme = SYSTEM_THEMES.find((theme) => theme.id === themeId);
        if (!systemTheme) {
          await connection.rollback();
          return res.status(404).json({ error: 'Tema não encontrado' });
        }
        config = systemTheme.config;
      } else {
        const [result] = await connection.query('UPDATE theme_presets SET is_active = 1 WHERE id = ?', [themeId]);
        if (result.affectedRows === 0) {
          await connection.rollback();
          return res.status(404).json({ error: 'Tema não encontrado' });
        }
        const [[theme]] = await connection.query('SELECT config FROM theme_presets WHERE id = ?', [themeId]);
        config = parseSettingValue(theme.config);
        if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Configuração de tema inválida');
        if (typeof config.custom_css === 'string') config.custom_css = sanitizeCustomCss(config.custom_css);
      }

      const entries = Object.entries(config);
      for (const [key, value] of entries) await upsertSetting(connection, key, value);
      await upsertSetting(connection, 'active_theme_id', String(themeId));
      await connection.commit();
      auditReq(req, 'activate', 'theme_preset', themeId);
      res.json({ success: true, applied_keys: entries.length });
    } catch (error) {
      await connection.rollback();
      console.error('Activate theme preset error:', error);
      res.status(500).json({ error: 'Erro ao ativar tema' });
    } finally {
      connection.release();
    }
  },

  async deleteThemePreset(req, res) {
    try {
      const [rows] = await pool.query('SELECT is_active FROM theme_presets WHERE id = ?', [req.params.id]);
      if (rows.length === 0) return res.status(404).json({ error: 'Tema não encontrado' });
      if (rows[0].is_active) return res.status(400).json({ error: 'Não é possível deletar o tema ativo' });
      await pool.query('DELETE FROM theme_presets WHERE id = ?', [req.params.id]);
      auditReq(req, 'delete', 'theme_preset', req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Delete theme preset error:', error);
      res.status(500).json({ error: 'Erro ao remover tema' });
    }
  },

  getGoogleFonts(_req, res) {
    res.json(GOOGLE_FONTS);
  },

  async uploadOgImage(req, res) {
    const newFilePath = req.file?.path;
    try {
      const [rows] = await pool.query(
        "SELECT setting_value FROM site_settings WHERE setting_key = 'og_tags'"
      );
      if (rows.length) {
        const ogTags = parseSettingValue(rows[0].setting_value);
        const previousUrl = ogTags && typeof ogTags === 'object' ? ogTags.image_url : null;
        const newUrl = `/uploads/og/${req.file.filename}`;
        if (typeof previousUrl === 'string'
            && previousUrl.startsWith('/uploads/og/')
            && previousUrl !== newUrl) {
          const previousPath = path.join(OG_UPLOAD_DIR, path.basename(previousUrl));
          await fs.promises.unlink(previousPath).catch((error) => {
            if (error.code !== 'ENOENT') throw error;
          });
        }
      }
      auditReq(req, 'upload', 'og_image', null, { file: req.file.filename });
      res.status(201).json({ url: `/uploads/og/${req.file.filename}` });
    } catch (error) {
      if (newFilePath) await fs.promises.unlink(newFilePath).catch(() => {});
      console.error('Upload OG image error:', error);
      res.status(500).json({ error: 'Erro ao enviar imagem OG' });
    }
  },
};

module.exports = {
  appearanceController,
  VISUAL_SETTING_KEYS,
  SYSTEM_THEMES,
  GOOGLE_FONTS,
  OG_UPLOAD_DIR,
  sanitizeCustomCss,
  sanitizeHtmlContent,
};
