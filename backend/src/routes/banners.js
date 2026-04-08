const express = require('express');
const router = express.Router();
const bannerController = require('../controllers/bannerController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

router.get('/', bannerController.getActive);
router.get('/all', authMiddleware, adminMiddleware, bannerController.getAll);
router.post('/', authMiddleware, adminMiddleware, bannerController.create);
router.put('/:id', authMiddleware, adminMiddleware, bannerController.update);
router.delete('/:id', authMiddleware, adminMiddleware, bannerController.delete);

module.exports = router;
