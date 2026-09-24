import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence, MotionConfig } from 'framer-motion'
import { FiX, FiChevronLeft, FiChevronRight, FiZoomIn, FiZoomOut } from 'react-icons/fi'
import { lockScroll } from '../../lib/motion'
import styles from './Lightbox.module.css'

const EASE = [0.22, 1, 0.36, 1]

export default function Lightbox({ images, startIndex = 0, isOpen, onClose, alt = '' }) {
  const [current, setCurrent] = useState(startIndex)
  const [zoomed, setZoomed] = useState(false)
  const count = images?.length || 0

  useEffect(() => { setCurrent(startIndex); setZoomed(false) }, [startIndex, isOpen])

  const prev = useCallback(() => { setCurrent(c => (c - 1 + count) % count); setZoomed(false) }, [count])
  const next = useCallback(() => { setCurrent(c => (c + 1) % count); setZoomed(false) }, [count])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') prev()
      else if (e.key === 'ArrowRight') next()
      else if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, prev, next, onClose])

  // página parada atrás da foto ampliada
  useEffect(() => {
    if (!isOpen) return
    lockScroll(true)
    return () => lockScroll(false)
  }, [isOpen])

  if (!images || count === 0) return null

  const label = (i) => (alt ? `${alt}, foto ${i + 1} de ${count}` : `Foto ${i + 1} de ${count}`)

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
            role="dialog"
            aria-modal="true"
            aria-label={alt ? `Fotos de ${alt}` : 'Fotos ampliadas'}
            data-lenis-prevent
          >
            <motion.div
              className={styles.content}
              initial={{ scale: 0.97 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.97 }}
              transition={{ duration: 0.35, ease: EASE }}
              onClick={e => e.stopPropagation()}
            >
              <div className={styles.toolbar}>
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={() => setZoomed(z => !z)}
                  aria-label={zoomed ? 'Diminuir zoom' : 'Aumentar zoom'}
                  aria-pressed={zoomed}
                >
                  {zoomed ? <FiZoomOut aria-hidden="true" /> : <FiZoomIn aria-hidden="true" />}
                </button>
                <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Fechar">
                  <FiX aria-hidden="true" />
                </button>
              </div>

              {count > 1 && (
                <>
                  <button type="button" className={`${styles.iconBtn} ${styles.nav} ${styles.navLeft}`} onClick={prev} aria-label="Foto anterior">
                    <FiChevronLeft aria-hidden="true" />
                  </button>
                  <button type="button" className={`${styles.iconBtn} ${styles.nav} ${styles.navRight}`} onClick={next} aria-label="Próxima foto">
                    <FiChevronRight aria-hidden="true" />
                  </button>
                </>
              )}

              <div className={styles.imgWrap}>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.img
                    key={current}
                    src={images[current]}
                    alt={label(current)}
                    className={`${styles.img} ${zoomed ? styles.zoomed : ''}`}
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={{ duration: 0.22, ease: EASE }}
                    onClick={() => setZoomed(z => !z)}
                    draggable={false}
                  />
                </AnimatePresence>
              </div>

              <div className={styles.footer}>
                {count > 1 && (
                  <div className={styles.dots} role="group" aria-label="Escolher foto">
                    {images.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        className={`${styles.dot} ${i === current ? styles.dotActive : ''}`}
                        onClick={() => { setCurrent(i); setZoomed(false) }}
                        aria-label={label(i)}
                        aria-current={i === current ? 'true' : undefined}
                      />
                    ))}
                  </div>
                )}
                <div className={styles.counter} aria-live="polite">{current + 1} de {count}</div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  )
}
