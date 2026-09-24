// Marcas que a loja trabalha. Com o backend no ar, a lista vem de /brands;
// esta é a reserva para a vitrine de amostras (a mesma do site antigo).
export const KNOWN_BRANDS = ['Nike', 'Jordan', 'Adidas', 'New Balance', 'Puma', 'Asics', 'Yeezy', 'Vans']

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

export const sameBrand = (a, b) => norm(a) === norm(b)

// Junta marcas do backend (com id) e da reserva, sem repetir, na ordem da loja.
export function mergeBrands(apiBrands = [], extraNames = []) {
  const list = []
  const push = (name, id = null) => {
    if (!name || list.some((b) => sameBrand(b.name, name))) return
    list.push({ id, name })
  }
  apiBrands.forEach((b) => push(b.name, b.id))
  if (!apiBrands.length) KNOWN_BRANDS.forEach((n) => push(n))
  extraNames.forEach((n) => push(n))
  return list
}
