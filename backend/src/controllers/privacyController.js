const { pool } = require('../config/db');
const { sha256, safeEqual, numericCode } = require('../utils/secrets');
const { exportByEmail, anonymizeByEmail, normalizeEmail } = require('../utils/privacyData');
const { verificationCodeEmail, privacyRequestEmail } = require('../services/emailService');
const { sendLater, notifyAdmins } = require('../utils/notify');
const { pagination } = require('../utils/validate');
const { auditReq, logAudit } = require('./auditController');

// Pedidos do titular (LGPD, art. 18). O titular confirma o e-mail com um
// código de 6 dígitos; só depois o pedido entra na fila da equipe.
const TYPES = {
  access: 'Acesso aos dados',
  correction: 'Correção de dados',
  deletion: 'Exclusão dos dados',
  revoke_marketing: 'Revogar consentimento de marketing',
};
const STATUSES = ['pending_verification', 'open', 'done', 'rejected'];
const ADMIN_STATUSES = ['open', 'done', 'rejected'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_TTL_MINUTES = 30;
const MAX_ATTEMPTS = 5;
const MAX_PER_EMAIL = 3; // pedidos por e-mail a cada 15 min
const INVALID_CODE = 'Código inválido ou vencido';

function codeHash(id, email, code) {
  return sha256(`privacy:${id}:${email}:${code}`);
}

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function formatRequest(row) {
  return {
    id: row.id,
    type: row.type,
    type_label: TYPES[row.type] || row.type,
    email: row.email,
    message: row.message,
    status: row.status,
    admin_note: row.admin_note,
    verified_at: row.verified_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function findRequest(id) {
  const [rows] = await pool.query(
    'SELECT id, type, email, message, status, admin_note, verified_at, created_at, updated_at FROM privacy_requests WHERE id = ?',
    [id]
  );
  return rows[0] || null;
}

const privacyController = {
  // Público (captcha): {type, email, message} → 202 {id}; o código vai por e-mail.
  async create(req, res) {
    const type = String(req.body?.type || '');
    const email = normalizeEmail(req.body?.email);
    const message = req.body?.message === undefined || req.body?.message === null ? '' : String(req.body.message).trim();
    if (!TYPES[type]) return res.status(400).json({ error: `type deve ser: ${Object.keys(TYPES).join(', ')}` });
    if (!EMAIL_RE.test(email) || email.length > 255) return res.status(400).json({ error: 'E-mail inválido' });
    if (message.length > 2000) return res.status(400).json({ error: 'Mensagem muito longa (máximo de 2000 caracteres)' });
    if (type === 'correction' && !message) {
      return res.status(400).json({ error: 'Diga na mensagem o que precisa ser corrigido' });
    }
    try {
      // Pedido nunca confirmado não fica guardado: some depois de 7 dias.
      await pool.query(
        "DELETE FROM privacy_requests WHERE status = 'pending_verification' AND created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)"
      );
      const [[{ recent }]] = await pool.query(
        'SELECT COUNT(*) AS recent FROM privacy_requests WHERE email = ? AND created_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE)',
        [email]
      );
      if (Number(recent) >= MAX_PER_EMAIL) {
        return res.status(429).json({ error: 'Muitos pedidos para este e-mail. Tente novamente em alguns minutos.' });
      }
      const [result] = await pool.query(
        'INSERT INTO privacy_requests (type, email, message) VALUES (?, ?, ?)',
        [type, email, message || null]
      );
      const id = result.insertId;
      const code = numericCode(6);
      await pool.query(
        'UPDATE privacy_requests SET code_hash = ?, code_expires_at = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE id = ?',
        [codeHash(id, email, code), CODE_TTL_MINUTES, id]
      );
      sendLater(email, () => verificationCodeEmail({ code, purpose: 'privacy' }));
      res.status(202).json({
        id,
        message: `Enviamos um código de 6 dígitos para ${email}. Ele vale por ${CODE_TTL_MINUTES} minutos.`,
      });
    } catch (error) {
      console.error('Privacy request error:', error.message);
      res.status(500).json({ error: 'Erro ao registrar o pedido' });
    }
  },

  // Público: {code} → {status:'open'}. 5 tentativas por pedido.
  async verify(req, res) {
    const id = parseId(req.params.id);
    const code = String(req.body?.code || '').replace(/\D/g, '');
    if (!id) return res.status(400).json({ error: 'id inválido' });
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query(
        `SELECT id, type, email, status, code_hash, attempts, code_expires_at > NOW() AS alive
         FROM privacy_requests WHERE id = ? FOR UPDATE`,
        [id]
      );
      const request = rows[0];
      // Pedido inexistente, já confirmado, vencido ou travado: mesma resposta.
      if (!request || request.status !== 'pending_verification' || !request.code_hash
        || !Number(request.alive) || request.attempts >= MAX_ATTEMPTS) {
        await conn.rollback();
        return res.status(400).json({ error: INVALID_CODE, attempts_left: 0 });
      }
      if (code.length !== 6 || !safeEqual(request.code_hash, codeHash(id, request.email, code))) {
        const attemptsLeft = Math.max(MAX_ATTEMPTS - request.attempts - 1, 0);
        await conn.query(
          `UPDATE privacy_requests SET attempts = attempts + 1${attemptsLeft === 0 ? ', code_hash = NULL' : ''} WHERE id = ?`,
          [id]
        );
        await conn.commit();
        return res.status(400).json({ error: INVALID_CODE, attempts_left: attemptsLeft });
      }

      // Revogar marketing não depende da equipe: sai da newsletter na hora.
      let autoNote = null;
      if (request.type === 'revoke_marketing') {
        const [news] = await conn.query('UPDATE newsletter_subscribers SET active = FALSE WHERE email = ?', [request.email]);
        await conn.query('UPDATE customers SET marketing_opt_in = FALSE WHERE email = ?', [request.email]);
        autoNote = `Marketing revogado automaticamente na confirmação (newsletter: ${news.affectedRows ? 'cancelada' : 'não inscrito'}).`;
      }
      await conn.query(
        `UPDATE privacy_requests SET status = 'open', verified_at = NOW(), code_hash = NULL, code_expires_at = NULL,
           admin_note = COALESCE(?, admin_note)
         WHERE id = ?`,
        [autoNote, id]
      );
      await conn.commit();
      notifyAdmins(() => privacyRequestEmail({ id, typeLabel: TYPES[request.type] }));
      res.json({ id, status: 'open', message: 'Pedido confirmado. Respondemos em até 15 dias pelo seu e-mail.' });
    } catch (error) {
      await conn.rollback().catch(() => {});
      console.error('Privacy verify error:', error.message);
      res.status(500).json({ error: 'Erro ao confirmar o pedido' });
    } finally {
      conn.release();
    }
  },

  // Admin: ?status=&type=&page=&limit= → {data, total, page, pages, counts}
  async list(req, res) {
    try {
      const { page, limit, offset } = pagination(req.query, 20, 100);
      const where = [];
      const params = [];
      if (req.query.status) {
        if (!STATUSES.includes(req.query.status)) return res.status(400).json({ error: `status deve ser: ${STATUSES.join(', ')}` });
        where.push('status = ?');
        params.push(req.query.status);
      }
      if (req.query.type) {
        if (!TYPES[req.query.type]) return res.status(400).json({ error: `type deve ser: ${Object.keys(TYPES).join(', ')}` });
        where.push('type = ?');
        params.push(req.query.type);
      }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const [rows] = await pool.query(
        `SELECT id, type, email, message, status, admin_note, verified_at, created_at, updated_at
         FROM privacy_requests ${whereSql} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );
      const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM privacy_requests ${whereSql}`, params);
      const [countRows] = await pool.query('SELECT status, COUNT(*) AS n FROM privacy_requests GROUP BY status');
      const counts = Object.fromEntries(STATUSES.map((status) => [status, 0]));
      for (const row of countRows) counts[row.status] = Number(row.n);
      res.json({ data: rows.map(formatRequest), total: Number(total), page, pages: Math.ceil(Number(total) / limit), counts });
    } catch (error) {
      console.error('Privacy list error:', error.message);
      res.status(500).json({ error: 'Erro ao buscar os pedidos' });
    }
  },

  // Admin: {status ('open'|'done'|'rejected'), admin_note}
  async update(req, res) {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'id inválido' });
    const fields = {};
    if (req.body?.status !== undefined) {
      if (!ADMIN_STATUSES.includes(req.body.status)) {
        return res.status(400).json({ error: `status deve ser: ${ADMIN_STATUSES.join(', ')}` });
      }
      fields.status = req.body.status;
    }
    if (req.body?.admin_note !== undefined) {
      const note = req.body.admin_note === null ? '' : String(req.body.admin_note).trim();
      if (note.length > 2000) return res.status(400).json({ error: 'admin_note muito longa (máximo de 2000 caracteres)' });
      fields.admin_note = note || null;
    }
    if (!Object.keys(fields).length) return res.status(400).json({ error: 'Envie status ou admin_note' });
    try {
      const request = await findRequest(id);
      if (!request) return res.status(404).json({ error: 'Pedido não encontrado' });
      if (fields.status && request.status === 'pending_verification') {
        return res.status(409).json({ error: 'O titular ainda não confirmou o e-mail deste pedido' });
      }
      const columns = Object.keys(fields);
      await pool.query(
        `UPDATE privacy_requests SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
        [...columns.map((c) => fields[c]), id]
      );
      auditReq(req, 'update', 'privacy_request', id, { from: request.status, ...fields });
      res.json(formatRequest(await findRequest(id)));
    } catch (error) {
      console.error('Privacy update error:', error.message);
      res.status(500).json({ error: 'Erro ao atualizar o pedido' });
    }
  },

  // Admin com 2FA: JSON com tudo o que a loja guarda do e-mail do pedido.
  async exportData(req, res) {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'id inválido' });
    try {
      const request = await findRequest(id);
      if (!request) return res.status(404).json({ error: 'Pedido não encontrado' });
      if (request.status === 'pending_verification') {
        return res.status(409).json({ error: 'O titular ainda não confirmou o e-mail deste pedido' });
      }
      const data = await exportByEmail(request.email);
      auditReq(req, 'export', 'privacy_request', id, { type: request.type });
      res.set('Content-Disposition', `attachment; filename="dados-pedido-${id}.json"`);
      res.set('Cache-Control', 'no-store');
      res.json({ request: formatRequest(request), data });
    } catch (error) {
      console.error('Privacy export error:', error.message);
      res.status(500).json({ error: 'Erro ao exportar os dados' });
    }
  },

  // Admin com 2FA: anonimiza tudo do e-mail (só pedido de exclusão confirmado).
  async anonymize(req, res) {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'id inválido' });
    try {
      const request = await findRequest(id);
      if (!request) return res.status(404).json({ error: 'Pedido não encontrado' });
      if (request.type !== 'deletion') return res.status(409).json({ error: 'Só pedidos de exclusão podem ser anonimizados' });
      if (request.status !== 'open') {
        return res.status(409).json({
          error: request.status === 'pending_verification'
            ? 'O titular ainda não confirmou o e-mail deste pedido'
            : 'Este pedido já foi encerrado',
        });
      }
      const summary = await anonymizeByEmail(request.email);
      const kept = summary.orders_kept_fiscal
        ? ` ${summary.orders_kept_fiscal} pedido(s) com nota fiscal autorizada mantiveram os dados fiscais por obrigação legal.`
        : '';
      const note = `Dados anonimizados em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.${kept}`;
      await pool.query(
        `UPDATE privacy_requests SET status = 'done',
           admin_note = CONCAT_WS('\n', NULLIF(admin_note, ''), ?)
         WHERE id = ?`,
        [note, id]
      );
      await logAudit({
        adminId: req.user?.id, adminUsername: req.user?.username, action: 'anonymize', entity: 'privacy_request',
        entityId: id, details: summary, ip: String(req.ip || '').slice(0, 45),
      });
      res.json({ request: formatRequest(await findRequest(id)), summary });
    } catch (error) {
      console.error('Privacy anonymize error:', error.message);
      res.status(500).json({ error: 'Erro ao anonimizar os dados' });
    }
  },
};

module.exports = { privacyController, PRIVACY_TYPES: TYPES };
