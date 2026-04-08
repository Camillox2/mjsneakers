const { pool } = require('../config/db');

const brandController = {
  async getAll(req, res) {
    try {
      const [rows] = await pool.query('SELECT * FROM brands ORDER BY name');
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar marcas' });
    }
  }
};

module.exports = brandController;
