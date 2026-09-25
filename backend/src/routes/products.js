const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { requireAdmin } = require('../middleware/auth');

router.get('/', productController.getAll);
router.get('/featured', productController.getFeatured);
router.get('/recent', productController.getRecent);
router.get('/bestsellers', productController.getBestSellers);
// Admin (antes de '/:id' para não cair na rota pública)
router.get('/admin', ...requireAdmin, productController.adminList);
router.get('/admin/:id', ...requireAdmin, productController.adminGet);
router.get('/slug/:slug', productController.getBySlug);
router.get('/:id/related', productController.getRelated);
router.get('/:id', productController.getById);
router.post('/', ...requireAdmin, productController.create);
router.post('/bulk', ...requireAdmin, productController.bulkAction);
router.post('/:id/clone', ...requireAdmin, productController.clone);
router.patch('/:id/active', ...requireAdmin, productController.setActive);
router.put('/:id/inline', ...requireAdmin, productController.updateInline);
router.put('/:id', ...requireAdmin, productController.update);
router.delete('/:id', ...requireAdmin, productController.delete);

module.exports = router;
