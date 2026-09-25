require('dotenv').config();
// Fuso da loja para todo Date do Node (e-mails, promoções, relatórios). Vem
// antes de qualquer outro require que possa criar datas.
if (!process.env.TZ) process.env.TZ = 'America/Sao_Paulo';

const requiredEnvs = ['JWT_SECRET', 'DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
for (const key of requiredEnvs) {
  if (!process.env[key]) { console.error(`FATAL: "${key}" não definida.`); process.exit(1); }
}
// Segredo curto é fácil de quebrar por força bruta offline.
if (process.env.JWT_SECRET.length < 32) {
  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: JWT_SECRET deve ter pelo menos 32 caracteres em produção.');
    process.exit(1);
  }
  console.warn('[Aviso] JWT_SECRET tem menos de 32 caracteres. Use um segredo longo e aleatório.');
}

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { initDatabase, pool } = require('./config/db');
const { stockRoutes, supplierRoutes } = require('./routes/stock');
const { setupChatSocket } = require('./socket/chatSocket');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3305;
const isProduction = process.env.NODE_ENV === 'production';

// Atrás de proxy (nginx, load balancer), req.ip só é o IP do cliente com
// trust proxy. TRUST_PROXY aceita true/false, número de saltos ou lista de IPs.
function parseTrustProxy(value) {
  if (value === undefined || value === '') return false;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}
app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));

const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:4173', 'http://localhost:3305'];

// Socket.io (chat ao vivo): autenticação e regras em socket/chatSocket.js
const io = new Server(server, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST'], credentials: true },
  maxHttpBufferSize: 16 * 1024,
});
setupChatSocket(io);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin(origin, cb) {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    const error = new Error('Origem não permitida');
    error.status = 403;
    cb(error);
  },
  credentials: true,
}));
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  // Fora de produção, o próprio computador não entra no limite.
  skip: (req) => {
    if (isProduction) return false;
    const ip = req.ip || '';
    return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  },
}));
// Imagens sobem por /upload (multipart); JSON grande não é necessário.
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads'), { maxAge: '7d', dotfiles: 'deny' }));

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
app.use('/api/stock', stockRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/appearance', require('./routes/appearance'));
app.use('/api/checkout', require('./routes/checkout'));

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada' }));

// Erros com status (JSON malformado, corpo grande, CORS) respondem a própria
// mensagem; erro inesperado não expõe detalhe interno.
app.use((err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error('Error:', err);
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Corpo da requisição muito grande' });
  res.status(status).json({ error: status >= 500 ? 'Erro interno' : (err.message || 'Requisição inválida') });
});

async function startServer() {
  try {
    await initDatabase();
    server.listen(PORT, () => console.log(`MJ Sneakers API running on port ${PORT}`));
    setInterval(async () => {
      try {
        await pool.query('DELETE FROM cart_reservations WHERE reserved_until < NOW()');
      } catch (e) {
        console.error('Cleanup error:', e.message);
      }
    }, 5 * 60 * 1000);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
