const express = require('express');
const rateLimit = require('express-rate-limit');
const { param } = require('express-validator');
const router = express.Router();
const newsletterController = require('../controllers/newsletterController');
const { requireAdmin } = require('../middleware/auth');
const { validateRequest } = require('../utils/validate');
const { verifyTurnstile } = require('../middleware/turnstile');

// Rate limit: inscrição e descadastro públicos.
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Muitas tentativas. Tente novamente em alguns minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/subscribe', publicLimiter, verifyTurnstile, newsletterController.subscribe);
router.post('/unsubscribe', publicLimiter, newsletterController.unsubscribe);
router.get('/', ...requireAdmin, newsletterController.getAll);
router.delete(
  '/:id',
  ...requireAdmin,
  param('id').isInt({ min: 1 }).withMessage('id deve ser um inteiro positivo').toInt(),
  validateRequest,
  newsletterController.remove
);

module.exports = router;
