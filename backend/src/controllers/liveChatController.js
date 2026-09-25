const { pool } = require('../config/db');
const { auditReq } = require('./auditController');
const { emitSessionClosed } = require('../socket/chatSocket');
const { pagination, likeTerm } = require('../utils/validate');

const SESSION_ID_RE = /^[A-Za-z0-9_-]{8,100}$/;
const STATUSES = ['open', 'closed', 'all'];

// Admin: conversas do chat ao vivo (o chatbot de IA fica em chatController).
const liveChatController = {
  // {data:[{session_id, customer_name, customer_email, status, created_at,
  //   updated_at, last_message, last_sender, messages_count}], total, page, pages}
  async listSessions(req, res) {
    try {
      const status = req.query.status || 'all';
      if (!STATUSES.includes(status)) return res.status(400).json({ error: 'status deve ser open, closed ou all' });
      const { page, limit, offset } = pagination(req.query, 30, 100);

      const where = ['1=1'];
      const params = [];
      if (status !== 'all') { where.push('s.status = ?'); params.push(status); }
      if (req.query.search) {
        const term = likeTerm(req.query.search);
        where.push('(s.customer_name LIKE ? OR s.customer_email LIKE ? OR s.session_id LIKE ?)');
        params.push(term, term, term);
      }
      const whereSql = `WHERE ${where.join(' AND ')}`;

      const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM chat_sessions s ${whereSql}`, params);
      const [rows] = await pool.query(
        `SELECT s.session_id, s.customer_name, s.customer_email, s.status, s.created_at, s.updated_at,
           last.message AS last_message, last.sender AS last_sender,
           COALESCE(counts.total, 0) AS messages_count
         FROM chat_sessions s
         LEFT JOIN (
           SELECT session_id, COUNT(*) AS total, MAX(id) AS last_id FROM chat_messages GROUP BY session_id
         ) counts ON counts.session_id = s.session_id
         LEFT JOIN chat_messages last ON last.id = counts.last_id
         ${whereSql}
         ORDER BY s.updated_at DESC, s.id DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );
      res.json({
        data: rows.map((row) => ({ ...row, messages_count: Number(row.messages_count) })),
        total: Number(total),
        page,
        pages: Math.ceil(Number(total) / limit),
      });
    } catch (error) {
      console.error('List chat sessions error:', error);
      res.status(500).json({ error: 'Erro ao buscar conversas' });
    }
  },

  // [{id, sender, message, created_at}], da mais antiga para a mais nova (até 500).
  async listMessages(req, res) {
    try {
      const sessionId = String(req.params.sessionId || '');
      if (!SESSION_ID_RE.test(sessionId)) return res.status(400).json({ error: 'Sessão inválida' });
      const [sessions] = await pool.query('SELECT session_id FROM chat_sessions WHERE session_id = ?', [sessionId]);
      if (!sessions.length) return res.status(404).json({ error: 'Conversa não encontrada' });
      const [rows] = await pool.query(
        `SELECT id, sender, message, created_at FROM (
           SELECT id, sender, message, created_at FROM chat_messages
           WHERE session_id = ? ORDER BY id DESC LIMIT 500
         ) recent ORDER BY id ASC`,
        [sessionId]
      );
      res.json(rows);
    } catch (error) {
      console.error('List chat messages error:', error);
      res.status(500).json({ error: 'Erro ao buscar mensagens' });
    }
  },

  // Encerra a conversa e avisa pelo socket (session:closed).
  async closeSession(req, res) {
    try {
      const sessionId = String(req.params.sessionId || '');
      if (!SESSION_ID_RE.test(sessionId)) return res.status(400).json({ error: 'Sessão inválida' });
      const [result] = await pool.query("UPDATE chat_sessions SET status = 'closed' WHERE session_id = ?", [sessionId]);
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Conversa não encontrada' });
      emitSessionClosed(sessionId);
      auditReq(req, 'close', 'chat_session', null, { session_id: sessionId });
      res.json({ message: 'Conversa encerrada' });
    } catch (error) {
      console.error('Close chat session error:', error);
      res.status(500).json({ error: 'Erro ao encerrar conversa' });
    }
  },
};

module.exports = liveChatController;
