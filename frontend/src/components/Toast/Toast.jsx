import { createContext, useContext, useState, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { FiCheck, FiAlertCircle, FiInfo, FiX } from 'react-icons/fi'
import styles from './Toast.module.css'

const ToastContext = createContext()

export function useToast() {
  return useContext(ToastContext)
}

let toastId = 0

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

  const icons = { success: <FiCheck />, error: <FiAlertCircle />, info: <FiInfo /> }

  return (
    <ToastContext.Provider value={addToast}>
      {children}
      <div className={styles.toastContainer}>
        <AnimatePresence>
          {toasts.map(t => (
            <motion.div
              key={t.id}
              className={`${styles.toast} ${t.type === 'success' ? styles.toastSuccess : t.type === 'error' ? styles.toastError : styles.toastInfo}`}
              initial={{ opacity: 0, x: 100, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 100, scale: 0.9 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            >
              <span className={styles.toastIcon}>{icons[t.type]}</span>
              <span className={styles.toastMsg}>{t.message}</span>
              <button className={styles.toastClose} onClick={() => removeToast(t.id)}><FiX /></button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}
