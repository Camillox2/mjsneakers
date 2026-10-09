import { useEffect, useRef } from 'react'
import { FiShare2 } from 'react-icons/fi'
import { useToast } from '../Toast/Toast'
import { shareProduct } from '../../lib/share'

// Botão "Compartilhar" do par. Dentro de card ou fileira: o toque não abre o
// produto nem começa o arrasto da fileira (o pointerdown para aqui, antes do
// ouvinte nativo da fileira).
export default function ShareButton({ product, className, label = 'Compartilhar', showText = false }) {
  const addToast = useToast()
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const stop = (e) => e.stopPropagation()
    el.addEventListener('pointerdown', stop)
    el.addEventListener('dragstart', stop)
    return () => {
      el.removeEventListener('pointerdown', stop)
      el.removeEventListener('dragstart', stop)
    }
  }, [])

  const onClick = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!product) return
    const result = await shareProduct(product)
    if (result === 'copied') addToast('Link copiado', 'success')
    else if (result === 'fail') addToast('Não deu para compartilhar. Copie o endereço da página.', 'error')
  }

  return (
    <button ref={ref} type="button" className={className} onClick={onClick} aria-label={label} title={label}>
      <FiShare2 aria-hidden="true" />
      {showText && <span>{label}</span>}
    </button>
  )
}
