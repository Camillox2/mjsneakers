const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const brlCompact = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 })
const int = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })
const pct = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 0 })

export const money = (v) => brl.format(Number(v) || 0)
// Valores grandes em manchetes: R$ 12,4 mil em vez de R$ 12.430,00.
export const moneyShort = (v) => {
  const n = Number(v) || 0
  return Math.abs(n) >= 10000 ? brlCompact.format(n) : brl.format(n)
}
export const number = (v) => int.format(Number(v) || 0)
export const numberShort = (v) => {
  const n = Number(v) || 0
  return Math.abs(n) >= 10000 ? compact.format(n) : int.format(n)
}
export const percent = (v) => pct.format(Number(v) || 0)

// Variação entre o período atual e o anterior; null quando não há base.
export function delta(current, previous) {
  const c = Number(current) || 0
  const p = Number(previous) || 0
  if (!p) return c ? null : 0
  return (c - p) / p
}

const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const dateTimeFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
const dayMonth = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' })

const toDate = (d) => {
  if (!d) return null
  // 'YYYY-MM-DD' puro vira meia-noite local, não UTC (senão cai no dia anterior).
  const x = typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T00:00:00`) : new Date(d)
  return isNaN(x) ? null : x
}

export const date = (d) => { const x = toDate(d); return x ? dateFmt.format(x) : 'sem data' }
export const dateTime = (d) => { const x = toDate(d); return x ? dateTimeFmt.format(x) : 'sem data' }
export const shortDay = (d) => { const x = toDate(d); return x ? dayMonth.format(x).replace('.', '') : '' }
const weekdayDay = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
export const longDay = (d) => { const x = toDate(d); return x ? weekdayDay.format(x).replace(/\./g, '') : '' }

const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })
export function ago(d) {
  const x = toDate(d)
  if (!x) return ''
  const s = (x.getTime() - Date.now()) / 1000
  const abs = Math.abs(s)
  if (abs < 60) return 'agora'
  if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(s / 3600), 'hour')
  if (abs < 86400 * 30) return rtf.format(Math.round(s / 86400), 'day')
  return date(x)
}

// Valor para <input type="datetime-local"> a partir do que vem do banco.
export function toLocalInput(d) {
  const x = toDate(d)
  if (!x) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`
}

export const plural = (n, one, many) => `${number(n)} ${Number(n) === 1 ? one : many}`

// Preço final com o desconto aplicado, com a mesma regra da loja.
export function finalPrice(price, discount) {
  const p = Number(price) || 0
  const d = Math.min(Math.max(Number(discount) || 0, 0), 90)
  return d > 0 ? Math.round(p * (1 - d / 100) * 100) / 100 : p
}
