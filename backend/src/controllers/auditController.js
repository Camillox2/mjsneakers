const { pool } = require('../config/db');

const auditController = {
  async getAll(req, res) {
    try {
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
      const offset = (page - 1) * limit;

      const [[{ total }]] = await pool.query('SELECT COUNT(*) as total FROM audit_logs');
      const [rows] = await pool.query(
        'SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ? OFFSET ?',
        [limit, offset]
      );

      res.json({
        data: rows,
        total,
        page,
        pages: Math.ceil(total / limit)
      });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar logs' });
    }
  }
};

/**
 * Log an admin action for audit trail
 * @param {object} params - { adminId, adminUsername, action, entity, entityId, details, ip }
 */
async function logAudit({ adminId, adminUsername, action, entity, entityId, details, ip }) {
  try {
    await pool.query(
      'INSERT INTO audit_logs (admin_id, admin_username, action, entity, entity_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [adminId, adminUsername, action, entity, entityId || null, details || null, ip || null]
    );
  } catch (error) {
    console.error('Audit log error:', error.message);
  }
}

module.exports = { auditController, logAudit };
