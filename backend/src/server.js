require('dotenv').config();

// ── Validar variáveis de ambiente obrigatórias ──
const requiredEnvs = ['JWT_SECRET', 'DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
for (const key of requiredEnvs) {
  if (!process.env[key]) {
    console.error(`FATAL: Variável de ambiente "${key}" não definida.`);
    process.exit(1);
  }
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { initDatabase } = require('./config/db');

const productRoutes = require('./routes/products');
const authRoutes = require('./routes/auth');
const brandRoutes = require('./routes/brands');
const settingsRoutes = require('./routes/settings');
const bannerRoutes = require('./routes/banners');
const reviewRoutes = require('./routes/reviews');
const shippingRoutes = require('./routes/shipping');
const chatRoutes = require('./routes/chat');
const orderRoutes = require('./routes/orders');
const dashboardRoutes = require('./routes/dashboard');
const tickerRoutes = require('./routes/tickers');
const couponRoutes = require('./routes/coupons');
const auditRoutes = require('./routes/audit');
const uploadRoutes = require('./routes/upload');

const app = express();
const PORT = process.env.PORT || 3304;

// ── Segurança: Helmet (headers HTTP) ──
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// ── Segurança: CORS restrito ──
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:4173', 'http://localhost:3304'];
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Bloqueado pelo CORS'));
  },
  credentials: true
}));

// ── Rate limiters ──
const globalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500, standardHeaders: true, legacyHeaders: false });
app.use(globalLimiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files for uploads
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads'), {
  maxAge: '7d',
  immutable: true
}));

// Routes
app.use('/api/products', productRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/brands', brandRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/banners', bannerRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/shipping', shippingRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/tickers', tickerRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/upload', uploadRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Middleware centralizado de erros ──
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  if (err.message === 'Bloqueado pelo CORS') {
    return res.status(403).json({ error: 'Origem não permitida' });
  }
  res.status(err.status || 500).json({ error: err.message || 'Erro interno do servidor' });
});

async function startServer() {
  try {
    await initDatabase();
    app.listen(PORT, () => {
      console.log(`MJ Sneakers API running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
