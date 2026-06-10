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

// Public
router.post('/', checkoutLimiter, orderController.create);
router.get('/track', orderController.track);

// Admin
router.get('/export/csv', authMiddleware, adminMiddleware, orderController.exportCsv);
router.get('/', authMiddleware, adminMiddleware, orderController.getAll);
router.get('/:id', authMiddleware, adminMiddleware, orderController.getById);
router.put('/:id/status', authMiddleware, adminMiddleware, orderController.updateStatus);
router.put('/:id/tracking', authMiddleware, adminMiddleware, orderController.updateTracking);
router.post('/:id/notes', authMiddleware, adminMiddleware, orderController.addNote);
router.delete('/:id', authMiddleware, adminMiddleware, orderController.delete);

module.exports = router;
