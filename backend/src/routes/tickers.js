const express = require('express');
const router = express.Router();
const tickerController = require('../controllers/tickerController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

router.get('/', tickerController.getActive);
router.get('/all', authMiddleware, adminMiddleware, tickerController.getAll);
router.post('/', authMiddleware, adminMiddleware, tickerController.create);
router.put('/:id', authMiddleware, adminMiddleware, tickerController.update);
router.delete('/:id', authMiddleware, adminMiddleware, tickerController.delete);

module.exports = router;
