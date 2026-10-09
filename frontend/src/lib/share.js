import { copyText } from './format'

const brl = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

// Link que abre o par: /produto/:id (a hospedagem devolve o app em qualquer
// rota, e a página do produto busca pelo id).
export const productUrl = (product) => `${window.location.origin}/produto/${encodeURIComponent(product.id)}`

export function shareText(product) {
  const price = Number(product.price) || 0
  const pct = Math.min(Math.max(Number(product.discount_percentage || 0), 0), 90)
  if (pct > 0 && price > 0) {
    const now = Math.round(price * (1 - pct / 100) * 100) / 100
    return `${product.name}: de ${brl(price)} por ${brl(now)} (-${Math.round(pct)}%) na Pizantt`
  }
  return price > 0 ? `${product.name} por ${brl(price)} na Pizantt` : `${product.name} na Pizantt`
}

// Compartilha pela folha do sistema (celular e alguns navegadores de
// computador); sem ela, copia o link. Devolve 'shared' | 'copied' | 'cancel' | 'fail'.
export async function shareProduct(product) {
  const url = productUrl(product)
  const data = { title: `${product.name} | Pizantt`, text: shareText(product), url }
  if (navigator.share && (!navigator.canShare || navigator.canShare(data))) {
    try {
      await navigator.share(data)
      return 'shared'
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancel'
      // NotAllowedError etc.: cai para copiar
    }
  }
  return (await copyText(url)) ? 'copied' : 'fail'
}
