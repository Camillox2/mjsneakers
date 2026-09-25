const { sendEmail } = require('../services/emailService');
const { getSettingValue } = require('../controllers/settingsController');

// E-mail nunca derruba quem chamou: roda depois, fora da requisição, e
// engole qualquer falha (só registra no log).
function sendLater(to, buildTemplate) {
  if (!to) return;
  setImmediate(async () => {
    try {
      await sendEmail(to, buildTemplate());
    } catch (error) {
      console.error('[Email] Falha ao montar ou enviar:', error.message);
    }
  });
}

// Para onde vão os avisos da loja: ADMIN_NOTIFY_EMAIL, senão a setting
// admin_notify_email, senão store_email.
async function adminNotifyAddress() {
  if (process.env.ADMIN_NOTIFY_EMAIL) return process.env.ADMIN_NOTIFY_EMAIL;
  try {
    return (await getSettingValue('admin_notify_email')) || (await getSettingValue('store_email')) || null;
  } catch (_error) {
    return null;
  }
}

// Atalho: aviso para a equipe, sem esperar e sem lançar erro.
function notifyAdmins(buildTemplate) {
  adminNotifyAddress()
    .then((to) => sendLater(to, buildTemplate))
    .catch(() => {});
}

module.exports = { sendLater, adminNotifyAddress, notifyAdmins };
