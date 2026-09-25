import { cachedGet, TTL } from '../services/cache'

// Dados legais da loja (Decreto 7.962/2013 e LGPD): quem vende (razão
// social, CNPJ, endereço, atendimento) e os textos de termos, trocas e
// privacidade, tudo editado no admin e servido por GET /legal.

export const LEGAL_PAGES = {
  terms: { path: '/termos', title: 'Termos de uso' },
  returns: { path: '/trocas-e-devolucoes', title: 'Trocas e devoluções' },
  privacy: { path: '/privacidade', title: 'Política de privacidade' },
}

const clean = (v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v))

export function loadLegal() {
  return cachedGet('/legal', { ttl: TTL.config, persist: true }).then((data) => {
    const c = data?.company || {}
    const company = {}
    ;['company_name', 'trade_name', 'cnpj', 'address', 'email', 'phone', 'hours', 'dpo_name', 'dpo_email'].forEach((k) => {
      company[k] = clean(c[k])
    })
    const pages = {}
    Object.keys(LEGAL_PAGES).forEach((k) => {
      const p = data?.pages?.[k] || {}
      pages[k] = { content: clean(p.content), updated_at: p.updated_at || null, is_default: Boolean(p.is_default) }
    })
    return { company, pages }
  })
}

// 00.000.000/0000-00 (se vier só com números)
export function formatCnpj(v) {
  const d = String(v || '').replace(/\D/g, '')
  if (d.length !== 14) return String(v || '')
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

export function formatLegalDate(v) {
  if (!v) return ''
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
}
