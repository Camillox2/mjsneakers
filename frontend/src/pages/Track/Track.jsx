import { useState } from 'react'
import { motion, AnimatePresence, MotionConfig } from 'framer-motion'
import axios from 'axios'
import { FiCheck, FiCopy, FiSearch, FiXCircle } from 'react-icons/fi'
import { getImageUrl } from '../../utils/imageHelper'
import styles from './Track.module.css'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3305/api'
const EASE = [0.22, 1, 0.36, 1]

// tone define a cor do selo: neutro (cromo), ok, atenção ou perigo
const STATUS_MAP = {
  pending:    { label: 'Aguardando pagamento', tone: 'warn' },
  confirmed:  { label: 'Pedido confirmado',    tone: 'neutral' },
  processing: { label: 'Em separação',         tone: 'neutral' },
  shipped:    { label: 'Enviado',              tone: 'neutral' },
  delivered:  { label: 'Entregue',             tone: 'ok' },
  cancelled:  { label: 'Cancelado',            tone: 'danger' },
}

const STATUS_ORDER = ['pending', 'confirmed', 'processing', 'shipped', 'delivered']

export default function Track() {
  const [orderId, setOrderId] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [order, setOrder] = useState(null)
  const [copied, setCopied] = useState(false)

  const handleSearch = async (e) => {
    e.preventDefault()
    // aceita "#1234" do e-mail de confirmação
    const cleanId = orderId.trim().replace(/^#/, '')
    if (!cleanId || !email.trim()) {
      setError('Preencha o número do pedido e o e-mail.')
      return
    }
    setLoading(true)
    setError('')
    setOrder(null)
    setCopied(false)
    try {
      const { data } = await axios.get(`${API}/orders/track`, {
        params: { id: cleanId, email: email.trim() }
      })
      setOrder(data)
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Pedido não encontrado. Confira o número e o e-mail e tente de novo.')
    } finally {
      setLoading(false)
    }
  }

  const copyCode = () => {
    if (!order?.tracking_code || !navigator.clipboard) return
    navigator.clipboard.writeText(order.tracking_code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : 'sem data'
  const formatPrice = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

  const currentStep = order ? STATUS_ORDER.indexOf(order.status) : -1
  const status = order ? (STATUS_MAP[order.status] || { label: order.status, tone: 'neutral' }) : null
  const place = order ? [order.address_city, order.address_state].filter(Boolean).join(' / ') : ''

  return (
    <MotionConfig reducedMotion="user">
      <main className={styles.page}>
        <div className={styles.container}>
          <header className={styles.header}>
            <h1 className={styles.title}>Rastrear pedido</h1>
            <p className={styles.lead}>Digite o número do pedido e o e-mail usado na compra.</p>
          </header>

          <form onSubmit={handleSearch} className={styles.form} noValidate>
            <div className={styles.fields}>
              <label className={styles.field}>
                <span>Número do pedido</span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="Ex.: 1234"
                  value={orderId}
                  onChange={e => setOrderId(e.target.value)}
                  className={styles.input}
                />
              </label>
              <label className={styles.field}>
                <span>E-mail da compra</span>
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="voce@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className={styles.input}
                />
              </label>
            </div>
            <button type="submit" className={`pz-btn ${styles.btn}`} disabled={loading}>
              <FiSearch aria-hidden="true" />
              {loading ? 'Buscando...' : 'Rastrear'}
            </button>
          </form>

          <AnimatePresence>
            {error && (
              <motion.p
                className={styles.error}
                role="alert"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: EASE }}
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {order && (
              <motion.section
                className={styles.result}
                aria-label={`Pedido ${order.id}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.45, ease: EASE }}
              >
                <div className={styles.resultHead}>
                  <div>
                    <span className={styles.orderLabel}>Pedido</span>
                    <span className={styles.orderId}>#{order.id}</span>
                  </div>
                  <span className={`${styles.statusBadge} ${styles[`tone_${status.tone}`]}`}>{status.label}</span>
                </div>

                {order.status === 'cancelled' ? (
                  <p className={styles.cancelled}>
                    <FiXCircle aria-hidden="true" />
                    Este pedido foi cancelado. Se tiver dúvida, fale com a gente pelo chat.
                  </p>
                ) : (
                  <ol className={styles.timeline} aria-label="Andamento do pedido">
                    {STATUS_ORDER.map((s, i) => {
                      const done = i <= currentStep
                      const active = i === currentStep
                      const lineDone = i < currentStep
                      return (
                        <li
                          key={s}
                          className={`${styles.step} ${done ? styles.stepDone : ''} ${active ? styles.stepActive : ''} ${lineDone ? styles.lineDone : ''}`}
                          aria-current={active ? 'step' : undefined}
                        >
                          <span className={styles.dot} aria-hidden="true">
                            {done && !active && <FiCheck />}
                          </span>
                          <span className={styles.stepText}>
                            <span className={styles.stepLabel}>{STATUS_MAP[s].label}</span>
                            {active && <span className={styles.stepNow}>Etapa atual</span>}
                          </span>
                        </li>
                      )
                    })}
                  </ol>
                )}

                <dl className={styles.meta}>
                  <div className={styles.metaItem}>
                    <dt>Data</dt>
                    <dd>{formatDate(order.created_at)}</dd>
                  </div>
                  <div className={styles.metaItem}>
                    <dt>Total</dt>
                    <dd className={styles.num}>{formatPrice(order.total)}</dd>
                  </div>
                  {order.tracking_code && (
                    <div className={`${styles.metaItem} ${styles.metaWide}`}>
                      <dt>Código de rastreio</dt>
                      <dd className={styles.codeRow}>
                        <span className={styles.trackCode}>{order.tracking_code}</span>
                        <button type="button" className={styles.copyBtn} onClick={copyCode}>
                          {copied ? <FiCheck aria-hidden="true" /> : <FiCopy aria-hidden="true" />}
                          {copied ? 'Copiado' : 'Copiar'}
                        </button>
                      </dd>
                    </div>
                  )}
                </dl>

                {order.items && order.items.length > 0 && (
                  <div className={styles.block}>
                    <h2 className={styles.blockTitle}>Itens do pedido</h2>
                    <ul className={styles.items}>
                      {order.items.map((item, i) => (
                        <li key={i} className={styles.itemRow}>
                          <img className={styles.itemImg} src={getImageUrl(item.image_url, item.product_name)} alt="" loading="lazy" />
                          <span className={styles.itemText}>
                            <span className={styles.itemName}>{item.product_name}</span>
                            <span className={styles.itemSub}>
                              {item.size ? `Tamanho ${item.size} · ` : ''}{item.quantity} {Number(item.quantity) === 1 ? 'par' : 'pares'}
                            </span>
                          </span>
                          <span className={styles.itemPrice}>{formatPrice(item.price * item.quantity)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {(order.customer_name || order.customer_address || place) && (
                  <div className={styles.block}>
                    <h2 className={styles.blockTitle}>Entrega</h2>
                    {order.customer_name && <p className={styles.deliveryName}>{order.customer_name}</p>}
                    {order.customer_address && <p className={styles.address}>{order.customer_address}</p>}
                    {!order.customer_address && place && <p className={styles.address}>{place}</p>}
                  </div>
                )}
              </motion.section>
            )}
          </AnimatePresence>
        </div>
      </main>
    </MotionConfig>
  )
}
