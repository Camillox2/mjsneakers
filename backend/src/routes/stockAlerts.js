const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const stockAlertController = require('../controllers/stockAlertController');
const { requireAdmin } = require('../middleware/auth');

// Rate limit: max 10 avisos por 15 min por IP
const subscribeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Muitos avisos seguidos. Tente novamente em alguns minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/subscribe', subscribeLimiter, stockAlertController.subscribe);
router.get('/', ...requireAdmin, stockAlertController.getAll);

module.exports = router;
