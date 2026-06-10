const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

router.get('/', categoryController.getAll);
router.post('/', authMiddleware, adminMiddleware, categoryController.create);
router.put('/:id', authMiddleware, adminMiddleware, categoryController.update);
router.delete('/:id', authMiddleware, adminMiddleware, categoryController.delete);

module.exports = router;
