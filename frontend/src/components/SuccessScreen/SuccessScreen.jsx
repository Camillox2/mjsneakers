import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import confetti from 'canvas-confetti'
import { FiCheck, FiPackage, FiMail } from 'react-icons/fi'
import { releaseStock, clearCartSession } from '../../utils/stockSession'
import styles from './SuccessScreen.module.css'

const EASE = [0.22, 1, 0.36, 1]

export default function SuccessScreen({ order, onClose }) {
  const hasRun = useRef(false)

  useEffect(() => {
    if (hasRun.current) return
    hasRun.current = true

    // Pedido concluído: libera as reservas e zera a sessão de carrinho.
    releaseStock().finally(clearCartSession)

    // Confete em tons de cromo; quem pediu menos movimento não recebe.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    const end = Date.now() + 2200
    const colors = ['#ffffff', '#e4e7ec', '#cdd1d8', '#8a9099']

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

  const orderId = order?.id || order?.order_id || order?.orderId || null
  const items = order?.items || []
  const total = order?.total != null ? Number(order.total) : null
  const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

  return (
    <motion.div
      className={styles.container}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE }}
    >
      <motion.div
        className={styles.iconWrap}
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.12, duration: 0.45, ease: EASE }}
        aria-hidden
      >
        <FiCheck className={styles.icon} />
      </motion.div>

      <h2 className={styles.title}>Pedido feito</h2>
      <p className={styles.subtitle}>Obrigado pela compra.</p>

      <div className={styles.card}>
        <div className={styles.row}>
          <FiPackage aria-hidden />
          {orderId ? <span>Pedido <strong>#{orderId}</strong></span> : <span>Pedido registrado</span>}
        </div>
        {items.length > 0 && (
          <ul className={styles.items}>
            {items.map((item, i) => (
              <li key={i} className={styles.item}>
                <span className={styles.itemName}>{item.product_name || item.name}</span>
                <span className={styles.itemQty}>× {item.quantity}</span>
              </li>
            ))}
          </ul>
        )}
        {total != null && (
          <div className={styles.total}>
            <span>Total</span>
            <strong>{fmt(total)}</strong>
          </div>
        )}
      </div>

      <p className={styles.info}>
        <FiMail aria-hidden />
        <span>Você recebe a confirmação por e-mail em breve.</span>
      </p>

      <button type="button" className={`pz-btn ${styles.btn}`} onClick={onClose}>Continuar comprando</button>
    </motion.div>
  )
}
