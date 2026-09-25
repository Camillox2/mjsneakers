import { createContext, useContext } from 'react'

// O que o painel inteiro compartilha: quem está logado, tema e contadores
// das pendências (pedidos a separar, avaliações a moderar).
export const AdminContext = createContext({
  user: null,
  dark: true,
  counts: { pendingOrders: 0, pendingReviews: 0 },
  refreshCounts: () => {},
  // configuração do Mercado Pago vista pelo admin (sem segredos) ou null
  payments: null,
  refreshPayments: () => {},
})

export const useAdmin = () => useContext(AdminContext)
