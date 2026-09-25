const express = require('express');
const router = express.Router();
const lc = require('../controllers/loyaltyController');
const { requireAdmin, optionalAuth } = require('../middleware/auth');
const { requireOrderProof } = require('../middleware/customerProof');

// Cliente: ?order_id= de um pedido feito com o e-mail (ou token de admin)
router.get('/balance/:email', optionalAuth, ...requireOrderProof, lc.getBalance);
router.get('/history/:email', optionalAuth, ...requireOrderProof, lc.getHistory);
// Admin
router.post('/redeem', ...requireAdmin, lc.redeem);
router.get('/', ...requireAdmin, lc.getAll);
router.post('/bonus', ...requireAdmin, lc.addBonus);

module.exports = router;
