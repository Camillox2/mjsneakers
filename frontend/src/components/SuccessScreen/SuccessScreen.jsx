import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import confetti from 'canvas-confetti'
import { FiCheckCircle, FiPackage, FiMail } from 'react-icons/fi'
import styles from './SuccessScreen.module.css'

export default function SuccessScreen({ order, onClose }) {
  const hasRun = useRef(false)

  useEffect(() => {
    if (hasRun.current) return
    hasRun.current = true

    const end = Date.now() + 2200
    const colors = ['#ffffff', '#aaaaaa', '#cccccc', '#888888']

    const frame = () => {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors,
        zIndex: 5000,
      })
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors,
        zIndex: 5000,
      })
      if (Date.now() < end) requestAnimationFrame(frame)
    }
    frame()
  }, [])

  const orderId = order?.id || order?.order_id || '—'
  const items = order?.items || []
  const total = order?.total != null ? Number(order.total) : null

  return (
    <motion.div
      className={styles.container}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 220, damping: 20 }}
    >
      <motion.div
        className={styles.iconWrap}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.15, type: 'spring', stiffness: 300 }}
      >
        <FiCheckCircle className={styles.icon} />
      </motion.div>

      <h2 className={styles.title}>Pedido realizado!</h2>
      <p className={styles.subtitle}>Obrigado pela sua compra 🎉</p>

      <div className={styles.card}>
        <div className={styles.row}>
          <FiPackage />
          <span>Pedido <strong>#{orderId}</strong></span>
        </div>
        {items.length > 0 && (
          <div className={styles.items}>
            {items.map((item, i) => (
              <span key={i} className={styles.item}>{item.product_name || item.name} × {item.quantity}</span>
            ))}
          </div>
        )}
        {total != null && (
          <div className={styles.total}>
            Total: <strong>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(total)}</strong>
          </div>
        )}
      </div>

      <div className={styles.info}>
        <FiMail />
        <span>Você receberá uma confirmação por email em breve</span>
      </div>

      <button className={styles.btn} onClick={onClose}>Continuar comprando</button>
    </motion.div>
  )
}
