import { useState, useEffect } from 'react'
import { motion, AnimatePresence, MotionConfig } from 'framer-motion'
import { FiArrowUp } from 'react-icons/fi'
import { scrollToY } from '../../lib/motion'
import styles from './BackToTop.module.css'

const EASE = [0.22, 1, 0.36, 1]

export default function BackToTop() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 320)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {visible && (
          <motion.button
            type="button"
            className={styles.btn}
            // passa pelo Lenis quando a rolagem suave está ligada
            onClick={() => scrollToY(0)}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.3, ease: EASE }}
            aria-label="Voltar ao topo"
          >
            <FiArrowUp aria-hidden="true" />
          </motion.button>
        )}
      </AnimatePresence>
    </MotionConfig>
  )
}
