const express = require('express');
const rateLimit = require('express-rate-limit');
const { recordError } = require('../utils/errorLog');

const router = express.Router();

// Erros que acontecem no navegador de quem visita a loja ou usa o painel.
// Público (não tem login), então: limite por IP, corpo pequeno e só texto.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitos relatórios de erro. Tente mais tarde.' },
});

const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

router.post('/', limiter, (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  if (JSON.stringify(body).length > 10000) return res.status(413).json({ error: 'Relatório grande demais' });

  const message = text(body.message, 500).trim();
  if (!message) return res.status(400).json({ error: 'message é obrigatório' });

  const release = text(body.release, 40);
  const agent = text(body.user_agent, 200);
  const stack = [release && `versão: ${release}`, agent && `navegador: ${agent}`, text(body.stack, 4000)].filter(Boolean).join('\n');

  // não espera gravar: o navegador não precisa saber do resultado
  recordError({ source: 'frontend', message, stack, path: text(body.path, 300) });
  res.status(204).end();
});

module.exports = router;
