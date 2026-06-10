const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

// Rate limit: max 5 reviews per 15 min per IP
const reviewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Muitas avaliações enviadas. Tente novamente em alguns minutos.' },
});

// Public routes
router.get('/product/:productId', reviewController.getByProduct);
router.get('/my', reviewController.getMyReviews);
router.post('/', reviewLimiter, reviewController.create);

// Admin routes
router.get('/', authMiddleware, adminMiddleware, reviewController.getAll);
router.put('/:id/status', authMiddleware, adminMiddleware, reviewController.updateStatus);
router.delete('/:id', authMiddleware, adminMiddleware, reviewController.delete);

module.exports = router;
