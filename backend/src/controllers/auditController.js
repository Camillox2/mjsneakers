const { pool } = require('../config/db');

const auditController = {
  async getAll(req, res) {
    try {
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
      const offset = (page - 1) * limit;

      let where = 'WHERE 1=1';
      const params = [];
      if (req.query.entity) { where += ' AND entity = ?'; params.push(String(req.query.entity).slice(0, 50)); }
      if (req.query.action) { where += ' AND action = ?'; params.push(String(req.query.action).slice(0, 100)); }

      const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM audit_logs ${where}`, params);
      const [rows] = await pool.query(
        `SELECT * FROM audit_logs ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );

      res.json({
        data: rows,
        total: Number(total),
        page,
        pages: Math.ceil(Number(total) / limit)
      });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar logs' });
    }
  }
};

// Valores distintos de entity e action que existem, para os filtros do painel.
auditController.facets = async (req, res) => {
  try {
    const [entities] = await pool.query(
      "SELECT DISTINCT entity FROM audit_logs WHERE entity IS NOT NULL AND entity <> '' ORDER BY entity"
    );
    const [actions] = await pool.query(
      "SELECT DISTINCT action FROM audit_logs WHERE action IS NOT NULL AND action <> '' ORDER BY action"
    );
    res.json({ entities: entities.map((row) => row.entity), actions: actions.map((row) => row.action) });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar filtros dos logs' });
  }
};

/**
 * Log an admin action for audit trail
 * @param {object} params - { adminId, adminUsername, action, entity, entityId, details, ip }
 */
async function logAudit({ adminId, adminUsername, action, entity, entityId, details, ip }, connection = pool) {
  try {
    const text = details === undefined || details === null
      ? null
      : (typeof details === 'string' ? details : JSON.stringify(details)).slice(0, 4000);
    await connection.query(
      'INSERT INTO audit_logs (admin_id, admin_username, action, entity, entity_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [adminId || null, adminUsername || null, action, entity, Number.isInteger(Number(entityId)) ? Number(entityId) : null, text, ip || null]
    );
  } catch (error) {
    console.error('Audit log error:', error.message);
  }
}

// Atalho para as rotas: tira usuário e IP da própria requisição.
function auditReq(req, action, entity, entityId, details) {
  return logAudit({
    adminId: req.user?.id,
    adminUsername: req.user?.username,
    action,
    entity,
    entityId,
    details,
    ip: String(req.ip || '').slice(0, 45),
  });
}

module.exports = { auditController, logAudit, auditReq };
