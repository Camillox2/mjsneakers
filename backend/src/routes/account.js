const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const accountController = require('../controllers/accountController');
const { requireCustomer } = require('../middleware/customerAuth');
const { verifyTurnstile } = require('../middleware/turnstile');

const limiter = (max, error) => rateLimit({
  windowMs: 15 * 60 * 1000,
  max,
  message: { error },
  standardHeaders: true,
  legacyHeaders: false,
});
// Pedir código: 10 por 15 min por IP (e 3 por e-mail, no controller).
const codeLimiter = limiter(10, 'Muitos códigos pedidos desta conexão. Tente novamente em alguns minutos.');
// Conferir código: 20 por 15 min por IP (e 5 tentativas por código).
const verifyLimiter = limiter(20, 'Muitas tentativas. Tente novamente em alguns minutos.');

// Entrar sem senha, por código no e-mail
router.post('/code', codeLimiter, verifyTurnstile, accountController.requestCode);
router.post('/verify', verifyLimiter, accountController.verify);
router.post('/logout', accountController.logout);

// Conta (cookie pz_cli; POST/PUT exigem X-CSRF-Token)
router.get('/me', requireCustomer, accountController.me);
router.put('/profile', requireCustomer, accountController.updateProfile);
router.get('/orders', requireCustomer, accountController.orders);
router.get('/orders/:id', requireCustomer, accountController.orderDetail);
router.get('/points', requireCustomer, accountController.points);
router.get('/wishlist', requireCustomer, accountController.getWishlist);
router.put('/wishlist', requireCustomer, accountController.putWishlist);
router.get('/export', requireCustomer, accountController.exportData);
router.post('/delete', verifyLimiter, requireCustomer, accountController.deleteAccount);

module.exports = router;
