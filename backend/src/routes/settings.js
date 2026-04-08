const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

router.get('/', settingsController.getAll);
router.get('/:key', settingsController.get);
router.put('/', authMiddleware, adminMiddleware, settingsController.upsert);

module.exports = router;
