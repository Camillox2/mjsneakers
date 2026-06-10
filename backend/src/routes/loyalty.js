const express = require('express');
const router = express.Router();
const lc = require('../controllers/loyaltyController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

router.get('/balance/:email', lc.getBalance);
router.get('/history/:email', lc.getHistory);
router.post('/redeem', lc.redeem);
router.get('/', authMiddleware, adminMiddleware, lc.getAll);
router.post('/bonus', authMiddleware, adminMiddleware, lc.addBonus);

module.exports = router;
