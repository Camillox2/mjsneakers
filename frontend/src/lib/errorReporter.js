import api from '../services/api'

// Captura de erros do navegador: window.onerror, promessa rejeitada sem
// tratamento e o ErrorBoundary mandam para POST /client-errors.
//
// Privacidade: vai só a mensagem, a pilha e o caminho da página, depois de
// uma limpeza que tira e-mail, token, número longo (CPF, telefone, cartão) e
// qualquer querystring. Nada de formulário, corpo de requisição ou cookie.
// Sem duplicados e no máximo 10 por sessão (aba).

const MAX_PER_SESSION = 10
const RELEASE = typeof __PZ_RELEASE__ !== 'undefined' ? __PZ_RELEASE__ : 'dev' // eslint-disable-line no-undef
const IGNORE = [/ResizeObserver loop/i, /^Script error\.?$/i, /^canceled$/i, /AbortError/i, /Load failed$/i]

const seen = new Set()
let sent = 0
let sending = false
let started = false

function scrub(text) {
  return String(text || '')
    // querystring e âncora de URLs (podem levar token, e-mail, access_token)
    .replace(/(https?:\/\/[^\s?#'"]+)[?#][^\s'")]*/gi, '$1')
    .replace(/([/\w-]+\.\w{1,5})\?[^\s'")]*/g, '$1')
    .replace(/[?&](access_token|token|code|email|cpf)=[^\s&'"]*/gi, '')
    // e-mail
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    // JWT e tokens longos
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[token]')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[token]')
    // números longos (CPF, telefone, cartão, código)
    .replace(/\d[\d .-]{7,}\d/g, '[número]')
}

function send(payload) {
  if (sending || sent >= MAX_PER_SESSION) return
  sending = true
  sent += 1
  api
    .post('/client-errors', payload, { timeout: 8000 })
    .catch(() => { /* sem rede ou API fora: não tenta de novo */ })
    .finally(() => {
      sending = false
    })
}

export function reportError(error, source = 'window') {
  try {
    const raw = error instanceof Error ? error : new Error(typeof error === 'string' ? error : JSON.stringify(error ?? 'erro'))
    const message = scrub(raw.message).slice(0, 500)
    if (!message || IGNORE.some((re) => re.test(message))) return
    const stack = scrub(raw.stack || '').slice(0, 4000)
    const key = `${message}|${stack.split('\n')[1] || ''}`
    if (seen.has(key)) return
    seen.add(key)
    send({
      message: source === 'window' ? message : `[${source}] ${message}`,
      stack,
      path: window.location.pathname,
      release: RELEASE,
      user_agent: navigator.userAgent.slice(0, 300),
    })
  } catch {
    /* o próprio relatório nunca pode quebrar a página */
  }
}

export function startErrorReporter() {
  if (started || typeof window === 'undefined') return
  started = true
  window.addEventListener('error', (e) => {
    // erro de carregamento de imagem/script chega sem e.error: ignora
    if (e?.error) reportError(e.error, 'window')
    else if (e?.message) reportError(e.message, 'window')
  })
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e?.reason
    // erro de rede de chamada à API já tratada na tela não é bug de código
    if (reason?.isAxiosError && !reason.response) return
    reportError(reason, 'promise')
  })
}
