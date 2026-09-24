import api from './api'

// GET com cache para dados públicos da loja (configurações, marcas, banners,
// produtos). Três coisas:
// 1. pedidos iguais em andamento viram um só (três componentes pedindo
//    /settings ao mesmo tempo geram uma requisição);
// 2. a resposta vale por `ttl` ms na memória e, com `persist`, na sessão da aba;
// 3. se a API está fora do ar, a primeira falha segura as outras por um tempo
//    em vez de cada componente bater na porta de novo.
//
// Nunca use para estoque, frete, pedidos ou qualquer dado de cliente: esses
// precisam estar sempre frescos e não podem ficar guardados no navegador.

const memory = new Map()
const inflight = new Map()
const PREFIX = 'pz-cache:'
const DOWN_FOR = 20_000
let downUntil = 0

const keyOf = (url, params) => {
  if (!params) return url
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''))
  const qs = new URLSearchParams(clean).toString()
  return qs ? `${url}?${qs}` : url
}

function readSession(key) {
  try {
    const raw = sessionStorage.getItem(PREFIX + key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeSession(key, entry) {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(entry))
  } catch {
    /* sessão cheia ou bloqueada: fica só na memória */
  }
}

export function cachedGet(url, { params, ttl = 60_000, persist = false } = {}) {
  const key = keyOf(url, params)
  const now = Date.now()
  let hit = memory.get(key)
  if (!hit && persist) {
    hit = readSession(key)
    if (hit) memory.set(key, hit)
  }
  if (hit && now - hit.t < ttl) return Promise.resolve(hit.data)
  if (now < downUntil) {
    const err = new Error('API indisponível')
    err.unavailable = true
    return Promise.reject(err)
  }
  if (inflight.has(key)) return inflight.get(key)

  const request = api
    .get(url, { params })
    .then(({ data }) => {
      const entry = { t: Date.now(), data }
      memory.set(key, entry)
      if (persist) writeSession(key, entry)
      return data
    })
    .catch((err) => {
      // sem resposta (rede) ou HTML no lugar de JSON: API fora do ar
      if (err?.unavailable || !err?.response) downUntil = Date.now() + DOWN_FOR
      throw err
    })
    .finally(() => inflight.delete(key))
  inflight.set(key, request)
  return request
}

// Depois de mexer no admin, a loja lê tudo de novo.
export function clearCache() {
  memory.clear()
  downUntil = 0
  try {
    Object.keys(sessionStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => sessionStorage.removeItem(k))
  } catch {
    /* sem sessionStorage */
  }
}

export const TTL = {
  config: 5 * 60_000, // settings, marcas, categorias, banners, faixa
  list: 30_000, // listagens de produto
  item: 60_000, // produto avulso, destaques, relacionados
}
