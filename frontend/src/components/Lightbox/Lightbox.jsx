import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence, MotionConfig, animate, useMotionValue } from 'framer-motion'
import { FiX, FiChevronLeft, FiChevronRight, FiZoomIn, FiZoomOut } from 'react-icons/fi'
import { lockScroll } from '../../lib/motion'
import { useBackToClose } from '../../lib/layers'
import { MQ, matches } from '../../lib/breakpoints'
import { useSwipe } from '../../lib/useSwipe'
import styles from './Lightbox.module.css'

const EASE = [0.22, 1, 0.36, 1]

// a foto que chega entra pelo lado de onde o dedo puxou
const slide = {
  enter: (dir) => ({ opacity: 0, x: dir * 60 }),
  center: { opacity: 1, x: 0 },
  exit: (dir) => ({ opacity: 0, x: dir * -60 }),
}

export default function Lightbox({ images, startIndex = 0, isOpen, onClose, alt = '' }) {
  const [current, setCurrent] = useState(startIndex)
  const [dir, setDir] = useState(1)
  const [zoomed, setZoomed] = useState(false)
  const [bounds, setBounds] = useState(null) // até onde a foto ampliada anda
  const count = images?.length || 0
  const wrapRef = useRef(null)
  const imgRef = useRef(null)
  // posição da foto ampliada (arrastada com o dedo ou o mouse)
  const panX = useMotionValue(0)
  const panY = useMotionValue(0)
  const panned = useRef(0)

  useBackToClose(isOpen, onClose)

  useEffect(() => { setCurrent(startIndex); setZoomed(false) }, [startIndex, isOpen])

  const prev = useCallback(() => {
    if (count < 2) return
    setDir(-1)
    setCurrent(c => (c - 1 + count) % count)
    setZoomed(false)
  }, [count])
  const next = useCallback(() => {
    if (count < 2) return
    setDir(1)
    setCurrent(c => (c + 1) % count)
    setZoomed(false)
  }, [count])

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

  // Ampliada, a foto cresce por escala; o arrasto fica preso para a borda da
  // foto nunca descolar da borda da tela. Voltando ao tamanho normal, ela
  // desliza de volta ao centro.
  const scale = matches(MQ.phone) ? 2.2 : 2
  useEffect(() => {
    if (!zoomed) {
      setBounds(null)
      animate(panX, 0, { duration: 0.3, ease: EASE })
      animate(panY, 0, { duration: 0.3, ease: EASE })
      return
    }
    const img = imgRef.current
    const wrap = wrapRef.current
    if (!img || !wrap) return
    const w = img.offsetWidth * scale
    const h = img.offsetHeight * scale
    const dx = Math.max(0, (w - wrap.clientWidth) / 2)
    const dy = Math.max(0, (h - wrap.clientHeight) / 2)
    setBounds({ left: -dx, right: dx, top: -dy, bottom: dy })
  }, [zoomed, current, scale, panX, panY])

  // sem zoom, deslizar troca de foto
  const swipe = useSwipe({ enabled: !zoomed && count > 1, onNext: next, onPrev: prev })

  if (!images || count === 0) return null

  const label = (i) => (alt ? `${alt}, foto ${i + 1} de ${count}` : `Foto ${i + 1} de ${count}`)
  const toggleZoom = () => setZoomed(z => !z)

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
                  onClick={toggleZoom}
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

              {/* moldura desliza entre as fotos; a foto dentro dela amplia e
                  é arrastada quando ampliada */}
              <div className={styles.imgWrap} ref={wrapRef}>
                <AnimatePresence initial={false} custom={dir}>
                  <motion.div
                    key={current}
                    className={styles.frame}
                    custom={dir}
                    variants={slide}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.26, ease: EASE }}
                    {...swipe.bind}
                  >
                    <motion.img
                      ref={imgRef}
                      src={images[current]}
                      alt={label(current)}
                      className={`${styles.img} ${zoomed ? styles.zoomed : ''}`}
                      style={{ x: panX, y: panY }}
                      animate={{ scale: zoomed ? scale : 1 }}
                      transition={{ duration: 0.35, ease: EASE }}
                      drag={zoomed && bounds ? true : false}
                      dragConstraints={bounds || undefined}
                      dragElastic={0.08}
                      onDragStart={() => { panned.current = performance.now() }}
                      onDragEnd={() => { panned.current = performance.now() }}
                      onClick={() => {
                        // soltar o dedo depois de arrastar não conta como toque
                        if (swipe.justDragged() || performance.now() - panned.current < 250) return
                        toggleZoom()
                      }}
                      draggable={false}
                    />
                  </motion.div>
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
                        onClick={() => { setDir(i > current ? 1 : -1); setCurrent(i); setZoomed(false) }}
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
