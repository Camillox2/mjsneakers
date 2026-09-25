const express = require('express');
const { param } = require('express-validator');
const router = express.Router();
const brandController = require('../controllers/brandController');
const { requireAdmin } = require('../middleware/auth');
const { validateRequest } = require('../utils/validate');

const idParam = param('id').isInt({ min: 1 }).withMessage('id deve ser um inteiro positivo').toInt();

router.get('/', brandController.getAll);
router.post('/', ...requireAdmin, brandController.create);
router.put('/:id', ...requireAdmin, idParam, validateRequest, brandController.update);
router.delete('/:id', ...requireAdmin, idParam, validateRequest, brandController.delete);

module.exports = router;
