const { pool } = require('../config/db');
const { resolveToken, isAdmin } = require('../middleware/auth');
const { ADMIN_COOKIE, parseCookies } = require('../utils/cookies');
const { chatWaitingEmail } = require('../services/emailService');
const { notifyAdmins } = require('../utils/notify');

// Chat ao vivo por Socket.io.
// - O socket vira admin só com JWT válido de admin (handshake.auth.token ou
//   cookie pz_adm). A origem do handshake é conferida no server.js.
// - Eventos admin:* e session:close exigem admin.
// - customer:message só vale para a sessão que o próprio socket abriu/entrou.
// - Cada mensagem é emitida uma única vez para a união das salas envolvidas.
// - Presença: 'staff:status' {online} vai para todos quando o primeiro admin
//   entra (admin:join) e quando o último sai.

const WINDOW_MS = 10 * 1000;
const MAX_EVENTS_PER_WINDOW = 20;
const MAX_MESSAGE_LENGTH = 2000;
const EXCERPT_LENGTH = 300;
const NOTIFY_INTERVAL_MINUTES = 30;
const SESSION_ID_RE = /^[A-Za-z0-9_-]{8,100}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Sockets de admin que já deram admin:join (a presença conta só esses).
const onlineAdmins = new Set();
let ioInstance = null;

function staffOnline() {
  return onlineAdmins.size > 0;
}

function cleanSessionId(value) {
  const id = typeof value === 'string' ? value.trim() : '';
  return SESSION_ID_RE.test(id) ? id : null;
}

function cleanMessage(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > MAX_MESSAGE_LENGTH) return null;
  return text;
}

async function loadHistory(sessionId) {
  const [msgs] = await pool.query(
    'SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC, id ASC LIMIT 100',
    [sessionId]
  );
  return msgs;
}

// Usado pela rota REST de encerrar: avisa admins e o cliente da sessão.
function emitSessionClosed(sessionId) {
  if (!ioInstance) return;
  ioInstance.to('admins').to(`session:${sessionId}`).emit('session:closed', { sessionId });
}

function getIO() {
  return ioInstance;
}

// Sem ninguém da equipe online, avisa por e-mail, no máximo uma vez a cada
// 30 min por sessão. A marca é gravada antes do envio (UPDATE atômico) e o
// updated_at da sessão não muda por causa dela.
async function notifyIfNobodyOnline(sessionId, text) {
  if (staffOnline()) return false;
  const [marked] = await pool.query(
    `UPDATE chat_sessions SET admin_notified_at = NOW(), updated_at = updated_at
     WHERE session_id = ?
       AND (admin_notified_at IS NULL OR admin_notified_at < DATE_SUB(NOW(), INTERVAL ${NOTIFY_INTERVAL_MINUTES} MINUTE))`,
    [sessionId]
  );
  if (marked.affectedRows !== 1) return false;
  const [[session]] = await pool.query(
    'SELECT customer_name, customer_email FROM chat_sessions WHERE session_id = ?',
    [sessionId]
  );
  const excerpt = text.length > EXCERPT_LENGTH ? `${text.slice(0, EXCERPT_LENGTH)}...` : text;
  notifyAdmins(() => chatWaitingEmail({
    customerName: session?.customer_name,
    customerEmail: session?.customer_email,
    excerpt,
  }));
  return true;
}

