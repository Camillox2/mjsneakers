const API_BASE = import.meta.env.VITE_API_URL?.replace('/api', '') || ''

export function getImageUrl(url, fallbackName = 'Produto') {
  if (!url) return `https://placehold.co/400x400/1a1a1a/dc2626?text=${encodeURIComponent(fallbackName)}`
  if (url.startsWith('data:')) return url
  if (url.startsWith('http')) return url
  if (url.startsWith('/uploads/')) return `${API_BASE}${url}`
  return `https://placehold.co/400x400/1a1a1a/dc2626?text=${encodeURIComponent(fallbackName)}`
}
