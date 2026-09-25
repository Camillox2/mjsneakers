import axios from 'axios'

// Cliente só do painel. Usa o mesmo token da sessão (mj_token) e traduz
// qualquer falha numa mensagem legível: as telas mostram err.message direto.
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3305/api'
export const API_ORIGIN = API_URL.replace(/\/api\/?$/, '')

const api = axios.create({ baseURL: API_URL, timeout: 30000 })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('mj_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

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
    // Sem backend, o servidor da página devolve o index.html com 200.
    const type = String(response.headers?.['content-type'] || '')
    if (type.includes('text/html')) {
      const err = new Error('A API não respondeu. Confira se o backend está rodando.')
      err.unavailable = true
      return Promise.reject(err)
    }
    return response
  },
  (error) => {
    const status = error.response?.status
    const data = error.response?.data
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
    if (status === 401 && !String(error.config?.url || '').includes('/auth/login')) {
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

export async function downloadFile(url, params, filename) {
  const res = await api.get(url, { params, responseType: 'blob' })
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
