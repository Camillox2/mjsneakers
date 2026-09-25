import axios from 'axios'

// Cliente só do painel. A sessão mora num cookie httpOnly (pz_adm) que o
// JavaScript não consegue ler: um script injetado não rouba o login. Quem
// muda dado manda o X-CSRF-Token, copiado do cookie pz_csrf. Toda falha vira
// uma mensagem legível: as telas mostram err.message direto.
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3305/api'
export const API_ORIGIN = API_URL.replace(/\/api\/?$/, '')

const api = axios.create({ baseURL: API_URL, timeout: 30000, withCredentials: true })

let csrfMemory = null
function readCookie(name) {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return m ? decodeURIComponent(m[1]) : null
}

// Plano B quando a API está em outro domínio e o cookie não é legível daqui.
export async function ensureCsrf() {
  if (readCookie('pz_csrf')) return
  try {
    const { data } = await axios.get(`${API_URL}/security/config`, { withCredentials: true })
    if (data?.csrf_token) csrfMemory = data.csrf_token
  } catch { /* segue sem: a próxima escrita avisa */ }
}

const SAFE = ['get', 'head', 'options']
api.interceptors.request.use((config) => {
  if (!SAFE.includes(String(config.method || 'get').toLowerCase())) {
    const token = readCookie('pz_csrf') || csrfMemory
    if (token) config.headers['X-CSRF-Token'] = token
  }
  return config
})

// Aviso para o shell: a loja exige duas etapas e esta conta ainda não ligou.
export const TWO_FACTOR_EVENT = 'pz-admin-2fa'

let onSessionEnd = null
// O shell do admin registra aqui o que fazer quando o token deixa de valer.
export function setSessionEndHandler(fn) {
  onSessionEnd = fn
}

const MESSAGES = {
  400: 'Confira os campos e tente de novo.',
  403: 'Sua conta não tem permissão para isso.',
  404: 'Não encontrado. Pode ter sido removido.',
  409: 'Conflito com um registro que já existe.',
  413: 'Arquivo grande demais.',
  429: 'Muitas tentativas seguidas. Espere um minuto e tente de novo.',
}

api.interceptors.response.use(
  (response) => {
    // login, código de duas etapas e troca de senha devolvem o token CSRF novo
    if (response.data && typeof response.data.csrf_token === 'string') csrfMemory = response.data.csrf_token
    // Sem backend, o servidor da página devolve o index.html com 200.
    const type = String(response.headers?.['content-type'] || '')
    if (type.includes('text/html')) {
      const err = new Error('A API não respondeu. Confira se o backend está rodando.')
      err.unavailable = true
      return Promise.reject(err)
    }
    return response
  },
  async (error) => {
    const status = error.response?.status
    let data = error.response?.data
    const cfg = error.config || {}
    // Download (responseType blob) que falhou: o JSON do erro vem dentro do Blob.
    if (typeof Blob !== 'undefined' && data instanceof Blob && /json/i.test(data.type || '')) {
      try { data = JSON.parse(await data.text()) } catch { data = null }
    }
    // token CSRF faltando ou velho: busca de novo e tenta uma vez só
    if (status === 403 && data?.code === 'csrf' && !cfg.__csrfRetry) {
      await ensureCsrf()
      return api({ ...cfg, __csrfRetry: true })
    }
    if (status === 403 && data?.code === '2fa_setup_required') {
      window.dispatchEvent(new CustomEvent(TWO_FACTOR_EVENT))
    }
    let message = data?.error || data?.message
    if (Array.isArray(data?.errors) && data.errors.length) {
      message = data.errors.map(e => e.msg || e.message || e).join(' ')
    }
    if (!message) {
      if (!error.response) message = 'Sem conexão com a API. Confira se o backend está rodando.'
      else message = MESSAGES[status] || 'Algo deu errado no servidor. Tente de novo.'
    }
    const err = new Error(message)
    err.status = status
    err.data = data
    // Senha errada ao trocar a senha ou desligar as duas etapas não é sessão vencida.
    if (status === 401 && !/\/auth\/(login|me|change-password|2fa\/)/.test(String(cfg.url || ''))) {
      onSessionEnd?.()
    }
    return Promise.reject(err)
  }
)

// Aceita tanto lista pura quanto { data, total, pages }.
export function asList(data) {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.data)) return data.data
  return []
}

export function asPage(data, fallbackPage = 1) {
  const items = asList(data)
  return {
    items,
    total: Number(data?.total ?? items.length),
    page: Number(data?.page ?? fallbackPage),
    pages: Math.max(1, Number(data?.pages ?? 1)),
  }
}

// Envia uma imagem (arquivo ou data URL) e devolve a URL gravada no servidor.
export async function uploadImage(fileOrDataUrl, category = 'products') {
  let blob = fileOrDataUrl
  if (typeof fileOrDataUrl === 'string') {
    blob = await (await fetch(fileOrDataUrl)).blob()
  }
  const form = new FormData()
  form.append('image', blob, blob.name || `imagem-${Date.now()}.jpg`)
  form.append('category', category)
  const { data } = await api.post('/upload/single', form)
  if (!data?.url) throw new Error('O upload não devolveu o endereço da imagem.')
  return data.url
}

// options.timeout: arquivo grande (backup do banco) pode passar dos 30 s padrão.
export async function downloadFile(url, params, filename, options = {}) {
  const res = await api.get(url, { params, responseType: 'blob', ...(options.timeout ? { timeout: options.timeout } : {}) })
  const href = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(href), 1000)
}

export default api
