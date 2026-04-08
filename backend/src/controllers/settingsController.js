const { pool } = require('../config/db');

const settingsController = {
  async getAll(req, res) {
    try {
      const [rows] = await pool.query('SELECT setting_key, setting_value FROM site_settings');
      const settings = {};
      rows.forEach(row => { settings[row.setting_key] = row.setting_value; });
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar configurações' });
    }
  },

  async get(req, res) {
    try {
      const [rows] = await pool.query('SELECT setting_value FROM site_settings WHERE setting_key = ?', [req.params.key]);
      if (rows.length === 0) return res.status(404).json({ error: 'Configuração não encontrada' });
      res.json({ value: rows[0].setting_value });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar configuração' });
    }
  },

  async upsert(req, res) {
    try {
      const { key, value } = req.body;
      await pool.query(
        'INSERT INTO site_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)',
        [key, value]
      );
      res.json({ message: 'Configuração salva' });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao salvar configuração' });
    }
  }
};

module.exports = settingsController;
