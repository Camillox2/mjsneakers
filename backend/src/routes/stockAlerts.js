const express = require('express');
const router = express.Router();
const stockAlertController = require('../controllers/stockAlertController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

router.post('/subscribe', stockAlertController.subscribe);
router.get('/', authMiddleware, adminMiddleware, stockAlertController.getAll);

module.exports = router;
