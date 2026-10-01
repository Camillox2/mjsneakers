// Base da API usada pelo axios e pelos helpers de origem (imagens, socket).
// Em produção o Vercel às vezes grava VITE_API_URL sem o sufixo /api
// (ex.: https://api.pizantt.com). As rotas do Express vivem em /api/*,
// então normalizamos aqui para os dois formatos.

const FALLBACK = 'http://localhost:3305/api'

export function resolveApiUrl(raw = import.meta.env.VITE_API_URL) {
  const value = String(raw || FALLBACK).trim().replace(/\/+$/, '')
  if (!value) return FALLBACK
  if (/\/api$/i.test(value)) return value
  return `${value}/api`
}

export function resolveApiOrigin(raw = import.meta.env.VITE_API_URL) {
  return resolveApiUrl(raw).replace(/\/api$/i, '')
}

export const API_URL = resolveApiUrl()
export const API_ORIGIN = resolveApiOrigin()
