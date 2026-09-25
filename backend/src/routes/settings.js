const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { requireAdmin } = require('../middleware/auth');

router.get('/', settingsController.getAll);
router.get('/admin', ...requireAdmin, settingsController.getAdmin);
router.get('/:key', settingsController.get);
router.put('/', ...requireAdmin, settingsController.upsert);

module.exports = router;
