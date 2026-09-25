const { pool } = require('../config/db');
const { auditReq } = require('./auditController');
const { isImageRef, toMysqlDateTime, toBool } = require('../utils/validate');

const MEDIA_TYPES = ['image', 'video'];
const ANIMATIONS = ['fade', 'slide', 'zoom', 'wave', 'flip'];
const EFFECTS = ['none', 'sparkle', 'comet', 'glow_pulse', 'neon_border', 'light_sweep'];
const SPEEDS = ['ultra_slow', 'slow', 'fast', 'super_fast'];

function httpError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function optionalText(value, max, field) {
  if (value === null || value === '') return null;
  const text = String(value).trim();
  if (text.length > max) throw httpError(`${field} deve ter no máximo ${max} caracteres`);
  return text;
}

function oneOf(value, list, field) {
  if (!list.includes(value)) throw httpError(`${field} deve ser um de: ${list.join(', ')}`);
  return value;
}

// Link do banner: caminho da loja, âncora ou http(s). Nada de javascript:.
function linkRule(value) {
  const text = optionalText(value, 500, 'link');
  if (text && !(text.startsWith('/') || text.startsWith('#') || /^https?:\/\//i.test(text))) {
    throw httpError('link deve começar com /, # ou http(s)://');
  }
  return text;
}

const RULES = {
  title: (v) => optionalText(v, 255, 'title'),
  subtitle: (v) => optionalText(v, 500, 'subtitle'),
  image_url: (v) => {
    if (!isImageRef(v)) throw httpError('Imagem inválida: envie antes por /upload e use a URL devolvida');
    return v || null;
  },
  // Versão para celular (opcional); sem ela a loja usa image_url.
  image_url_mobile: (v) => {
    if (!isImageRef(v)) throw httpError('Imagem para celular inválida: envie antes por /upload e use a URL devolvida');
    return v || null;
  },
  video_url: (v) => {
    if (v && !/^https?:\/\//i.test(String(v)) && !String(v).startsWith('/')) throw httpError('video_url deve ser uma URL http(s)');
    return optionalText(v, 2048, 'video_url');
  },
  media_type: (v) => oneOf(v, MEDIA_TYPES, 'media_type'),
  link: linkRule,
  animation_type: (v) => oneOf(v, ANIMATIONS, 'animation_type'),
  effect_type: (v) => oneOf(v, EFFECTS, 'effect_type'),
  effect_speed: (v) => oneOf(v, SPEEDS, 'effect_speed'),
  sort_order: (v) => {
    const n = v === '' || v === null ? 0 : Number(v);
    if (!Number.isInteger(n) || n < -100000 || n > 100000) throw httpError('sort_order deve ser um inteiro');
    return n;
  },
  active: (v) => {
    const b = toBool(v);
    if (b === undefined) throw httpError('active deve ser booleano');
    return b;
  },
  active_from: (v) => {
    try { return toMysqlDateTime(v); } catch (_error) { throw httpError('active_from inválido'); }
  },
  active_until: (v) => {
    try { return toMysqlDateTime(v); } catch (_error) { throw httpError('active_until inválido'); }
  },
};

function readBanner(body) {
  const fields = {};
  for (const [key, rule] of Object.entries(RULES)) {
    if (body[key] !== undefined) fields[key] = rule(body[key]);
  }
  if (fields.active_from && fields.active_until && fields.active_from > fields.active_until) {
    throw httpError('active_until deve ser depois de active_from');
  }
  return fields;
}

function formatBanner(row) {
  return { ...row, active: Boolean(row.active) };
}

const bannerController = {
  async getAll(req, res) {
    try {
      const [rows] = await pool.query(
        'SELECT * FROM banners ORDER BY sort_order ASC, created_at DESC'
      );
      res.json(rows.map(formatBanner));
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar banners' });
    }
  },

  // Público: só os ativos e dentro da janela de datas (quando houver).
  async getActive(req, res) {
    try {
      const [rows] = await pool.query(
        `SELECT * FROM banners
         WHERE active = TRUE
           AND (active_from IS NULL OR active_from <= NOW())
           AND (active_until IS NULL OR active_until >= NOW())
         ORDER BY sort_order ASC`
      );
      res.json(rows.map(formatBanner));
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar banners' });
    }
  },

  async create(req, res) {
    try {
      const fields = readBanner(req.body);
      const values = {
        media_type: 'image', animation_type: 'fade', effect_type: 'none', effect_speed: 'slow', sort_order: 0, active: true,
        ...fields,
      };
      const columns = Object.keys(values);
      const [result] = await pool.query(
        `INSERT INTO banners (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
        columns.map((c) => values[c])
      );
      auditReq(req, 'create', 'banner', result.insertId, { title: values.title || null });
      res.status(201).json({ id: result.insertId, message: 'Banner criado' });
    } catch (error) {
      if (error.status) return res.status(error.status).json({ error: error.message });
      res.status(500).json({ error: 'Erro ao criar banner' });
    }
  },

  // Atualiza só o que veio no corpo (null limpa o campo).
  async update(req, res) {
    try {
      const fields = readBanner(req.body);
      const columns = Object.keys(fields);
      if (!columns.length) return res.status(400).json({ error: 'Nada para atualizar' });
      const [result] = await pool.query(
        `UPDATE banners SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
        [...columns.map((c) => fields[c]), req.params.id]
      );
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Banner não encontrado' });
      auditReq(req, 'update', 'banner', req.params.id, { fields: columns });
      res.json({ message: 'Banner atualizado' });
    } catch (error) {
      if (error.status) return res.status(error.status).json({ error: error.message });
      res.status(500).json({ error: 'Erro ao atualizar banner' });
    }
  },

  async delete(req, res) {
    try {
      const [result] = await pool.query('DELETE FROM banners WHERE id = ?', [req.params.id]);
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Banner não encontrado' });
      auditReq(req, 'delete', 'banner', req.params.id);
      res.json({ message: 'Banner removido' });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao remover banner' });
    }
  }
};

module.exports = bannerController;
