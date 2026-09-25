const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const chatController = require('../controllers/chatController');
const liveChatController = require('../controllers/liveChatController');
const { requireAdmin } = require('../middleware/auth');

// Rate limit: cada mensagem custa uma chamada de IA. Max 20 por 10 min por IP.
const chatLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: { error: 'Muitas mensagens seguidas. Espere alguns minutos e tente de novo.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Público: chatbot de IA
router.post('/', chatLimiter, chatController.sendMessage);

// Admin: conversas do chat ao vivo
router.get('/sessions', ...requireAdmin, liveChatController.listSessions);
router.get('/sessions/:sessionId/messages', ...requireAdmin, liveChatController.listMessages);
router.post('/sessions/:sessionId/close', ...requireAdmin, liveChatController.closeSession);

module.exports = router;
