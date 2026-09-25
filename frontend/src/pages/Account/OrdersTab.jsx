import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { FiCheck, FiChevronDown, FiCopy, FiPackage, FiTruck } from 'react-icons/fi'
import api from '../../services/api'
import { getImageUrl } from '../../utils/imageHelper'
import { PAYMENT_STATUS, paymentMethodLabel } from '../../lib/payments'
import { brl, copyText, orderStatus, shortDate } from '../../lib/format'
import styles from './Account.module.css'

const EASE = [0.22, 1, 0.36, 1]
const listOf = (data) => (Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : Array.isArray(data?.orders) ? data.orders : [])

// Pedidos da conta: a lista (GET /account/orders) e, ao abrir um, o detalhe
// (GET /account/orders/:id) com itens, endereço, pagamento e rastreio.
export default function OrdersTab() {
  const [orders, setOrders] = useState(null)
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState(null)

  useEffect(() => {
    let alive = true
    api.get('/account/orders')
      .then(({ data }) => alive && setOrders(listOf(data)))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [])

  if (failed) return <p className={styles.empty}>Não deu para carregar os pedidos agora. Tente de novo em instantes.</p>
  if (!orders) return <div className={styles.skeleton} aria-busy="true"><span /><span /><span /></div>
  if (!orders.length) {
    return (
      <div className={styles.emptyBox}>
        <span className={styles.emptyIcon} aria-hidden="true"><FiPackage /></span>
        <p className={styles.emptyTitle}>Nenhum pedido ainda</p>
        <p className={styles.empty}>Quando você comprar com este e-mail, o pedido aparece aqui.</p>
        <Link to="/#loja" className="pz-btn-ghost">Ver a loja</Link>
      </div>
    )
  }

  return (
    <ul className={styles.orders}>
      {orders.map((o) => (
        <OrderRow key={o.id} order={o} open={open === o.id} onToggle={() => setOpen((cur) => (cur === o.id ? null : o.id))} />
      ))}
    </ul>
  )
}

function OrderRow({ order, open, onToggle }) {
  const [detail, setDetail] = useState(null)
  const [failed, setFailed] = useState(false)
  const [copied, setCopied] = useState(false)
  const st = orderStatus(order.status)
  const pay = order.payment_status ? PAYMENT_STATUS[order.payment_status] : null

  useEffect(() => {
    if (!open || detail) return undefined
    let alive = true
    setFailed(false)
    api.get(`/account/orders/${encodeURIComponent(order.id)}`)
      .then(({ data }) => alive && setDetail(data?.order ? { ...data, ...data.order } : data))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [open, detail, order.id])

  const d = detail || {}
  const items = Array.isArray(d.items) ? d.items : []
  const tracking = d.tracking_code || order.tracking_code
  const method = paymentMethodLabel(d.payment_method || order.payment_method, d.installments ?? order.installments)
  const address = [
    [d.address_street, d.address_number].filter(Boolean).join(', '),
    d.address_complement,
    d.address_neighborhood,
    [d.address_city, d.address_state].filter(Boolean).join('/'),
  ].filter(Boolean).join(' · ') || d.customer_address || ''

  const copyTracking = async () => {
    if (!tracking) return
    if (await copyText(tracking)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <li className={`${styles.order} ${open ? styles.orderOpen : ''}`}>
      <button type="button" className={styles.orderHead} onClick={onToggle} aria-expanded={open}>
        <span className={styles.orderMain}>
          <span className={styles.orderId}>Pedido #{order.id}</span>
          <span className={styles.orderMeta}>
            {shortDate(order.created_at)}
            {order.items_count ? ` · ${order.items_count} ${Number(order.items_count) === 1 ? 'par' : 'pares'}` : ''}
          </span>
        </span>
        <span className={styles.orderSide}>
          <span className={styles.orderTotal}>{brl(order.total)}</span>
          <span className={`${styles.badge} ${styles[`tone_${st.tone}`] || ''}`}>{st.label}</span>
        </span>
        <FiChevronDown className={styles.chevron} aria-hidden="true" />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className={styles.orderBody}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
          >
            <div className={styles.orderInner}>
              {!detail && !failed && <p className={styles.empty}>Carregando o pedido…</p>}
              {failed && <p className={styles.empty}>Não deu para abrir este pedido agora.</p>}

              {items.length > 0 && (
                <ul className={styles.items}>
                  {items.map((it, i) => (
                    <li key={i} className={styles.item}>
                      <img src={getImageUrl(it.image_url, it.product_name)} alt="" loading="lazy" />
                      <span className={styles.itemText}>
                        <span className={styles.itemName}>{it.product_name}</span>
                        <span className={styles.itemSub}>
                          {it.size ? `Tamanho ${it.size} · ` : ''}{it.quantity} {Number(it.quantity) === 1 ? 'par' : 'pares'}
                        </span>
                      </span>
                      <span className={styles.itemPrice}>{brl(Number(it.price) * Number(it.quantity || 1))}</span>
                    </li>
                  ))}
                </ul>
              )}

              {detail && (
                <dl className={styles.facts}>
                  {pay && (
                    <div>
                      <dt>Pagamento</dt>
                      <dd>
                        <span className={`${styles.badge} ${styles[`tone_${pay.tone}`] || ''}`}>{pay.label}</span>
                        {method && <span className={styles.factNote}>{method}</span>}
                      </dd>
                    </div>
                  )}
                  {Number(d.points_used) > 0 && (
                    <div>
                      <dt>Pontos usados</dt>
                      <dd>{Number(d.points_used).toLocaleString('pt-BR')} pontos{Number(d.points_discount) > 0 ? ` (-${brl(d.points_discount)})` : ''}</dd>
                    </div>
                  )}
                  {address && (
                    <div>
                      <dt>Entrega</dt>
                      <dd>{address}</dd>
                    </div>
                  )}
                  {tracking && (
                    <div>
                      <dt>Código de rastreio</dt>
                      <dd className={styles.trackRow}>
                        <span className={styles.trackCode}>{tracking}</span>
                        <button type="button" className={styles.copyBtn} onClick={copyTracking}>
                          {copied ? <><FiCheck aria-hidden="true" /> Copiado</> : <><FiCopy aria-hidden="true" /> Copiar</>}
                        </button>
                      </dd>
                    </div>
                  )}
                </dl>
              )}

              <Link to={`/rastrear?pedido=${encodeURIComponent(order.id)}`} className={`pz-btn-ghost ${styles.trackLink}`}>
                <FiTruck aria-hidden="true" /> Acompanhar o pedido
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  )
}
