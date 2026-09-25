import axios from 'axios'
import { withCsrf } from '../services/api'

// Pagamento com Mercado Pago: configuração pública, o SDK oficial (carregado
// só quando alguém escolhe cartão), CPF e o pedido que está esperando
// pagamento nesta aba.
//
// Segurança: o access_token do pedido é o que prova que a pessoa pode pagar
// aquele pedido. Ele vive só no sessionStorage desta aba e nas chamadas de
// pagamento; nunca vai para console, log ou cache (o sw.js não guarda nada
// de /api/payments). Dado de cartão nunca passa por aqui: quem cuida dele é
// o Brick do Mercado Pago, que devolve só um token.

// Cliente próprio para o pagamento: sem o aviso de sessão vencida (um 401
// aqui não pode mexer na sessão de ninguém) e sem cache. Vai com os cookies
// e com o X-CSRF-Token, como o cliente principal. Resposta em HTML (API fora
// do ar, servidor devolvendo a página) é erro.
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL, timeout: 30000, withCredentials: true })
api.interceptors.request.use(withCsrf)
api.interceptors.response.use((res) => {
  if (String(res.headers?.['content-type'] || '').includes('text/html')) {
    const err = new Error('API indisponível')
    err.unavailable = true
    return Promise.reject(err)
  }
  return res
})

const SDK_URL = 'https://sdk.mercadopago.com/js/v2'
const PENDING_KEY = 'pz-pedido-em-pagamento'
const PENDING_EVENT = 'pz:pending-payment'
const CONFIG_TTL = 60_000

// ---------- configuração ----------

let configCache = null // { at, data }
let configInflight = null

// Desligado, sem chave pública ou com a API fora do ar: o checkout segue
// como sempre (pedido sem pagamento online).
export function loadPaymentConfig() {
  if (configCache && Date.now() - configCache.at < CONFIG_TTL) return Promise.resolve(configCache.data)
  if (configInflight) return configInflight
  configInflight = api
    .get('/payments/config')
    .then(({ data }) => {
      const on = data?.enabled === true || data?.enabled === 'true'
      const cfg = on && data.public_key
        ? {
            enabled: true,
            publicKey: String(data.public_key),
            testMode: data.test_mode === true || data.test_mode === 'true',
            maxInstallments: Math.max(1, Math.min(24, Number(data.max_installments) || 1)),
            pixDiscount: Math.max(0, Math.min(90, Number(data.pix_discount_percent) || 0)),
            pixMinutes: Number(data.pix_expiration_minutes) || 30,
          }
        : null
      configCache = { at: Date.now(), data: cfg }
      return cfg
    })
    .catch(() => null)
    .finally(() => {
      configInflight = null
    })
  return configInflight
}

// ---------- SDK do Mercado Pago ----------

let sdkPromise = null
const mpInstances = new Map()

// Injeta o script oficial uma vez só. Se falhar (rede, bloqueador), a próxima
// tentativa começa do zero.
export function loadMercadoPago() {
  if (typeof window === 'undefined') return Promise.reject(new Error('sem janela'))
  if (window.MercadoPago) return Promise.resolve(window.MercadoPago)
  if (sdkPromise) return sdkPromise
  sdkPromise = new Promise((resolve, reject) => {
    let script = document.querySelector(`script[src="${SDK_URL}"]`)
    const fail = () => {
      sdkPromise = null
      script?.remove()
      reject(new Error('O pagamento com cartão não carregou.'))
    }
    const timer = setTimeout(fail, 15000)
    const done = () => {
      clearTimeout(timer)
      if (window.MercadoPago) resolve(window.MercadoPago)
      else fail()
    }
    try {
      if (!script) {
        script = document.createElement('script')
        script.src = SDK_URL
        script.async = true
        document.head.appendChild(script)
      }
      script.addEventListener('load', done, { once: true })
      script.addEventListener('error', () => {
        clearTimeout(timer)
        fail()
      }, { once: true })
    } catch {
      clearTimeout(timer)
      fail()
    }
  })
  return sdkPromise
}

