// Base da API usada pelo axios e pelos helpers de origem (imagens, socket).
// Em produção usamos same-origin '/api' (Vercel rewrite → api.pizantt.com),
// evitando CORS/localhost stale builds. Imagens e socket ainda apontam ao host
// real via API_ORIGIN.

const DEV_FALLBACK = 'http://localhost:3305/api'
const PROD_ORIGIN = 'https://api.pizantt.com'

export function resolveApiUrl(raw = import.meta.env.VITE_API_URL) {
  if (import.meta.env.PROD) return '/api'
  const value = String(raw || DEV_FALLBACK).trim().replace(/\/+$/, '')
  if (!value) return DEV_FALLBACK
  if (/\/api$/i.test(value)) return value
  return `${value}/api`
}

export function resolveApiOrigin() {
  const fromOrigin = import.meta.env.VITE_API_ORIGIN
  if (fromOrigin) return String(fromOrigin).trim().replace(/\/+$/, '')

  const raw = import.meta.env.VITE_API_URL
  if (raw) {
    try {
      return new URL(String(raw).trim()).origin
    } catch {
      const normalized = String(raw).trim().replace(/\/+$/, '')
      if (/\/api$/i.test(normalized)) return normalized.replace(/\/api$/i, '')
    }
  }

  if (import.meta.env.PROD) return PROD_ORIGIN
  return 'http://localhost:3305'
}

export const API_URL = resolveApiUrl()
export const API_ORIGIN = resolveApiOrigin()
