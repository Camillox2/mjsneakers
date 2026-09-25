const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { privacyController } = require('../controllers/privacyController');
const { requireAdmin, twoFactorMiddleware } = require('../middleware/auth');
const { verifyTurnstile } = require('../middleware/turnstile');

const limiter = (max, error) => rateLimit({
  windowMs: 15 * 60 * 1000,
  max,
  message: { error },
  standardHeaders: true,
  legacyHeaders: false,
});
// Abrir pedido: 5 por 15 min por IP (e 3 por e-mail, no controller).
const createLimiter = limiter(5, 'Muitos pedidos desta conexão. Tente novamente em alguns minutos.');
// Conferir código: 20 por 15 min por IP (e 5 tentativas por pedido).
const verifyLimiter = limiter(20, 'Muitas tentativas. Tente novamente em alguns minutos.');

// Titular (público)
router.post('/requests', createLimiter, verifyTurnstile, privacyController.create);
router.post('/requests/:id/verify', verifyLimiter, privacyController.verify);

// Equipe
router.get('/requests', ...requireAdmin, privacyController.list);
router.put('/requests/:id', ...requireAdmin, privacyController.update);
router.get('/requests/:id/export', ...requireAdmin, twoFactorMiddleware, privacyController.exportData);
router.post('/requests/:id/anonymize', ...requireAdmin, twoFactorMiddleware, privacyController.anonymize);

module.exports = router;
