const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const authController = require('../controllers/authController');
const { authMiddleware, requireAdmin } = require('../middleware/auth');
const { verifyTurnstile } = require('../middleware/turnstile');

const limiter = (max, error) => rateLimit({
  windowMs: 15 * 60 * 1000,
  max,
  message: { error },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limit: max 10 login attempts per 15 min per IP
const loginLimiter = limiter(10, 'Muitas tentativas de login. Tente novamente em 15 minutos.');
// Segundo passo do login (código de 6 dígitos): 20 por 15 min por IP.
const mfaLimiter = limiter(20, 'Muitas tentativas de código. Tente novamente em 15 minutos.');
// Troca de senha e 2FA também tentam senha ou código: mesmo teto.
const sensitiveLimiter = limiter(10, 'Muitas tentativas. Tente novamente em 15 minutos.');

router.post('/login', loginLimiter, verifyTurnstile, authController.login);
router.post('/login/mfa', mfaLimiter, authController.loginMfa);
router.post('/logout', authController.logout);
router.post('/logout-all', authMiddleware, authController.logoutAll);
router.get('/me', authMiddleware, authController.me);
router.get('/verify', authMiddleware, authController.verifyToken);

// Verificação em duas etapas (TOTP) de quem está logado.
router.post('/2fa/setup', authMiddleware, authController.setup2fa);
router.post('/2fa/enable', sensitiveLimiter, authMiddleware, authController.enable2fa);
router.post('/2fa/disable', sensitiveLimiter, authMiddleware, authController.disable2fa);
router.post('/2fa/recovery-codes', sensitiveLimiter, authMiddleware, authController.recoveryCodes);

router.get('/admins', ...requireAdmin, authController.listAdmins);
router.post('/admins', ...requireAdmin, authController.createAdmin);
router.put('/admins/:id/toggle', ...requireAdmin, authController.toggleAdmin);
router.put('/change-password', sensitiveLimiter, authMiddleware, authController.changePassword);

module.exports = router;
