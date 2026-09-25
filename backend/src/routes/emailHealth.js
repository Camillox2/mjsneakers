const express = require('express');
const dns = require('dns').promises;
const rateLimit = require('express-rate-limit');
const { requireAdmin } = require('../middleware/auth');
const { sendEmail } = require('../services/emailService');
const { storeBaseUrl } = require('../utils/storeUrl');
const { auditReq } = require('../controllers/auditController');

const router = express.Router();
router.use(...requireAdmin);

// Domínio de envio: o do EMAIL_FROM, senão o do DKIM, senão o da loja.
function sendingDomain() {
  const from = String(process.env.EMAIL_FROM || '');
  const m = from.match(/@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/);
  if (m) return m[1].toLowerCase();
  if (process.env.DKIM_DOMAIN) return process.env.DKIM_DOMAIN.toLowerCase();
  try { return new URL(storeBaseUrl()).hostname.replace(/^www\./, ''); } catch { return null; }
}

const withTimeout = (p, ms = 4000) => Promise.race([p, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);
async function txt(name) {
  try {
    const records = await withTimeout(dns.resolveTxt(name));
    return records.map((parts) => parts.join(''));
  } catch (_error) {
    return [];
  }
}

// Confere no DNS o que faz o e-mail da loja não cair no spam nem ser falsificado.
router.get('/email-health', async (_req, res) => {
  const domain = sendingDomain();
  if (!domain) return res.json({ domain: null, checks: [] });

  const [mx, root, dmarc] = await Promise.all([
    withTimeout(dns.resolveMx(domain)).catch(() => []),
    txt(domain),
    txt(`_dmarc.${domain}`),
  ]);
  const spf = root.find((r) => r.toLowerCase().startsWith('v=spf1')) || null;
  const dmarcRec = dmarc.find((r) => r.toUpperCase().startsWith('V=DMARC1')) || null;
  const selector = process.env.DKIM_SELECTOR || null;
  const dkimRec = selector ? (await txt(`${selector}._domainkey.${domain}`)).find((r) => /p=/.test(r)) || null : null;
  const dmarcPolicy = dmarcRec ? (dmarcRec.match(/;\s*p=(\w+)/i) || [])[1] || null : null;

  const checks = [
    {
      key: 'mx', label: 'Recebe e-mail (MX)', ok: mx.length > 0,
      value: mx.map((m) => m.exchange).join(', ') || null,
      hint: mx.length ? null : 'O domínio não tem MX: respostas de clientes para este domínio se perdem.',
    },
    {
      key: 'spf', label: 'SPF (quem pode enviar pelo domínio)', ok: !!spf,
      value: spf,
      hint: spf ? null : `Crie um TXT em ${domain} com "v=spf1 include:<o servidor do seu provedor de e-mail> ~all". O provedor informa o include certo.`,
    },
    {
      key: 'dkim', label: 'DKIM (assinatura dos e-mails)', ok: !!dkimRec && !!process.env.DKIM_PRIVATE_KEY,
      value: dkimRec ? `${selector}._domainkey.${domain}` : null,
      hint: !selector
        ? 'Defina DKIM_SELECTOR e DKIM_PRIVATE_KEY no servidor e publique a chave pública no DNS (o provedor de e-mail costuma gerar as duas).'
        : !dkimRec
          ? `Publique o TXT ${selector}._domainkey.${domain} com a chave pública (v=DKIM1; k=rsa; p=...).`
          : !process.env.DKIM_PRIVATE_KEY ? 'O DNS tem a chave, mas o servidor está sem DKIM_PRIVATE_KEY.' : null,
    },
    {
      key: 'dmarc', label: 'DMARC (o que fazer com e-mail falso)', ok: !!dmarcRec && dmarcPolicy !== 'none',
      value: dmarcRec,
      hint: !dmarcRec
        ? `Crie um TXT em _dmarc.${domain} com "v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}; adkim=s; aspf=s".`
        : dmarcPolicy === 'none' ? 'O DMARC existe, mas com p=none só monitora. Depois de uns dias sem problema, troque para p=quarantine.' : null,
    },
  ];

  res.set('Cache-Control', 'no-store');
  res.json({ domain, from: process.env.EMAIL_FROM || null, smtp_configured: !!process.env.EMAIL_HOST, checks });
});

const testLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, message: { error: 'Muitos testes seguidos. Espere alguns minutos.' } });

router.post('/email-test', testLimiter, async (req, res) => {
  const to = String(req.body?.to || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || to.length > 255) return res.status(400).json({ error: 'Informe um e-mail válido.' });
  if (!process.env.EMAIL_HOST) {
    return res.status(400).json({ error: 'O servidor ainda não tem envio de e-mail configurado (EMAIL_HOST e os dados do provedor).' });
  }
  const when = new Date().toLocaleString('pt-BR');
  try {
    const info = await sendEmail(to, {
      subject: 'Teste de e-mail da loja',
      html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111"><p>Se você recebeu isto, o envio de e-mail da loja está funcionando.</p><p style="color:#666">Enviado em ${when}.</p></div>`,
    });
    auditReq(req, 'test', 'email', null, { ok: !!info });
    if (!info || info.skipped) return res.status(502).json({ error: 'O provedor de e-mail recusou o envio. Veja o log do servidor para o motivo.' });
    res.json({ ok: true, message: `Enviado para ${to}. Confira também a caixa de spam.` });
  } catch (error) {
    res.status(502).json({ error: `Não deu para enviar: ${error.message}` });
  }
});

module.exports = router;
