const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const { requireAdmin } = require('../middleware/auth');

router.get('/', ...requireAdmin, customerController.getAll);
router.get('/:email', ...requireAdmin, customerController.getByEmail);

module.exports = router;
