import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import axios from 'axios'
import { FiSearch, FiPackage, FiTruck, FiCheckCircle, FiXCircle, FiClock } from 'react-icons/fi'
import styles from './Track.module.css'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3305/api'

const STATUS_MAP = {
  pending:    { label: 'Aguardando pagamento', icon: FiClock,       color: '#f59e0b' },
  confirmed:  { label: 'Pedido confirmado',     icon: FiPackage,    color: '#3b82f6' },
  processing: { label: 'Em separação',          icon: FiPackage,    color: '#8b5cf6' },
  shipped:    { label: 'Enviado',               icon: FiTruck,      color: '#06b6d4' },
  delivered:  { label: 'Entregue',              icon: FiCheckCircle,color: '#4caf50' },
  cancelled:  { label: 'Cancelado',             icon: FiXCircle,    color: '#f44336' },
}

const STATUS_ORDER = ['pending', 'confirmed', 'processing', 'shipped', 'delivered']

export default function Track() {
  const [orderId, setOrderId] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [order, setOrder] = useState(null)

  const handleSearch = async (e) => {
    e.preventDefault()
    if (!orderId.trim() || !email.trim()) {
      setError('Preencha o número do pedido e o email.')
      return
    }
    setLoading(true)
    setError('')
    setOrder(null)
    try {
      const { data } = await axios.get(`${API}/orders/track`, {
        params: { id: orderId.trim(), email: email.trim() }
      })
      setOrder(data)
    } catch (err) {
      setError(err.response?.data?.message || 'Pedido não encontrado. Verifique os dados e tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
  const formatPrice = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

  const currentStep = order ? STATUS_ORDER.indexOf(order.status) : -1

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.header}>
          <FiPackage className={styles.headerIcon} />
          <h1>Rastrear pedido</h1>
          <p>Insira seu número de pedido e email para verificar o status</p>
        </div>

        <form onSubmit={handleSearch} className={styles.form}>
          <div className={styles.fields}>
            <input
              type="text"
              placeholder="Número do pedido (ex: 1234)"
              value={orderId}
              onChange={e => setOrderId(e.target.value)}
              className={styles.input}
            />
            <input
              type="email"
              placeholder="Email usado no pedido"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className={styles.input}
            />
          </div>
          <button type="submit" className={styles.btn} disabled={loading}>
            <FiSearch />
            {loading ? 'Buscando...' : 'Rastrear'}
          </button>
        </form>

        <AnimatePresence>
          {error && (
            <motion.p className={styles.error} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {order && (
            <motion.div
              className={styles.result}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              {/* Status badge */}
              {(() => {
                const s = STATUS_MAP[order.status] || { label: order.status, icon: FiPackage, color: '#888' }
                const Icon = s.icon
                return (
                  <div className={styles.statusBadge} style={{ color: s.color, borderColor: s.color + '44', background: s.color + '11' }}>
                    <Icon />
                    <span>{s.label}</span>
                  </div>
                )
              })()}

              {/* Progress bar */}
              {order.status !== 'cancelled' && (
                <div className={styles.progressWrap}>
                  {STATUS_ORDER.map((s, i) => {
                    const done = i <= currentStep
                    const active = i === currentStep
                    const sm = STATUS_MAP[s]
                    const Icon = sm.icon
                    return (
                      <div key={s} className={styles.step}>
                        <div className={`${styles.stepDot} ${done ? styles.done : ''} ${active ? styles.active : ''}`}>
                          <Icon />
                        </div>
                        <span className={`${styles.stepLabel} ${done ? styles.doneLabel : ''}`}>{sm.label}</span>
                        {i < STATUS_ORDER.length - 1 && (
                          <div className={`${styles.connector} ${i < currentStep ? styles.connectorDone : ''}`} />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Order meta */}
              <div className={styles.meta}>
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>Pedido</span>
                  <span className={styles.metaValue}>#{order.id}</span>
                </div>
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>Data</span>
                  <span className={styles.metaValue}>{formatDate(order.created_at)}</span>
                </div>
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>Total</span>
                  <span className={styles.metaValue}>{formatPrice(order.total)}</span>
                </div>
                {order.tracking_code && (
                  <div className={styles.metaItem}>
                    <span className={styles.metaLabel}>Código de rastreio</span>
                    <span className={`${styles.metaValue} ${styles.trackCode}`}>{order.tracking_code}</span>
                  </div>
                )}
              </div>

              {/* Items */}
              {order.items && order.items.length > 0 && (
                <div className={styles.items}>
                  <h3>Itens do pedido</h3>
                  {order.items.map((item, i) => (
                    <div key={i} className={styles.itemRow}>
                      <span className={styles.itemName}>{item.product_name}</span>
                      {item.size && <span className={styles.itemSize}>Tam: {item.size}</span>}
                      <span className={styles.itemQty}>× {item.quantity}</span>
                      <span className={styles.itemPrice}>{formatPrice(item.price * item.quantity)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Delivery info */}
              {(order.customer_name || order.customer_address) && (
                <div className={styles.delivery}>
                  <h3>Entrega</h3>
                  {order.customer_name && <p>{order.customer_name}</p>}
                  {order.customer_address && <p className={styles.address}>{order.customer_address}</p>}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
