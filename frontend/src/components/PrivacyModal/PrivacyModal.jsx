import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, MotionConfig } from 'framer-motion'
import { FiX } from 'react-icons/fi'
import Markdown from '../Markdown/Markdown'
import { formatLegalDate, loadLegal } from '../../lib/legal'
import { lockScroll } from '../../lib/motion'
import { useBackToClose } from '../../lib/layers'
import styles from './PrivacyModal.module.css'

const EASE = [0.22, 1, 0.36, 1]

// Política de privacidade em janela: o mesmo texto de /privacidade, vindo do
// admin por GET /legal (markdown simples, sem HTML cru).
export default function PrivacyModal({ isOpen, onClose }) {
  const [legal, setLegal] = useState(null)
  const [failed, setFailed] = useState(false)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useBackToClose(isOpen, () => closeRef.current?.())

  // Esc fecha; a página atrás fica parada enquanto o texto está aberto
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e) => { if (e.key === 'Escape') closeRef.current?.() }
    window.addEventListener('keydown', onKey)
    lockScroll(true)
    return () => {
      window.removeEventListener('keydown', onKey)
      lockScroll(false)
    }
  }, [isOpen])

  // o texto só é pedido quando a janela abre
  useEffect(() => {
    if (!isOpen || legal) return undefined
    let alive = true
    setFailed(false)
    loadLegal()
      .then((data) => alive && setLegal(data))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [isOpen, legal])

  const page = legal?.pages?.privacy
  const updated = formatLegalDate(page?.updated_at)

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className={styles.overlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            onClick={onClose}
          >
            <motion.div
              className={styles.modal}
              role="dialog"
              aria-modal="true"
              aria-labelledby="privacidade-titulo"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.4, ease: EASE }}
              onClick={e => e.stopPropagation()}
            >
              <div className={styles.head}>
                <h2 id="privacidade-titulo" className={styles.title}>Política de privacidade</h2>
                <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Fechar política de privacidade">
                  <FiX aria-hidden="true" />
                </button>
              </div>

              <div className={styles.content} data-lenis-prevent>
                {updated && <p className={styles.updated}>Atualizado em {updated}</p>}
                {!legal && !failed && <p className={styles.updated}>Carregando o texto…</p>}
                {failed && (
                  <p>Não deu para carregar a política agora. Tente de novo em instantes ou abra a <a href="/privacidade" target="_blank" rel="noopener noreferrer">página de privacidade</a>.</p>
                )}
                {page?.content && <Markdown source={page.content} className={styles.md} />}
                {legal && (
                  <p className={styles.more}>
                    <a href="/privacidade" target="_blank" rel="noopener noreferrer">Abrir em uma página</a>
                    {' · '}
                    <a href="/meus-dados" target="_blank" rel="noopener noreferrer">Meus dados</a>
                  </p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  )
}
