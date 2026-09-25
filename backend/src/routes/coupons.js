const express = require('express');
const rateLimit = require('express-rate-limit');
const { param } = require('express-validator');
const router = express.Router();
const couponController = require('../controllers/couponController');
const { requireAdmin } = require('../middleware/auth');
const { validateRequest } = require('../utils/validate');

// Rate limit: evita testar códigos em série.
const validateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Muitas tentativas de cupom. Tente novamente em alguns minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const idParam = param('id').isInt({ min: 1 }).withMessage('id deve ser um inteiro positivo').toInt();

// Public: validate coupon
router.post('/validate', validateLimiter, couponController.validate);

// Admin routes
router.get('/', ...requireAdmin, couponController.getAll);
router.post('/', ...requireAdmin, couponController.create);
router.put('/:id', ...requireAdmin, idParam, validateRequest, couponController.update);
router.delete('/:id', ...requireAdmin, idParam, validateRequest, couponController.delete);

module.exports = router;
