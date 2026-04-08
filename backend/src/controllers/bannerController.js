const { pool } = require('../config/db');

const bannerController = {
  async getAll(req, res) {
    try {
      const [rows] = await pool.query(
        'SELECT * FROM banners ORDER BY sort_order ASC, created_at DESC'
      );
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar banners' });
    }
  },

  async getActive(req, res) {
    try {
      const [rows] = await pool.query(
        'SELECT * FROM banners WHERE active = TRUE ORDER BY sort_order ASC'
      );
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar banners' });
    }
  },

  async create(req, res) {
    try {
      const { title, subtitle, image_url, video_url, media_type, link, animation_type, effect_type, effect_speed, sort_order } = req.body;
      const [result] = await pool.query(
        `INSERT INTO banners (title, subtitle, image_url, video_url, media_type, link, animation_type, effect_type, effect_speed, sort_order) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [title, subtitle, image_url, video_url, media_type || 'image', link, animation_type || 'fade', effect_type || 'none', effect_speed || 'slow', sort_order || 0]
      );
      res.status(201).json({ id: result.insertId, message: 'Banner criado' });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao criar banner' });
    }
  },

  async update(req, res) {
    try {
      const { title, subtitle, image_url, video_url, media_type, link, animation_type, effect_type, effect_speed, sort_order, active } = req.body;
      await pool.query(
        `UPDATE banners SET title=?, subtitle=?, image_url=?, video_url=?, media_type=?, link=?, animation_type=?, effect_type=?, effect_speed=?, sort_order=?, active=? WHERE id=?`,
        [title, subtitle, image_url, video_url, media_type, link, animation_type, effect_type, effect_speed, sort_order, active, req.params.id]
      );
      res.json({ message: 'Banner atualizado' });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao atualizar banner' });
    }
  },

  async delete(req, res) {
    try {
      await pool.query('DELETE FROM banners WHERE id = ?', [req.params.id]);
      res.json({ message: 'Banner removido' });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao remover banner' });
    }
  }
};

module.exports = bannerController;
