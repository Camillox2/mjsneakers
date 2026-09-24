const API_BASE = import.meta.env.VITE_API_URL?.replace('/api', '') || ''

// Placeholder local (sem chamar serviço externo): silhueta de tênis em cromo.
const placeholder = (name) => {
  const label = String(name || 'Produto').slice(0, 28).replace(/[<>&"]/g, '')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" fill="#0c0d10"/><path d="M78 250c10-38 34-66 70-74 22-5 36 10 58 9 30-2 52-30 88-24 22 4 34 20 30 38l-6 28c-2 10-10 16-20 16H96c-12 0-21-5-18-13z" fill="none" stroke="#6e737c" stroke-width="3" stroke-linejoin="round"/><path d="M84 266h234" stroke="#4b505a" stroke-width="3" stroke-linecap="round"/><text x="200" y="326" fill="#8a9099" font-family="Archivo, sans-serif" font-size="18" text-anchor="middle">${label}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export function getImageUrl(url, fallbackName = 'Produto') {
  if (!url) return placeholder(fallbackName)
  if (url.startsWith('data:')) return url
  if (url.startsWith('http')) return url
  if (url.startsWith('/uploads/')) return `${API_BASE}${url}`
  if (url.startsWith('/')) return url // arquivo público da própria loja (giros, amostras)
  return placeholder(fallbackName)
}
