import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FiX, FiChevronLeft, FiChevronRight, FiZoomIn, FiZoomOut } from 'react-icons/fi'
import styles from './Lightbox.module.css'

export default function Lightbox({ images, startIndex = 0, isOpen, onClose }) {
  const [current, setCurrent] = useState(startIndex)
  const [zoomed, setZoomed] = useState(false)

  useEffect(() => { setCurrent(startIndex); setZoomed(false) }, [startIndex, isOpen])

  const prev = useCallback(() => { setCurrent(c => (c - 1 + images.length) % images.length); setZoomed(false) }, [images.length])
  const next = useCallback(() => { setCurrent(c => (c + 1) % images.length); setZoomed(false) }, [images.length])

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

  if (!images || images.length === 0) return null

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div className={styles.overlay} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div className={styles.content} initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} onClick={e => e.stopPropagation()}>
            <button className={styles.close} onClick={onClose}><FiX /></button>
            <button className={styles.zoom} onClick={() => setZoomed(z => !z)}>
              {zoomed ? <FiZoomOut /> : <FiZoomIn />}
            </button>

            {images.length > 1 && (
              <>
                <button className={`${styles.nav} ${styles.navLeft}`} onClick={prev}><FiChevronLeft /></button>
                <button className={`${styles.nav} ${styles.navRight}`} onClick={next}><FiChevronRight /></button>
              </>
            )}

            <div className={styles.imgWrap}>
              <AnimatePresence mode="wait">
                <motion.img
                  key={current}
                  src={images[current]}
                  alt={`Imagem ${current + 1}`}
                  className={`${styles.img} ${zoomed ? styles.zoomed : ''}`}
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ duration: 0.18 }}
                  onClick={() => setZoomed(z => !z)}
                />
              </AnimatePresence>
            </div>

            {images.length > 1 && (
              <div className={styles.dots}>
                {images.map((_, i) => (
                  <button key={i} className={`${styles.dot} ${i === current ? styles.dotActive : ''}`} onClick={() => { setCurrent(i); setZoomed(false) }} />
                ))}
              </div>
            )}

            <div className={styles.counter}>{current + 1} / {images.length}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
