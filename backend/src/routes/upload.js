const express = require('express');
const router = express.Router();
const uploadController = require('../controllers/uploadController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

router.post('/single', authMiddleware, adminMiddleware, ...uploadController.single);
router.post('/multiple', authMiddleware, adminMiddleware, ...uploadController.multiple);

module.exports = router;
