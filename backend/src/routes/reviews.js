const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const { requireAdmin, optionalAuth } = require('../middleware/auth');
const { requireOrderProof } = require('../middleware/customerProof');

// Rate limit: max 5 reviews per 15 min per IP
const reviewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Muitas avaliações enviadas. Tente novamente em alguns minutos.' },
});

// Public routes
router.get('/product/:productId', reviewController.getByProduct);
// ?email=&order_id= de um pedido feito com esse e-mail (ou token de admin)
router.get('/my', optionalAuth, ...requireOrderProof, reviewController.getMyReviews);
router.post('/', reviewLimiter, reviewController.create);

// Admin routes
router.get('/', ...requireAdmin, reviewController.getAll);
router.put('/:id/status', ...requireAdmin, reviewController.updateStatus);
router.delete('/:id', ...requireAdmin, reviewController.delete);

module.exports = router;
