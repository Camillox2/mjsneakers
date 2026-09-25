// Avisos do painel: notificação do sistema e um toque curto, só quando a aba
// não está na frente. Nada é pedido sem o clique da pessoa (o navegador exige).

const SOUND_KEY = 'pz-admin-som'

export const notifySupported = () => typeof window !== 'undefined' && 'Notification' in window
export const notifyPermission = () => (notifySupported() ? Notification.permission : 'unsupported')

export async function askNotifyPermission() {
  if (!notifySupported()) return 'unsupported'
  try { return await Notification.requestPermission() } catch { return Notification.permission }
}

export function soundOn() {
  try { return localStorage.getItem(SOUND_KEY) !== 'off' } catch { return true }
}

export function setSound(on) {
  try { localStorage.setItem(SOUND_KEY, on ? 'on' : 'off') } catch { /* sem armazenamento */ }
}

let audio = null
function ping() {
  if (!soundOn()) return
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)()
    const now = audio.currentTime
    ;[880, 1320].forEach((freq, i) => {
      const osc = audio.createOscillator()
      const gain = audio.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, now + i * 0.12)
      gain.gain.exponentialRampToValueAtTime(0.08, now + i * 0.12 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.12 + 0.25)
      osc.connect(gain).connect(audio.destination)
      osc.start(now + i * 0.12)
      osc.stop(now + i * 0.12 + 0.3)
    })
  } catch { /* sem áudio */ }
}

// Leva a pessoa para a tela certa ao tocar na notificação (o shell escuta).
export const NAVIGATE_EVENT = 'pz-admin-navigate'

export function notify(title, body, url, tag) {
  const away = document.visibilityState !== 'visible' || !document.hasFocus()
  if (!away) return
  ping()
  if (notifyPermission() !== 'granted') return
  try {
    const n = new Notification(title, { body: String(body || '').slice(0, 140), tag, icon: '/icons/icon-192.svg' })
    n.onclick = () => {
      window.focus()
      if (url) window.dispatchEvent(new CustomEvent(NAVIGATE_EVENT, { detail: url }))
      n.close()
    }
  } catch { /* alguns celulares só notificam por service worker */ }
}
