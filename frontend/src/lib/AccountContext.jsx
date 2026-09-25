import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import api, { captchaHeaders } from '../services/api'

// Conta do cliente, sem senha: e-mail, código de 6 dígitos e o cookie
// httpOnly pz_cli (o JavaScript nunca vê a sessão). No aparelho fica só uma
// dica ("pz-conta") de que alguém entrou, para a loja não perguntar ao
// servidor em toda visita de quem nunca teve conta. A dica não é segredo:
// quem manda é o cookie, conferido em GET /account/me.

const HINT = 'pz-conta'

const hasHint = () => {
  try { return localStorage.getItem(HINT) === '1' } catch { return false }
}
const setHint = (on) => {
  try {
    if (on) localStorage.setItem(HINT, '1')
    else localStorage.removeItem(HINT)
  } catch { /* sem armazenamento: confere no servidor a cada visita */ }
}

const AccountContext = createContext(null)

export function AccountProvider({ children }) {
  const [customer, setCustomer] = useState(null)
  // checking: perguntando ao servidor; guest: sem conta; in: logado
  const [status, setStatus] = useState(() => (hasHint() ? 'checking' : 'guest'))

  const signOutLocal = useCallback(() => {
    setHint(false)
    setCustomer(null)
    setStatus('guest')
  }, [])

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get('/account/me')
      const me = data?.customer ? { ...data, ...data.customer } : data
      setCustomer(me || null)
      setStatus('in')
      setHint(true)
      return me
    } catch (err) {
      if (err?.response?.status === 401 || err?.response?.status === 403) signOutLocal()
      else setStatus((s) => (s === 'checking' ? 'guest' : s))
      return null
    }
  }, [signOutLocal])

  // abrindo a loja com a dica: confere se o cookie ainda vale
  useEffect(() => {
    if (hasHint()) refresh()
  }, [refresh])

  // sessão da conta venceu no meio de uma chamada
  useEffect(() => {
    const onUnauthorized = (e) => {
      if (String(e.detail?.url || '').includes('/account')) signOutLocal()
    }
    window.addEventListener('pz:unauthorized', onUnauthorized)
    return () => window.removeEventListener('pz:unauthorized', onUnauthorized)
  }, [signOutLocal])

  // 1) pede o código por e-mail (com o token do captcha)
  const requestCode = useCallback(
    (email, captchaToken) => api.post('/account/code', { email: String(email || '').trim() }, captchaHeaders(captchaToken)),
    [],
  )

  // 2) confere o código: o servidor grava o cookie e a conta abre
  const verify = useCallback(
    async (email, code) => {
      await api.post('/account/verify', { email: String(email || '').trim(), code: String(code || '').trim() })
      setHint(true)
      return refresh()
    },
    [refresh],
  )

  const logout = useCallback(async () => {
    try {
      await api.post('/account/logout')
    } catch { /* sai no aparelho mesmo se a rede falhar */ }
    signOutLocal()
  }, [signOutLocal])

  const updateProfile = useCallback(async (patch) => {
    const { data } = await api.put('/account/profile', patch)
    setCustomer((c) => ({ ...(c || {}), ...patch, ...(data && typeof data === 'object' && !Array.isArray(data) ? data : {}) }))
    return data
  }, [])

  const value = useMemo(
    () => ({ customer, status, loggedIn: status === 'in' && Boolean(customer), refresh, requestCode, verify, logout, updateProfile, signOutLocal }),
    [customer, status, refresh, requestCode, verify, logout, updateProfile, signOutLocal],
  )

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
}

// Fora do provider (admin, testes) devolve uma conta vazia em vez de quebrar.
const EMPTY = { customer: null, status: 'guest', loggedIn: false, refresh: async () => null, requestCode: async () => {}, verify: async () => null, logout: async () => {}, updateProfile: async () => {}, signOutLocal: () => {} }

export function useAccount() {
  return useContext(AccountContext) || EMPTY
}
