const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const authController = require('../controllers/authController');
const { authMiddleware, requireAdmin } = require('../middleware/auth');

// Rate limit: max 10 login attempts per 15 min per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Troca de senha também tenta senha: mesmo teto, por IP.
const passwordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Muitas tentativas. Tente novamente em 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/login', loginLimiter, authController.login);
router.get('/verify', authMiddleware, authController.verifyToken);
router.get('/admins', ...requireAdmin, authController.listAdmins);
router.post('/admins', ...requireAdmin, authController.createAdmin);
router.put('/admins/:id/toggle', ...requireAdmin, authController.toggleAdmin);
router.put('/change-password', passwordLimiter, authMiddleware, authController.changePassword);

module.exports = router;
