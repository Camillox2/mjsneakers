// Formatos da loja (moeda, data, telefone) e situação do pedido em português.

export const brl = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0)

export function shortDate(v) {
  if (!v) return ''
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

// (00) 0000-0000 ou (00) 00000-0000, conforme vai sendo digitado
export function formatPhone(v) {
  const d = String(v || '').replace(/\D/g, '').slice(0, 11)
  if (!d) return ''
  if (d.length <= 2) return `(${d}`
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

export const ORDER_STATUS = {
  pending: { label: 'Aguardando pagamento', tone: 'warn' },
  confirmed: { label: 'Pedido confirmado', tone: 'neutral' },
  processing: { label: 'Em separação', tone: 'neutral' },
  shipped: { label: 'Enviado', tone: 'neutral' },
  delivered: { label: 'Entregue', tone: 'ok' },
  cancelled: { label: 'Cancelado', tone: 'danger' },
  canceled: { label: 'Cancelado', tone: 'danger' },
}

export const orderStatus = (s) => ORDER_STATUS[s] || { label: s ? String(s) : 'Recebido', tone: 'neutral' }

// Copia com a API do navegador; sem ela, com um campo escondido.
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const area = document.createElement('textarea')
      area.value = text
      area.setAttribute('readonly', '')
      area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none'
      document.body.appendChild(area)
      area.select()
      const ok = document.execCommand('copy')
      area.remove()
      return ok
    } catch {
      return false
    }
  }
}
