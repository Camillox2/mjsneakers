const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const authController = require('../controllers/authController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

// Rate limit: max 10 login attempts per 15 min per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/login', loginLimiter, authController.login);
router.get('/verify', authMiddleware, authController.verifyToken);
router.get('/admins', authMiddleware, adminMiddleware, authController.listAdmins);
router.post('/admins', authMiddleware, adminMiddleware, authController.createAdmin);
router.put('/admins/:id/toggle', authMiddleware, adminMiddleware, authController.toggleAdmin);
router.put('/change-password', authMiddleware, authController.changePassword);

module.exports = router;
