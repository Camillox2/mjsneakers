import { createContext, useContext, useState, useCallback } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { FiX } from 'react-icons/fi'
import styles from './Toast.module.css'

const ToastContext = createContext()

export function useToast() {
  return useContext(ToastContext)
}

let toastId = 0

const EASE = [0.22, 1, 0.36, 1]
const TYPE_CLASS = { success: styles.toastSuccess, error: styles.toastError, info: styles.toastInfo }

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((message, type = 'success', duration = 3000) => {
    const id = ++toastId
    setToasts(prev => [...prev, { id, message, type }])
    if (duration > 0) {
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration)
    }
  }, [])

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={addToast}>
      {children}
      <MotionConfig reducedMotion="user">
        <div className={styles.toastContainer} role="status" aria-live="polite">
          <AnimatePresence initial={false}>
            {toasts.map(t => (
              <motion.div
                key={t.id}
                layout
                className={`${styles.toast} ${TYPE_CLASS[t.type] || styles.toastInfo}`}
                initial={{ opacity: 0, y: -10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.18, ease: 'easeIn' } }}
                transition={{ duration: 0.35, ease: EASE }}
              >
                <span className={styles.toastDot} aria-hidden />
                <span className={styles.toastMsg}>{t.message}</span>
                <button type="button" className={styles.toastClose} onClick={() => removeToast(t.id)} aria-label="Fechar aviso">
                  <FiX aria-hidden />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </MotionConfig>
    </ToastContext.Provider>
  )
}
