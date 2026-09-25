// Cloudflare Turnstile (captcha). Sem TURNSTILE_SECRET, fica desligado e
// tudo passa. Ligado, o token vem no header X-Turnstile-Token (ou no corpo,
// turnstile_token) e é conferido na Cloudflare com secret, response e remoteip.
const DEFAULT_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TIMEOUT_MS = 8000;

function captchaError(res) {
  return res.status(403).json({ code: 'captcha', error: 'Confirme que você não é um robô e tente de novo.' });
}

async function verifyTurnstile(req, res, next) {
  const secret = process.env.TURNSTILE_SECRET;
  if (!secret) return next();
  const token = req.get('x-turnstile-token') || (req.body && typeof req.body.turnstile_token === 'string' ? req.body.turnstile_token : '');
  if (!token || token.length > 2048) return captchaError(res);

  const form = new URLSearchParams({ secret, response: token });
  if (req.ip) form.set('remoteip', req.ip);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(process.env.TURNSTILE_VERIFY_URL || DEFAULT_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    if (response.ok && data && data.success === true) return next();
    return captchaError(res);
  } catch (error) {
    // Cloudflare fora do ar: falha fechada (sem captcha conferido, não passa).
    console.error('[Captcha] Não foi possível conferir o Turnstile:', error.name === 'AbortError' ? 'tempo esgotado' : error.message);
    return captchaError(res);
  } finally {
    clearTimeout(timer);
  }
}

function turnstileSiteKey() {
  return process.env.TURNSTILE_SECRET && process.env.TURNSTILE_SITE_KEY ? process.env.TURNSTILE_SITE_KEY : null;
}

module.exports = { verifyTurnstile, turnstileSiteKey };
