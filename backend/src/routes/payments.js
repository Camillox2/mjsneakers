const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { requireAdmin, requireSuperAdmin, twoFactorMiddleware } = require('../middleware/auth');

const limiter = (windowMs, max, error) => rateLimit({
  windowMs,
  max,
  message: { error },
  standardHeaders: true,
  legacyHeaders: false,
});

// Gerar Pix e pagar com cartão: 20 tentativas por 10 min por IP.
const payLimiter = limiter(10 * 60 * 1000, 20, 'Muitas tentativas de pagamento. Aguarde alguns minutos.');
// Polling da loja (a cada 4s): 60 por minuto por IP.
const pollLimiter = limiter(60 * 1000, 60, 'Muitas consultas. Aguarde um instante.');

// Público
router.get('/config', paymentController.config);
router.post('/pix', payLimiter, paymentController.pix);
router.post('/card', payLimiter, paymentController.card);
router.get('/order/:orderId', pollLimiter, paymentController.orderStatus);
router.post('/webhook', paymentController.webhook);

// Admin
router.get('/admin/config', ...requireAdmin, paymentController.adminConfig);
router.post('/order/:orderId/sync', ...requireAdmin, paymentController.sync);
// Estorno devolve dinheiro: só super_admin, com 2FA ligado.
router.post('/:paymentId/refund', ...requireSuperAdmin, twoFactorMiddleware, paymentController.refund);

module.exports = router;
