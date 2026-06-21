const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, param, validationResult } = require('express-validator');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

function validateRequest(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Dados inválidos', details: errors.array() });
  }
  next();
}

// Rate limit: max 5 orders per 15 min per IP
const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Muitas tentativas. Tente novamente em alguns minutos.' },
});

// Public
router.post(
  '/',
  checkoutLimiter,
  body('customer_name').isString().trim().notEmpty().withMessage('customer_name é obrigatório'),
  body('customer_phone').isString().trim().notEmpty().withMessage('customer_phone é obrigatório'),
  body('session_id').optional({ nullable: true, checkFalsy: true }).isString().trim().isLength({ max: 100 }),
  body('items').isArray({ min: 1 }).withMessage('items deve ser um array não vazio'),
  body('items.*.product_id').isInt({ min: 1 }).withMessage('product_id deve ser um inteiro positivo').toInt(),
  body('items.*.size').isString().trim().notEmpty().withMessage('size é obrigatório').isLength({ max: 10 }),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('quantity deve ser maior ou igual a 1').toInt(),
  body('items.*.price').isFloat({ min: 0 }).withMessage('price deve ser maior ou igual a zero').toFloat(),
  body('shipping_price').optional().isFloat({ min: 0 }).withMessage('shipping_price deve ser maior ou igual a zero').toFloat(),
  body('shipping_rule_id').optional({ nullable: true }).isInt({ min: 1 }).withMessage('shipping_rule_id deve ser um inteiro positivo').toInt(),
  body('gift_wrap').optional().isBoolean().withMessage('gift_wrap deve ser booleano').toBoolean(),
  body('gift_message').optional({ nullable: true }).isString().trim().isLength({ max: 2000 })
    .withMessage('gift_message deve ter no máximo 2000 caracteres'),
  validateRequest,
  orderController.create
);
router.get('/track', orderController.track);

// Admin
router.get('/export/csv', authMiddleware, adminMiddleware, orderController.exportCsv);
router.get('/', authMiddleware, adminMiddleware, orderController.getAll);
router.get('/:id', authMiddleware, adminMiddleware, orderController.getById);
router.put('/:id/status', authMiddleware, adminMiddleware, orderController.updateStatus);
router.put(
  '/:id/tracking',
  authMiddleware,
  adminMiddleware,
  param('id').isInt({ min: 1 }).withMessage('id deve ser um inteiro positivo').toInt(),
  body('tracking_code').isString().trim().notEmpty().withMessage('tracking_code é obrigatório')
    .isLength({ max: 100 }).withMessage('tracking_code deve ter no máximo 100 caracteres'),
  validateRequest,
  orderController.updateTracking
);
router.post('/:id/notes', authMiddleware, adminMiddleware, orderController.addNote);
router.delete('/:id', authMiddleware, adminMiddleware, orderController.delete);

module.exports = router;
