const express = require('express');
const { param } = require('express-validator');
const router = express.Router();
const categoryController = require('../controllers/categoryController');
const { requireAdmin, adminWhenAll } = require('../middleware/auth');
const { validateRequest } = require('../utils/validate');

const idParam = param('id').isInt({ min: 1 }).withMessage('id deve ser um inteiro positivo').toInt();

router.get('/', ...adminWhenAll, categoryController.getAll);
router.post('/', ...requireAdmin, categoryController.create);
router.put('/:id', ...requireAdmin, idParam, validateRequest, categoryController.update);
router.delete('/:id', ...requireAdmin, idParam, validateRequest, categoryController.delete);

module.exports = router;
