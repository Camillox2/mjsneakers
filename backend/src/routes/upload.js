const express = require('express');
const router = express.Router();
const uploadController = require('../controllers/uploadController');
const { requireAdmin } = require('../middleware/auth');

router.post('/single', ...requireAdmin, ...uploadController.single);
router.post('/multiple', ...requireAdmin, ...uploadController.multiple);

module.exports = router;
