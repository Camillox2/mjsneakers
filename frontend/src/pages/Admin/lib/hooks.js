import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

// Busca com estados de carregando/erro. Ao recarregar, mantém o dado anterior
// na tela (a tela só esmaece): nada de piscar esqueleto a cada filtro.
export function useResource(loader, deps = []) {
  const [state, setState] = useState({ data: undefined, error: null, loading: true })
  const seq = useRef(0)
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  const reload = useCallback(async () => {
    const id = ++seq.current
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const data = await loaderRef.current()
      if (id === seq.current) setState({ data, error: null, loading: false })
      return data
    } catch (error) {
      if (id === seq.current) setState(s => ({ ...s, error, loading: false }))
      return undefined
    }
  }, [])

  useEffect(() => { reload() }, deps) // eslint-disable-line react-hooks/exhaustive-deps

  const mutate = useCallback((fn) => {
    setState(s => ({ ...s, data: typeof fn === 'function' ? fn(s.data) : fn }))
  }, [])

  return { ...state, reload, mutate }
}

export function useDebounced(value, delay = 300) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return v
}

export function useMediaQuery(query) {
  const subscribe = useCallback((cb) => {
    const mq = window.matchMedia(query)
    mq.addEventListener('change', cb)
    return () => mq.removeEventListener('change', cb)
  }, [query])
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false)
}

export const useIsMobile = () => useMediaQuery('(max-width: 767.98px)')
export const useReducedMotion = () => useMediaQuery('(prefers-reduced-motion: reduce)')

// Estado que sobrevive ao recarregar (preferências de tela, nunca dados).
export function usePersistentState(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw === null ? initial : JSON.parse(raw)
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* sem armazenamento */ }
  }, [key, value])
  return [value, setValue]
}

// Aviso ao sair com alterações não salvas (fechar aba/recarregar).
export function useUnsavedGuard(dirty) {
  useEffect(() => {
    if (!dirty) return undefined
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])
}
