const express = require('express');
const router = express.Router();
const { auditController } = require('../controllers/auditController');
const { requireAdmin } = require('../middleware/auth');

router.get('/', ...requireAdmin, auditController.getAll);
router.get('/facets', ...requireAdmin, auditController.facets);

module.exports = router;
