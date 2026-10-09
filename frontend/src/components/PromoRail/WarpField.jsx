import { useEffect, useRef } from 'react'
import { startWarp } from '../../lib/warp'
import { prefersReducedMotion } from '../../lib/motion'

// Fundo da faixa de promoções: preto com estrelas voando para dentro da tela.
export default function WarpField({ className }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!ref.current) return undefined
    return startWarp(ref.current, { reduced: prefersReducedMotion() })
  }, [])
  return <canvas ref={ref} className={className} aria-hidden="true" />
}
