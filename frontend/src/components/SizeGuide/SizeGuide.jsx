import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence, MotionConfig } from 'framer-motion'
import { FiX } from 'react-icons/fi'
import styles from './SizeGuide.module.css'

const EASE = [0.22, 1, 0.36, 1]

const sizeTable = [
  { br: '35', us: '5', uk: '4', cm: '22.5' },
  { br: '36', us: '6', uk: '4.5', cm: '23' },
  { br: '37', us: '6.5', uk: '5', cm: '23.5' },
  { br: '38', us: '7', uk: '5.5', cm: '24' },
  { br: '39', us: '8', uk: '6', cm: '25' },
  { br: '40', us: '8.5', uk: '7', cm: '25.5' },
  { br: '41', us: '9', uk: '7.5', cm: '26' },
  { br: '42', us: '10', uk: '8.5', cm: '26.5' },
  { br: '43', us: '10.5', uk: '9', cm: '27' },
  { br: '44', us: '11', uk: '9.5', cm: '28' },
  { br: '45', us: '12', uk: '10', cm: '28.5' },
]

const cm = (v) => v.replace('.', ',')

// Vai para o <body> num portal: aberto de dentro de outro modal (que tem
// transform), o position: fixed ficaria preso na caixa dele.
export default function SizeGuide({ isOpen, onClose }) {
  const titleId = useId()
  const closeRef = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!isOpen) return
    const previous = document.activeElement
    const raf = requestAnimationFrame(() => closeRef.current?.focus({ preventScroll: true }))
    // Captura antes dos outros ouvintes: o Esc fecha só o guia, não o modal de baixo.
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onCloseRef.current?.()
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKey, true)
      if (previous && typeof previous.focus === 'function') previous.focus({ preventScroll: true })
    }
  }, [isOpen])

  if (typeof document === 'undefined') return null

  return createPortal(
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className={styles.overlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            onClick={(e) => { e.stopPropagation(); onClose() }}
            data-lenis-prevent
          >
            <motion.div
              className={styles.modal}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              initial={{ opacity: 0, y: 14, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.99 }}
              transition={{ duration: 0.35, ease: EASE }}
              onClick={e => e.stopPropagation()}
            >
              <div className={styles.header}>
                <h3 id={titleId} className={styles.title}>Guia de tamanhos</h3>
                <button ref={closeRef} type="button" className={styles.closeBtn} onClick={onClose} aria-label="Fechar guia">
                  <FiX aria-hidden />
                </button>
              </div>

              <p className={styles.tip}>Meça o pé em centímetros e procure o número na coluna cm.</p>

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">BR</th>
                      <th scope="col">US</th>
                      <th scope="col">UK</th>
                      <th scope="col">cm</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sizeTable.map(row => (
                      <tr key={row.br}>
                        <th scope="row">{row.br}</th>
                        <td>{cm(row.us)}</td>
                        <td>{cm(row.uk)}</td>
                        <td>{cm(row.cm)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className={styles.howTo}>
                <h4>Como medir</h4>
                <ol>
                  <li>Pise numa folha de papel, encostado na parede, e marque a ponta do dedo mais comprido.</li>
                  <li>Meça com uma régua da borda da folha até a marca.</li>
                  <li>Compare com a coluna cm. Se ficar entre dois números, vá no maior.</li>
                </ol>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>,
    document.body
  )
}
