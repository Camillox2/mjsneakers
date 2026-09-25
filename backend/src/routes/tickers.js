const express = require('express');
const { param } = require('express-validator');
const router = express.Router();
const tickerController = require('../controllers/tickerController');
const { requireAdmin } = require('../middleware/auth');
const { validateRequest } = require('../utils/validate');

const idParam = param('id').isInt({ min: 1 }).withMessage('id deve ser um inteiro positivo').toInt();

router.get('/', tickerController.getActive);
router.get('/all', ...requireAdmin, tickerController.getAll);
router.post('/', ...requireAdmin, tickerController.create);
router.put('/:id', ...requireAdmin, idParam, validateRequest, tickerController.update);
router.delete('/:id', ...requireAdmin, idParam, validateRequest, tickerController.delete);

module.exports = router;
