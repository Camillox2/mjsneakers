import { cachedGet, TTL } from '../services/cache'

// Promoções da loja: produtos com desconto valendo agora. A API já devolve o
// desconto efetivo (0 fora da janela promo_start/promo_end).
//
// Pede /products?promo=1 (filtro no servidor). Se a API ainda não conhece o
// filtro (devolve produtos sem desconto no meio), cai para o plano B: lê o
// catálogo em páginas de 100 e filtra aqui mesmo.

const MAX_PAGES = 10

export const discountOf = (p) => Math.min(Math.max(Number(p?.discount_percentage || 0), 0), 90)
export const salePrice = (p) => {
  const d = discountOf(p)
  const price = Number(p?.price) || 0
  return d > 0 ? Math.round(price * (1 - d / 100) * 100) / 100 : price
}
export const isOnSale = (p) => discountOf(p) > 0 && Number(p?.price) > 0

const listOf = (data) => (Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [])

// maior desconto primeiro; empate: o que tem estoque, depois o mais novo
const byDiscount = (a, b) =>
  discountOf(b) - discountOf(a) ||
  (Number(b.stock) > 0) - (Number(a.stock) > 0) ||
  String(b.created_at || '').localeCompare(String(a.created_at || ''))

export async function fetchPromos() {
  const first = await cachedGet('/products', { params: { promo: 1, sort: 'discount', limit: 100, page: 1 }, ttl: TTL.list })
  const items = listOf(first)
  const pages = Math.max(1, Number(first?.pages) || 1)
  const serverFiltered = items.every(isOnSale)
  let all = items
  if (pages > 1) {
    // com o filtro no servidor só lê as outras páginas de promoção; sem ele,
    // as páginas do catálogo inteiro
    const params = serverFiltered ? { promo: 1, sort: 'discount', limit: 100 } : { limit: 100 }
    const rest = await Promise.allSettled(
      Array.from({ length: Math.min(pages, MAX_PAGES) - 1 }, (_, i) =>
        cachedGet('/products', { params: { ...params, page: i + 2 }, ttl: TTL.list }),
      ),
    )
    rest.forEach((r) => {
      if (r.status === 'fulfilled') all = all.concat(listOf(r.value))
    })
  }
  const seen = new Set()
  return all
    .filter(isOnSale)
    .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
    .sort(byDiscount)
}
