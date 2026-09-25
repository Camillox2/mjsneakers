const express = require('express');
const router = express.Router();
const { turnstileSiteKey } = require('../middleware/turnstile');
const { CSRF_COOKIE, cookiesOf, newCsrfToken, setCsrfCookie } = require('../utils/cookies');

// Cookie pz_csrf criado aqui (quando ainda não existe) vale 30 dias.
const CSRF_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// Público: chave do captcha e o token de CSRF (plano B quando a página não
// consegue ler o cookie pz_csrf). Grava o cookie se ele ainda não existe.
router.get('/config', (req, res) => {
  let csrfToken = cookiesOf(req)[CSRF_COOKIE];
  if (!csrfToken || !/^[0-9a-f]{48}$/.test(csrfToken)) csrfToken = setCsrfCookie(res, newCsrfToken(), CSRF_MAX_AGE_MS);
  res.set('Cache-Control', 'no-store');
  res.json({ turnstile_site_key: turnstileSiteKey(), csrf_token: csrfToken });
});

module.exports = router;
