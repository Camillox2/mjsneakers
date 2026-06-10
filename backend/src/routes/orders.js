const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

// Rate limit: max 5 orders per 15 min per IP
const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Muitas tentativas. Tente novamente em alguns minutos.' },
});

// Public: create order (checkout)
router.post('/', checkoutLimiter, orderController.create);

// Admin routes
router.get('/', authMiddleware, adminMiddleware, orderController.getAll);
router.get('/:id', authMiddleware, adminMiddleware, orderController.getById);
router.put('/:id/status', authMiddleware, adminMiddleware, orderController.updateStatus);
router.delete('/:id', authMiddleware, adminMiddleware, orderController.delete);

module.exports = router;
