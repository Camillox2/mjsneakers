const express = require('express');
const router = express.Router();
const couponController = require('../controllers/couponController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

// Public: validate coupon
router.post('/validate', couponController.validate);

// Admin routes
router.get('/', authMiddleware, adminMiddleware, couponController.getAll);
router.post('/', authMiddleware, adminMiddleware, couponController.create);
router.put('/:id', authMiddleware, adminMiddleware, couponController.update);
router.delete('/:id', authMiddleware, adminMiddleware, couponController.delete);

module.exports = router;
