const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, param } = require('express-validator');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { requireAdmin } = require('../middleware/auth');
const { validateRequest } = require('../utils/validate');
const { VALID_UFS } = require('../controllers/shippingController');

// Rate limit: max 5 orders per 15 min per IP
const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Muitas tentativas. Tente novamente em alguns minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limit do rastreio: evita varrer pedidos por número e e-mail.
const trackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: 'Muitas consultas. Tente novamente em alguns minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const idParam = param('id').isInt({ min: 1 }).withMessage('id deve ser um inteiro positivo').toInt();
const text = (field, max, label) => body(field).isString().withMessage(`${label} é obrigatório`)
  .trim().notEmpty().withMessage(`${label} é obrigatório`)
  .isLength({ max }).withMessage(`${label} deve ter no máximo ${max} caracteres`);

// Public. price, discount_amount, shipping_price e total do corpo são
// ignorados: o servidor calcula tudo (ver orderController.create).
router.post(
  '/',
  checkoutLimiter,
  text('customer_name', 255, 'customer_name'),
  body('customer_email').isString().trim().isEmail().withMessage('customer_email inválido')
    .isLength({ max: 255 }).withMessage('customer_email muito longo'),
  text('customer_phone', 50, 'customer_phone'),
  body('session_id').optional({ nullable: true, checkFalsy: true }).isString().trim().isLength({ max: 100 }),
  body('items').isArray({ min: 1, max: 50 }).withMessage('items deve ser um array com 1 a 50 itens'),
  body('items.*.product_id').isInt({ min: 1 }).withMessage('product_id deve ser um inteiro positivo').toInt(),
  body('items.*.size').isString().trim().notEmpty().withMessage('size é obrigatório').isLength({ max: 10 }),
  body('items.*.quantity').isInt({ min: 1, max: 50 }).withMessage('quantity deve ficar entre 1 e 50').toInt(),
  body('coupon_code').optional({ nullable: true, checkFalsy: true }).isString().trim().isLength({ max: 50 }),
  body('shipping_rule_id').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1 })
    .withMessage('shipping_rule_id deve ser um inteiro positivo').toInt(),
  body('shipping_type').optional({ nullable: true }).isString().trim().isLength({ max: 50 }),
  body('gift_wrap').optional().isBoolean().withMessage('gift_wrap deve ser booleano').toBoolean(),
  body('gift_message').optional({ nullable: true }).isString().trim().isLength({ max: 2000 })
    .withMessage('gift_message deve ter no máximo 2000 caracteres'),
  body('address_cep').customSanitizer((value) => String(value ?? '').replace(/\D/g, ''))
    .matches(/^\d{8}$/).withMessage('CEP deve ter 8 dígitos'),
  text('address_street', 255, 'address_street'),
  text('address_number', 20, 'address_number'),
  body('address_complement').optional({ nullable: true }).isString().trim().isLength({ max: 100 }),
  text('address_neighborhood', 100, 'address_neighborhood'),
  text('address_city', 100, 'address_city'),
  body('address_state').isString().trim().toUpperCase().custom((uf) => VALID_UFS.has(uf))
    .withMessage('address_state deve ser uma UF válida'),
  validateRequest,
  orderController.create
);
router.get('/track', trackLimiter, orderController.track);

// Admin
router.get('/export/csv', ...requireAdmin, orderController.exportCsv);
router.get('/status-counts', ...requireAdmin, orderController.statusCounts);
router.get('/', ...requireAdmin, orderController.getAll);
router.get('/:id', ...requireAdmin, idParam, validateRequest, orderController.getById);
router.put('/:id/status', ...requireAdmin, idParam, validateRequest, orderController.updateStatus);
router.put(
  '/:id/tracking',
  ...requireAdmin,
  idParam,
  body('tracking_code').isString().trim().notEmpty().withMessage('tracking_code é obrigatório')
    .isLength({ max: 100 }).withMessage('tracking_code deve ter no máximo 100 caracteres'),
  validateRequest,
  orderController.updateTracking
);
router.post('/:id/notes', ...requireAdmin, idParam, validateRequest, orderController.addNote);
router.delete('/:id', ...requireAdmin, idParam, validateRequest, orderController.delete);

module.exports = router;
