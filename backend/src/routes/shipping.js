const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { shippingController } = require('../controllers/shippingController');
const { requireAdmin, adminWhenAll } = require('../middleware/auth');

const router = express.Router();

const VALID_STATES = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]);

function validateRequest(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Dados inválidos',
      details: errors.array().map(({ path, msg }) => ({ field: path, message: msg })),
    });
  }
  next();
}

function normalizeCep(value) {
  return String(value ?? '').replace(/[-\s]/g, '');
}

function zoneValidations(includeActive = false) {
  const validations = [
    body('name').isString().trim().notEmpty().withMessage('name é obrigatório')
      .isLength({ max: 100 }).withMessage('name deve ter no máximo 100 caracteres'),
    body('states').isArray({ min: 1 }).withMessage('states deve ser um array não vazio')
      .customSanitizer((states) => Array.isArray(states)
        ? states.map((state) => String(state).trim().toUpperCase())
        : states)
      .custom((states) => {
        if (!states.every((state) => VALID_STATES.has(state))) {
          throw new Error('states contém uma UF inválida');
        }
        if (new Set(states).size !== states.length) throw new Error('states contém UFs duplicadas');
        return true;
      }),
  ];
  if (includeActive) {
    validations.push(body('active').optional().isBoolean().withMessage('active deve ser booleano').toBoolean());
  }
  return validations;
}

function ruleValidations(includeActive = false) {
  const validations = [
    body('zone_id').optional({ nullable: true }).isInt({ min: 1 })
      .withMessage('zone_id deve ser um inteiro positivo').toInt(),
    body('name').isString().trim().notEmpty().withMessage('name é obrigatório')
      .isLength({ max: 100 }).withMessage('name deve ter no máximo 100 caracteres'),
    body('type').isIn(['fixed', 'free', 'by_weight'])
      .withMessage('type deve ser fixed, free ou by_weight'),
    body('price').optional({ nullable: true }).isFloat({ min: 0 })
      .withMessage('price deve ser maior ou igual a zero').toFloat(),
    body('free_above').optional({ nullable: true }).isFloat({ min: 0 })
      .withMessage('free_above deve ser maior ou igual a zero').toFloat(),
    body('estimated_days_min').optional().isInt({ min: 0 })
      .withMessage('estimated_days_min deve ser um inteiro não negativo').toInt(),
    body('estimated_days_max').optional().isInt({ min: 0 })
      .withMessage('estimated_days_max deve ser um inteiro não negativo').toInt(),
    body('max_weight_g').optional({ nullable: true }).isInt({ min: 1 })
      .withMessage('max_weight_g deve ser um inteiro positivo').toInt(),
    body('sort_order').optional().isInt().withMessage('sort_order deve ser um inteiro').toInt(),
    body().custom((payload) => {
      if (['fixed', 'by_weight'].includes(payload.type)
          && (payload.price === undefined || payload.price === null || Number(payload.price) < 0)) {
        throw new Error('price é obrigatório para regras fixed e by_weight');
      }
      if (payload.type === 'free'
          && (payload.free_above === undefined || payload.free_above === null || Number(payload.free_above) < 0)) {
        throw new Error('free_above é obrigatório para regras free');
      }
      const minimum = payload.estimated_days_min ?? 3;
      const maximum = payload.estimated_days_max ?? 10;
      if (Number(minimum) > Number(maximum)) {
        throw new Error('estimated_days_min deve ser menor ou igual a estimated_days_max');
      }
      return true;
    }),
  ];
  if (includeActive) {
    validations.push(body('active').optional().isBoolean().withMessage('active deve ser booleano').toBoolean());
  }
  return validations;
}

const idParam = (name) => param(name).isInt({ min: 1 })
  .withMessage(`${name} deve ser um inteiro positivo`).toInt();

router.get('/zones', ...adminWhenAll, shippingController.getZones);
router.post('/zones', ...requireAdmin, ...zoneValidations(true), validateRequest, shippingController.createZone);
router.put('/zones/:id', ...requireAdmin, idParam('id'), ...zoneValidations(true), validateRequest, shippingController.updateZone);
router.delete('/zones/:id', ...requireAdmin, idParam('id'), validateRequest, shippingController.deleteZone);

router.get(
  '/rules',
  ...adminWhenAll,
  query('zone_id').optional().isInt({ min: 1 }).withMessage('zone_id deve ser um inteiro positivo').toInt(),
  validateRequest,
  shippingController.getRules
);
router.post('/rules', ...requireAdmin, ...ruleValidations(), validateRequest, shippingController.createRule);
router.put('/rules/:id', ...requireAdmin, idParam('id'), ...ruleValidations(true), validateRequest, shippingController.updateRule);
router.delete('/rules/:id', ...requireAdmin, idParam('id'), validateRequest, shippingController.deleteRule);

router.post(
  '/calculate',
  body('cep').customSanitizer(normalizeCep).matches(/^\d{8}$/).withMessage('CEP deve ter exatamente 8 dígitos'),
  body('items').isArray({ min: 1, max: 50 }).withMessage('items deve ser um array com 1 a 50 itens'),
  body('items.*.product_id').isInt({ min: 1 }).withMessage('product_id deve ser um inteiro positivo').toInt(),
  body('items.*.quantity').isInt({ min: 1, max: 50 }).withMessage('quantity deve ficar entre 1 e 50').toInt(),
  body('order_total').isFloat({ min: 0 }).withMessage('order_total deve ser um número maior ou igual a zero').toFloat(),
  validateRequest,
  shippingController.calculate
);

router.get(
  '/estimate',
  query('product_id').isInt({ min: 1 }).withMessage('product_id deve ser um inteiro positivo').toInt(),
  query('cep').customSanitizer(normalizeCep).matches(/^\d{8}$/).withMessage('CEP deve ter exatamente 8 dígitos'),
  validateRequest,
  shippingController.estimate
);

router.post(
  '/label/:orderId/generate',
  ...requireAdmin,
  idParam('orderId'),
  validateRequest,
  shippingController.generateLabel
);
router.get('/label/:orderId', ...requireAdmin, idParam('orderId'), validateRequest, shippingController.getLabel);

router.post(
  '/whatsapp/:orderId',
  ...requireAdmin,
  idParam('orderId'),
  validateRequest,
  shippingController.createWhatsApp
);
router.get('/whatsapp', ...requireAdmin, shippingController.getWhatsApp);
router.put(
  '/whatsapp/:id/sent',
  ...requireAdmin,
  idParam('id'),
  validateRequest,
  shippingController.markWhatsAppSent
);

module.exports = router;
