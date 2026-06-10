const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

router.get('/', productController.getAll);
router.get('/featured', productController.getFeatured);
router.get('/recent', productController.getRecent);
router.get('/bestsellers', productController.getBestSellers);
router.get('/slug/:slug', productController.getBySlug);
router.get('/:id/related', productController.getRelated);
router.get('/:id', productController.getById);
router.post('/', authMiddleware, adminMiddleware, productController.create);
router.post('/bulk', authMiddleware, adminMiddleware, productController.bulkAction);
router.post('/:id/clone', authMiddleware, adminMiddleware, productController.clone);
router.put('/:id/inline', authMiddleware, adminMiddleware, productController.updateInline);
router.put('/:id', authMiddleware, adminMiddleware, productController.update);
router.delete('/:id', authMiddleware, adminMiddleware, productController.delete);

module.exports = router;
