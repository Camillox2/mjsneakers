import axios from 'axios'

// Configuração de segurança pública (GET /security/config): a chave do
// captcha (Turnstile) e o token CSRF de reserva.
//
// CSRF: o normal é ler o cookie pz_csrf (a API fica no mesmo site da loja).
// Se ele não estiver visível (ambiente com domínios diferentes), vale o
// csrf_token que a configuração devolve, guardado só em memória.
//
// Cliente próprio, sem os interceptores do services/api.js: é ele que
// alimenta o CSRF daquele, então não pode depender dele.

const raw = axios.create({ baseURL: import.meta.env.VITE_API_URL, withCredentials: true, timeout: 15000 })

let pending = null
let cached = null
let csrfMemory = ''

export function readCookie(name) {
  if (typeof document === 'undefined') return ''
  const hit = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`))
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : ''
}

export const csrfToken = () => readCookie('pz_csrf') || csrfMemory

// { turnstileSiteKey } (null = captcha desligado). Uma chamada por visita;
// falhou, tenta de novo na próxima vez que alguém pedir.
export function loadSecurityConfig() {
  if (cached) return Promise.resolve(cached)
  if (pending) return pending
  pending = raw
    .get('/security/config')
    .then(({ data, headers }) => {
      if (String(headers?.['content-type'] || '').includes('text/html')) throw new Error('API indisponível')
      if (data?.csrf_token) csrfMemory = String(data.csrf_token)
      cached = { turnstileSiteKey: data?.turnstile_site_key || null }
      return cached
    })
    .catch(() => ({ turnstileSiteKey: null }))
    .finally(() => {
      pending = null
    })
  return pending
}
