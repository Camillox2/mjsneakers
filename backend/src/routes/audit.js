const express = require('express');
const router = express.Router();
const { auditController } = require('../controllers/auditController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

router.get('/', authMiddleware, adminMiddleware, auditController.getAll);

module.exports = router;
