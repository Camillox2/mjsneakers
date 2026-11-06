// Marcas que a loja trabalha. Com o backend no ar, a lista vem de /brands;
// esta é a reserva para a vitrine de amostras (a mesma do site antigo).
export const KNOWN_BRANDS = ['Nike', 'Jordan', 'Adidas', 'New Balance', 'Puma', 'Asics', 'Yeezy', 'Vans']

const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()

export const sameBrand = (a, b) => norm(a) === norm(b)

// Junta marcas do backend (com id e product_count) e da reserva, sem repetir, na ordem da loja.
export function mergeBrands(apiBrands = [], extraNames = []) {
  const list = []
  const push = (name, id = null, product_count = 0) => {
    if (!name || list.some((b) => sameBrand(b.name, name))) return
    list.push({ id, name, product_count: Number(product_count) || 0 })
  }
  apiBrands.forEach((b) => push(b.name, b.id, b.product_count))
  if (!apiBrands.length) KNOWN_BRANDS.forEach((n) => push(n))
  extraNames.forEach((n) => push(n))
  return list
}

// Órbita da homepage: só as marcas com pares, as com mais estoque primeiro.
// O filtro da loja continua com a lista completa (mergeBrands).
export function orbitBrands(brands = [], limit = 10) {
  return [...brands]
    .filter((b) => (Number(b?.product_count) || 0) > 0)
    .sort((a, b) => (Number(b.product_count) || 0) - (Number(a.product_count) || 0) || String(a.name).localeCompare(String(b.name)))
    .slice(0, Math.max(0, limit))
}
