const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

// Public routes
router.get('/product/:productId', reviewController.getByProduct);
router.get('/my', reviewController.getMyReviews);
router.post('/', reviewController.create);

// Admin routes
router.get('/', authMiddleware, adminMiddleware, reviewController.getAll);
router.put('/:id/status', authMiddleware, adminMiddleware, reviewController.updateStatus);
router.delete('/:id', authMiddleware, adminMiddleware, reviewController.delete);

module.exports = router;
