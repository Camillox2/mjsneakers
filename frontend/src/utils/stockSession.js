// Gerenciamento da sessão de carrinho usada para reservar estoque.
// O session_id identifica o carrinho do visitante no backend (/api/stock/reserve).
import api from '../services/api'

const KEY = 'cart_session_id'

// Lê (ou cria) o session_id persistido no localStorage.
export function getCartSessionId() {
  let id = localStorage.getItem(KEY)
  if (!id) {
    id = (crypto.randomUUID && crypto.randomUUID()) ||
      `${Date.now()}-${Math.random().toString(36).slice(2)}`
    localStorage.setItem(KEY, id)
  }
  return id
}

// Lê sem criar: útil para liberar reservas só quando já existe sessão.
export function peekCartSessionId() {
  return localStorage.getItem(KEY)
}

// Reserva estoque ao adicionar ao carrinho.
// Lança o erro do axios para o chamador tratar o 409 (esgotado).
export function reserveStock({ product_id, size, quantity = 1 }) {
  const session_id = getCartSessionId()
  return api.post('/stock/reserve', { session_id, product_id, size, quantity })
}

// Libera todas as reservas da sessão (esvaziar carrinho / pós-checkout).
export async function releaseStock() {
  const id = peekCartSessionId()
  if (!id) return
  try {
    await api.delete(`/stock/reserve/${id}`)
  } catch {
    /* silencioso: reserva pode já ter expirado no backend */
  }
}

// Remove o session_id: após pedido concluído, o próximo carrinho começa zerado.
export function clearCartSession() {
  localStorage.removeItem(KEY)
}