// Uma instância por chave pública (o SDK não gosta de várias).
export async function getMercadoPago(publicKey) {
  const MercadoPago = await loadMercadoPago()
  if (!mpInstances.has(publicKey)) mpInstances.set(publicKey, new MercadoPago(publicKey, { locale: 'pt-BR' }))
  return mpInstances.get(publicKey)
}

// ---------- CPF ----------

export const onlyDigits = (v) => String(v || '').replace(/\D/g, '')

// 000.000.000-00, conforme vai sendo digitado
export function formatCpf(v) {
  const d = onlyDigits(v).slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

// Confere os dois dígitos verificadores (e recusa 111.111.111-11 e parecidos).
export function isValidCpf(v) {
  const d = onlyDigits(v)
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  const check = (len) => {
    let sum = 0
    for (let i = 0; i < len; i += 1) sum += Number(d[i]) * (len + 1 - i)
    const rest = (sum * 10) % 11
    return rest === 10 ? 0 : rest
  }
  return check(9) === Number(d[9]) && check(10) === Number(d[10])
}

// ---------- pedido esperando pagamento (nesta aba) ----------

// { id, access_token, total, email, open }: `open` diz se a etapa de
// pagamento estava na tela; recarregando, ela volta sozinha.
export function readPendingPayment() {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY)
    const data = raw ? JSON.parse(raw) : null
    return data?.id && data?.access_token ? data : null
  } catch {
    return null
  }
}

export function savePendingPayment(data) {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(data))
  } catch {
    /* sem sessionStorage: só não dá para retomar depois de recarregar */
  }
  window.dispatchEvent(new Event(PENDING_EVENT))
}

export function markPendingOpen(open) {
  const current = readPendingPayment()
  if (current && current.open !== open) savePendingPayment({ ...current, open })
}

export function clearPendingPayment() {
  try {
    sessionStorage.removeItem(PENDING_KEY)
  } catch {
    /* nada a limpar */
  }
  window.dispatchEvent(new Event(PENDING_EVENT))
}

export const PENDING_PAYMENT_EVENT = PENDING_EVENT

// ---------- chamadas ----------

export const createPix = ({ orderId, accessToken, cpf }) =>
  api.post('/payments/pix', { order_id: orderId, access_token: accessToken, cpf: onlyDigits(cpf) }).then((r) => r.data)

export const payWithCard = ({ orderId, accessToken, cardFormData }) =>
  api.post('/payments/card', { ...cardFormData, order_id: orderId, access_token: accessToken }).then((r) => r.data)

export const getOrderPayment = ({ orderId, accessToken }) =>
  api
    .get(`/payments/order/${encodeURIComponent(orderId)}`, { params: { access_token: accessToken } })
    .then((r) => r.data)

// Rótulos em português da situação do pagamento (rastreio e telas).
export const PAYMENT_STATUS = {
  unpaid: { label: 'Aguardando pagamento', tone: 'warn' },
  pending: { label: 'Pagamento pendente', tone: 'warn' },
  approved: { label: 'Pago', tone: 'ok' },
  rejected: { label: 'Pagamento recusado', tone: 'danger' },
  refunded: { label: 'Pagamento estornado', tone: 'neutral' },
  charged_back: { label: 'Pagamento contestado', tone: 'danger' },
  expired: { label: 'Pix vencido', tone: 'danger' },
}

// "Pago com Pix", "Cartão em 3x"
// (o backend pode mandar "pix", "card" ou a bandeira do cartão, como "visa")
export function paymentMethodLabel(method, installments) {
  const m = String(method || '').toLowerCase()
  if (!m) return ''
  if (m === 'pix' || m === 'bank_transfer') return 'Pix'
  const n = Number(installments) || 1
  return n > 1 ? `Cartão em ${n}x` : 'Cartão à vista'
}