function setupChatSocket(io) {
  ioInstance = io;

  io.use(async (socket, next) => {
    socket.data.isAdmin = false;
    socket.data.sessions = new Set();
    // Admin pelo token do handshake ou pelo cookie de sessão pz_adm.
    const token = (socket.handshake.auth && socket.handshake.auth.token)
      || parseCookies(socket.handshake.headers.cookie)[ADMIN_COOKIE];
    if (typeof token === 'string' && token) {
      try {
        const user = await resolveToken(token);
        if (isAdmin(user)) {
          socket.data.isAdmin = true;
          socket.data.user = user;
        }
      } catch (error) {
        console.error('Socket auth error:', error.message);
      }
    }
    next();
  });

  io.on('connection', (socket) => {
    // Limite simples por socket: MAX_EVENTS_PER_WINDOW eventos a cada 10s.
    let windowStart = Date.now();
    let eventCount = 0;
    const allowEvent = () => {
      const now = Date.now();
      if (now - windowStart > WINDOW_MS) {
        windowStart = now;
        eventCount = 0;
      }
      eventCount += 1;
      return eventCount <= MAX_EVENTS_PER_WINDOW;
    };

    const fail = (error) => socket.emit('chat:error', { error });
    const sendStatus = () => socket.emit('staff:status', { online: staffOnline() });

    // Registra um evento com limite, checagem de admin e try/catch.
    const on = (event, handler, { admin = false } = {}) => {
      socket.on(event, async (payload) => {
        if (!allowEvent()) return fail('Muitas mensagens seguidas. Aguarde alguns segundos.');
        if (admin && !socket.data.isAdmin) return fail('Acesso negado');
        try {
          await handler(payload && typeof payload === 'object' ? payload : {});
        } catch (error) {
          console.error(`Socket ${event} error:`, error.message);
          fail('Erro no chat. Tente novamente.');
        }
      });
    };

    // Admin entra: recebe as sessões abertas e passa a ouvir 'admins'. Se é
    // o primeiro admin online, todos recebem staff:status {online: true}.
    on('admin:join', async () => {
      socket.join('admins');
      if (!onlineAdmins.has(socket.id)) {
        onlineAdmins.add(socket.id);
        if (onlineAdmins.size === 1) io.emit('staff:status', { online: true });
      }
      const [rows] = await pool.query("SELECT * FROM chat_sessions WHERE status='open' ORDER BY updated_at DESC LIMIT 200");
      socket.emit('sessions:list', rows);
    }, { admin: true });

    // Qualquer um pergunta se há alguém da equipe online.
    on('staff:ping', async () => {
      sendStatus();
    });

    // Cliente abre (ou retoma) a própria sessão.
    on('customer:join', async ({ sessionId, name, email }) => {
      const id = cleanSessionId(sessionId);
      if (!id) return fail('Sessão inválida');
      const customerName = typeof name === 'string' && name.trim() ? name.trim().slice(0, 100) : 'Cliente';
      const customerEmail = typeof email === 'string' && EMAIL_RE.test(email.trim()) ? email.trim().slice(0, 255) : '';

      await pool.query(`
        INSERT INTO chat_sessions (session_id, customer_name, customer_email)
        VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE status='open', updated_at=NOW()
      `, [id, customerName, customerEmail]);
      socket.data.sessions.add(id);
      socket.join(`session:${id}`);
      socket.emit('chat:history', await loadHistory(id));
      sendStatus();
      const [[session]] = await pool.query('SELECT * FROM chat_sessions WHERE session_id = ?', [id]);
      io.to('admins').emit('session:new', session);
    });

    // Mensagem do cliente: só na sessão que este socket abriu. Sessão
    // encerrada volta a ficar aberta e reaparece para os admins.
    on('customer:message', async ({ sessionId, message }) => {
      const id = cleanSessionId(sessionId);
      if (!id || !socket.data.sessions.has(id)) return fail('Entre na conversa antes de enviar mensagens');
      const text = cleanMessage(message);
      if (!text) return fail(`A mensagem deve ter de 1 a ${MAX_MESSAGE_LENGTH} caracteres`);

      const [reopened] = await pool.query(
        "UPDATE chat_sessions SET status = 'open' WHERE session_id = ? AND status = 'closed'",
        [id]
      );
      const [r] = await pool.query(
        'INSERT INTO chat_messages (session_id, sender, message) VALUES (?, ?, ?)',
        [id, 'customer', text]
      );
      await pool.query('UPDATE chat_sessions SET updated_at=NOW() WHERE session_id=?', [id]);
      if (reopened.affectedRows === 1) {
        const [[session]] = await pool.query('SELECT * FROM chat_sessions WHERE session_id = ?', [id]);
        io.to('admins').emit('session:new', session);
      }
      const msg = { id: r.insertId, session_id: id, sender: 'customer', message: text, created_at: new Date() };
      // Uma emissão só: quem está nas duas salas recebe uma vez.
      io.to(`session:${id}`).to('admins').emit('chat:message', msg);

      // E-mail para a equipe não pode travar nem derrubar o chat.
      notifyIfNobodyOnline(id, text).catch((error) => console.error('Chat notify error:', error.message));
    });

    // Admin abre uma conversa (e sai da que estava aberta antes).
    on('admin:join-session', async ({ sessionId }) => {
      const id = cleanSessionId(sessionId);
      if (!id) return fail('Sessão inválida');
      for (const room of socket.rooms) {
        if (room.startsWith('session:') && room !== `session:${id}`) socket.leave(room);
      }
      socket.join(`session:${id}`);
      socket.emit('chat:history', await loadHistory(id));
    }, { admin: true });

    on('admin:leave-session', async ({ sessionId }) => {
      const id = cleanSessionId(sessionId);
      if (id) socket.leave(`session:${id}`);
    }, { admin: true });

    // Resposta do admin: vai para o cliente e para os outros admins.
    on('admin:message', async ({ sessionId, message }) => {
      const id = cleanSessionId(sessionId);
      if (!id) return fail('Sessão inválida');
      const text = cleanMessage(message);
      if (!text) return fail(`A mensagem deve ter de 1 a ${MAX_MESSAGE_LENGTH} caracteres`);
      const [sessions] = await pool.query("SELECT session_id FROM chat_sessions WHERE session_id = ? AND status = 'open'", [id]);
      if (!sessions.length) return fail('Conversa encerrada ou inexistente');

      const [r] = await pool.query(
        'INSERT INTO chat_messages (session_id, sender, message) VALUES (?, ?, ?)',
        [id, 'admin', text]
      );
      await pool.query('UPDATE chat_sessions SET updated_at=NOW() WHERE session_id=?', [id]);
      const msg = { id: r.insertId, session_id: id, sender: 'admin', message: text, created_at: new Date() };
      io.to(`session:${id}`).to('admins').emit('chat:message', msg);
    }, { admin: true });

    // Encerrar conversa: só admin.
    on('session:close', async ({ sessionId }) => {
      const id = cleanSessionId(sessionId);
      if (!id) return fail('Sessão inválida');
      await pool.query("UPDATE chat_sessions SET status='closed' WHERE session_id=?", [id]);
      emitSessionClosed(id);
    }, { admin: true });

    // Último admin saindo: todos recebem staff:status {online: false}.
    socket.on('disconnect', () => {
      if (onlineAdmins.delete(socket.id) && onlineAdmins.size === 0) {
        io.emit('staff:status', { online: false });
      }
    });
  });
}

module.exports = { setupChatSocket, emitSessionClosed, getIO, staffOnline };
