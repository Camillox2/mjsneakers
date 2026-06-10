require('dotenv').config();

const requiredEnvs = ['JWT_SECRET', 'DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
for (const key of requiredEnvs) {
  if (!process.env[key]) { console.error(`FATAL: "${key}" não definida.`); process.exit(1); }
}

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { initDatabase, pool } = require('./config/db');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3305;

const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:4173', 'http://localhost:3305'];

// Socket.io
const io = new Server(server, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST'], credentials: true }
});

// Track connected admins and customer sessions
const adminSockets = new Set();
const customerSessions = new Map(); // sessionId -> socketId

io.on('connection', (socket) => {
  // Admin joins
  socket.on('admin:join', () => {
    adminSockets.add(socket.id);
    socket.join('admins');
    // Send list of open sessions
    pool.query("SELECT * FROM chat_sessions WHERE status='open' ORDER BY updated_at DESC")
      .then(([rows]) => socket.emit('sessions:list', rows))
      .catch(() => {});
  });

  // Customer starts chat
  socket.on('customer:join', async ({ sessionId, name, email }) => {
    try {
      await pool.query(`
        INSERT INTO chat_sessions (session_id, customer_name, customer_email)
        VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE status='open', updated_at=NOW()
      `, [sessionId, name || 'Cliente', email || '']);
      customerSessions.set(sessionId, socket.id);
      socket.join(`session:${sessionId}`);
      // Send history
      const [msgs] = await pool.query(
        'SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC LIMIT 100',
        [sessionId]
      );
      socket.emit('chat:history', msgs);
      // Notify admins
      const [[session]] = await pool.query('SELECT * FROM chat_sessions WHERE session_id = ?', [sessionId]);
      io.to('admins').emit('session:new', session);
    } catch (e) { console.error('customer:join error', e); }
  });

  // Message from customer
  socket.on('customer:message', async ({ sessionId, message }) => {
    try {
      const [r] = await pool.query(
        'INSERT INTO chat_messages (session_id, sender, message) VALUES (?, ?, ?)',
        [sessionId, 'customer', message]
      );
      await pool.query('UPDATE chat_sessions SET updated_at=NOW() WHERE session_id=?', [sessionId]);
      const msg = { id: r.insertId, session_id: sessionId, sender: 'customer', message, created_at: new Date() };
      io.to(`session:${sessionId}`).emit('chat:message', msg);
      io.to('admins').emit('chat:message', msg);
    } catch (e) { console.error('customer:message error', e); }
  });

  // Admin joins a session
  socket.on('admin:join-session', async ({ sessionId }) => {
    socket.join(`session:${sessionId}`);
    const [msgs] = await pool.query(
      'SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC LIMIT 100',
      [sessionId]
    );
    socket.emit('chat:history', msgs);
  });

  // Message from admin
  socket.on('admin:message', async ({ sessionId, message }) => {
    try {
      const [r] = await pool.query(
        'INSERT INTO chat_messages (session_id, sender, message) VALUES (?, ?, ?)',
        [sessionId, 'admin', message]
      );
      await pool.query('UPDATE chat_sessions SET updated_at=NOW() WHERE session_id=?', [sessionId]);
      const msg = { id: r.insertId, session_id: sessionId, sender: 'admin', message, created_at: new Date() };
      io.to(`session:${sessionId}`).emit('chat:message', msg);
    } catch (e) { console.error('admin:message error', e); }
  });

  // Close session
  socket.on('session:close', async ({ sessionId }) => {
    await pool.query("UPDATE chat_sessions SET status='closed' WHERE session_id=?", [sessionId]).catch(() => {});
    io.to('admins').emit('session:closed', { sessionId });
  });

  socket.on('disconnect', () => {
    adminSockets.delete(socket.id);
  });
});

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin(origin, cb) { if (!origin || allowedOrigins.includes(origin)) return cb(null, true); cb(new Error('CORS')); }, credentials: true }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500, standardHeaders: true, legacyHeaders: false }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads'), { maxAge: '7d' }));

// Routes
app.use('/api/products', require('./routes/products'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/brands', require('./routes/brands'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/banners', require('./routes/banners'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/shipping', require('./routes/shipping'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/tickers', require('./routes/tickers'));
app.use('/api/coupons', require('./routes/coupons'));
app.use('/api/audit', require('./routes/audit'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/newsletter', require('./routes/newsletter'));
app.use('/api/stock-alerts', require('./routes/stockAlerts'));
app.use('/api/loyalty', require('./routes/loyalty'));
app.use('/api/reports', require('./routes/reports'));

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.use((err, req, res, _next) => {
  console.error('Error:', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Erro interno' });
});

async function startServer() {
  try {
    await initDatabase();
    server.listen(PORT, () => console.log(`MJ Sneakers API running on port ${PORT}`));
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
