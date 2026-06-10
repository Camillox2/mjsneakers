const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

router.get('/', authMiddleware, adminMiddleware, customerController.getAll);
router.get('/:email', authMiddleware, adminMiddleware, customerController.getByEmail);

module.exports = router;
