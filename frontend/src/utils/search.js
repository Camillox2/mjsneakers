// Busca da loja: o que a pessoa digita vira o termo enviado ao backend.
//
// Palavras genéricas ("tênis", "sneaker") não aparecem no nome dos produtos
// (a loja só vende tênis): "tênis nike" voltava vazio. Elas saem do termo.
const GENERIC = new Set(['tenis', 'sneaker', 'sneakers'])

export const norm = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

export const normWords = (s) => norm(s).split(/\s+/).filter(Boolean)

// Termo limpo para a API (máx. 100 caracteres, como o backend aceita).
export function cleanQuery(raw) {
  const words = String(raw || '').trim().split(/\s+/).filter(Boolean)
  const kept = words.filter((w) => !GENERIC.has(norm(w).replace(/[^a-z0-9]/g, '')))
  return kept.join(' ').slice(0, 100)
}
