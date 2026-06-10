const express = require('express');
const router = express.Router();
const newsletterController = require('../controllers/newsletterController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

router.post('/subscribe', newsletterController.subscribe);
router.post('/unsubscribe', newsletterController.unsubscribe);
router.get('/', authMiddleware, adminMiddleware, newsletterController.getAll);

module.exports = router;
