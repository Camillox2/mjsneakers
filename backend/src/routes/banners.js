const express = require('express');
const { param } = require('express-validator');
const router = express.Router();
const bannerController = require('../controllers/bannerController');
const { requireAdmin } = require('../middleware/auth');
const { validateRequest } = require('../utils/validate');

const idParam = param('id').isInt({ min: 1 }).withMessage('id deve ser um inteiro positivo').toInt();

router.get('/', bannerController.getActive);
router.get('/all', ...requireAdmin, bannerController.getAll);
router.post('/', ...requireAdmin, bannerController.create);
router.put('/:id', ...requireAdmin, idParam, validateRequest, bannerController.update);
router.delete('/:id', ...requireAdmin, idParam, validateRequest, bannerController.delete);

module.exports = router;
