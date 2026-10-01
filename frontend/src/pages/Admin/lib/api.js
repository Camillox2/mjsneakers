import axios from 'axios'
import { API_URL, API_ORIGIN } from '../../../config/api'

// Cliente só do painel. A sessão mora num cookie httpOnly (pz_adm) que o
// JavaScript não consegue ler: um script injetado não rouba o login. Quem
// muda dado manda o X-CSRF-Token, copiado do cookie pz_csrf. Toda falha vira
// uma mensagem legível: as telas mostram err.message direto.
export { API_URL, API_ORIGIN }

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


// Converte qualquer valor de erro da API em string legível (PT).
// Objeto sem campos conhecidos vira JSON — nunca "[object Object]".
function asText(value) {
  if (value == null || value === '') return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    return value.map(asText).filter(Boolean).join(' ')
  }
  if (typeof value === 'object') {
    const nested = value.msg ?? value.message ?? value.error ?? value.detail
    if (nested != null && nested !== value) {
      const t = asText(nested)
      if (t) return t
    }
    try {
      const json = JSON.stringify(value)
      if (json && json !== '{}' && json !== '[]') return json
    } catch { /* circular */ }
  }
  return ''
}

const MESSAGES = {
  400: 'Confira os campos e tente de novo.',
  403: 'Sua conta não tem permissão para isso.',
  404: 'Não encontrado. Pode ter sido removido.',
  409: 'Conflito com um registro que já existe.',
  413: 'Arquivo grande demais para o servidor. Tente uma foto menor ou atualize o painel (Ctrl+Shift+R).',
  429: 'Muitas tentativas seguidas. Espere um minuto e tente de novo.',
  502: 'O envio da imagem falhou no caminho até a API. Tente uma foto menor ou atualize o painel (Ctrl+Shift+R).',
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
    // Nunca passar objeto cru para Error()/toast: vira "[object Object]".
    let message = asText(data?.error) || asText(data?.message)
    const list = Array.isArray(data?.errors) ? data.errors
      : Array.isArray(data?.details) ? data.details
      : null
    if (list?.length) {
      const joined = list.map(e => asText(e?.msg ?? e?.message ?? e)).filter(Boolean).join(' ')
      if (joined) message = joined
    }
    // nginx/Vercel devolvem HTML/texto em 413/502 — não tem data.error.
    if (!message && typeof data === 'string') {
      if (status === 413 || /entity too large|413/i.test(data)) {
        message = MESSAGES[413]
      } else if (status === 502 || /ROUTER_EXTERNAL|Bad Gateway/i.test(data)) {
        message = MESSAGES[502]
      }
    }
    if (!message) {
      if (!error.response) message = 'Sem conexão com a API. Atualize com Ctrl+Shift+R ou aguarde se houver limite de tentativas.'
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

// nginx na VPS está com client_max_body_size ~1m: fotos de celular (2–8 MB)
// estouram 413 e o cadastro de produto para no upload. Reduzimos no navegador
// antes de enviar (o backend já redimensiona de novo para WebP).
const UPLOAD_SAFE_BYTES = 900 * 1024
const UPLOAD_MAX_SIDE = { products: 1600, brands: 800, banners: 1920, general: 1600 }

async function prepareUploadBlob(fileOrBlob, category = 'products') {
  const input = fileOrBlob
  if (!input) return input
  const type = String(input.type || '')
  if (type && !type.startsWith('image/')) return input
  if (input.size && input.size <= UPLOAD_SAFE_BYTES) return input

  // Sem createImageBitmap (ou formato que o navegador não decodifica), não
  // dá para encolher no cliente — e o nginx da VPS ainda corta ~1 MB.
  if (typeof createImageBitmap !== 'function') {
    throw new Error('Este navegador não consegue reduzir a foto. Use JPG/PNG menor que 900 KB ou atualize o Chrome/Safari.')
  }

  let bitmap
  try {
    bitmap = await createImageBitmap(input)
  } catch {
    throw new Error('Não deu para ler esta foto no navegador. Salve de novo em JPG ou PNG e tente outra vez.')
  }

  const maxSide = UPLOAD_MAX_SIDE[category] || UPLOAD_MAX_SIDE.general
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height, 1))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) {
    bitmap.close?.()
    throw new Error('Não deu para reduzir a foto neste aparelho. Tente um JPG menor.')
  }
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()

  const qualities = [0.82, 0.72, 0.62, 0.52, 0.42]
  let best = null
  for (const q of qualities) {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', q))
    if (!blob) continue
    best = blob
    if (blob.size <= UPLOAD_SAFE_BYTES) break
  }
  if (!best || best.size > UPLOAD_SAFE_BYTES) {
    throw new Error('A foto ainda ficou grande demais depois de reduzir. Escolha outra imagem ou um recorte menor.')
  }
  return best
}

// Envia uma imagem (arquivo ou data URL) e devolve a URL gravada no servidor.
export async function uploadImage(fileOrDataUrl, category = 'products') {
  let blob = fileOrDataUrl
  if (typeof fileOrDataUrl === 'string') {
    blob = await (await fetch(fileOrDataUrl)).blob()
  }
  const prepared = await prepareUploadBlob(blob, category)
  const name = (blob && blob.name) || `imagem-${Date.now()}.jpg`
  const uploadName = prepared.type === 'image/jpeg' && !/\.jpe?g$/i.test(name)
    ? name.replace(/\.[^.]+$/, '') + '.jpg'
    : (prepared.type === 'image/jpeg' ? name.replace(/\.[^.]+$/, '.jpg') : name)
  const form = new FormData()
  form.append('image', prepared, uploadName || `imagem-${Date.now()}.jpg`)
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
  const root = document.body || document.documentElement
  if (root) {
    root.appendChild(a)
    a.click()
    a.remove()
  } else {
    a.click()
  }
  setTimeout(() => URL.revokeObjectURL(href), 1000)
}

export default api
