import { useEffect } from 'react'
import { lockScroll } from './motion'

// Trava a página de trás enquanto uma camada (sacola, modal) está aberta.
// A trava conta camadas: fechar uma não destrava a outra.
export function useScrollLock(active) {
  useEffect(() => {
    if (!active) return undefined
    lockScroll(true)
    return () => lockScroll(false)
  }, [active])
}
