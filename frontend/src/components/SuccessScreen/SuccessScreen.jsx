import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { FiCheck, FiClock, FiCreditCard, FiPackage, FiMail } from 'react-icons/fi'
import { MdPix } from 'react-icons/md'
import { releaseStock, clearCartSession } from '../../utils/stockSession'
import { cometShower } from '../../lib/comets'
import { paymentMethodLabel } from '../../lib/payments'
import styles from './SuccessScreen.module.css'

const EASE = [0.22, 1, 0.36, 1]

// order.payment (pagamento online): { method: 'pix' | 'card', installments,
// amount, status: 'approved' | 'review' }. Sem ele, é o pedido sem pagamento
// online de sempre.
export default function SuccessScreen({ order, onClose }) {
  const hasRun = useRef(false)
  const payment = order?.payment || null
  const review = payment?.status === 'review'

  useEffect(() => {
    if (hasRun.current) return
    hasRun.current = true

    // Pedido concluído: libera as reservas e zera a sessão de carrinho.
    releaseStock().finally(clearCartSession)

    // Chuva de cometas na tela toda (a mesma luz do céu da abertura); quem
    // pediu menos movimento não recebe. Em análise ainda não é festa.
    if (!review) cometShower(null, { count: 42, duration: 2400 })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const orderId = order?.id || order?.order_id || order?.orderId || null
  const items = order?.items || []
  // valores que o servidor calculou (ele recalcula preço, cupom e frete)
  const money = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null)
  const total = money(order?.total)
  const subtotal = money(order?.subtotal)
  const discount = money(order?.discount_amount)
  const shipping = money(order?.shipping_price)
  const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
  // o que foi pago de fato (o Pix pode ter desconto sobre o total do pedido)
  const paid = money(payment?.amount)
  const pixSaved = paid != null && total != null && total - paid > 0.004 ? total - paid : 0
  const isPix = payment && paymentMethodLabel(payment.method) === 'Pix'
  const methodText = payment
    ? review
      ? `${paymentMethodLabel(payment.method, payment.installments) || 'Cartão'}, em análise`
      : isPix
        ? 'Pago com Pix'
        : paymentMethodLabel(payment.method, payment.installments) || 'Pago'
    : ''

  return (
    <motion.div
      className={styles.container}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE }}
    >
      <motion.div
        className={`${styles.iconWrap} ${review ? styles.iconReview : ''}`}
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.12, duration: 0.45, ease: EASE }}
        aria-hidden
      >
        {review ? <FiClock className={styles.icon} /> : <FiCheck className={styles.icon} />}
      </motion.div>

      <h2 className={styles.title}>{review ? 'Pagamento em análise' : 'Pedido feito'}</h2>
      <p className={styles.subtitle}>
        {review ? 'Você recebe um e-mail quando o pagamento for aprovado.' : 'Obrigado pela compra.'}
      </p>

      <div className={styles.card}>
        <div className={styles.row}>
          <FiPackage aria-hidden />
          {orderId ? <span>Pedido <strong>#{orderId}</strong></span> : <span>Pedido registrado</span>}
        </div>
        {methodText && (
          <div className={`${styles.row} ${styles.payRow}`}>
            {isPix ? <MdPix aria-hidden /> : <FiCreditCard aria-hidden />}
            <span className={`${styles.payPill} ${review ? styles.payReview : styles.payOk}`}>{methodText}</span>
          </div>
        )}
        {items.length > 0 && (
          <ul className={styles.items}>
            {items.map((item, i) => (
              <li key={i} className={styles.item}>
                <span className={styles.itemName}>
                  {item.product_name || item.name}
                  {item.size && <span className={styles.itemSize}> · tam. {item.size}</span>}
                </span>
                <span className={styles.itemQty}>× {item.quantity}</span>
              </li>
            ))}
          </ul>
        )}
        {total != null && subtotal != null && (
          <dl className={styles.breakdown}>
            <div>
              <dt>Subtotal</dt>
              <dd>{fmt(subtotal)}</dd>
            </div>
            {discount > 0 && (
              <div className={styles.breakdownOk}>
                <dt>Desconto</dt>
                <dd>-{fmt(discount)}</dd>
              </div>
            )}
            {shipping != null && (
              <div>
                <dt>Frete</dt>
                <dd>{shipping > 0 ? fmt(shipping) : 'Grátis'}</dd>
              </div>
            )}
          </dl>
        )}
        {Number(order?.points_used) > 0 && (
          <dl className={styles.breakdown}>
            <div className={styles.breakdownOk}>
              <dt>Pontos usados ({Number(order.points_used).toLocaleString('pt-BR')})</dt>
              <dd>{Number(order.points_discount) > 0 ? `-${fmt(Number(order.points_discount))}` : 'aplicados'}</dd>
            </div>
          </dl>
        )}
        {pixSaved > 0 && (
          <dl className={styles.breakdown}>
            <div className={styles.breakdownOk}>
              <dt>Desconto do Pix</dt>
              <dd>-{fmt(pixSaved)}</dd>
            </div>
          </dl>
        )}
        {total != null && (
          <div className={styles.total}>
            <span>{payment && !review ? 'Total pago' : 'Total'}</span>
            <strong>{fmt(pixSaved > 0 ? paid : total)}</strong>
          </div>
        )}
      </div>

      <p className={styles.info}>
        <FiMail aria-hidden />
        <span>{review ? 'Assim que aprovar, a confirmação chega no seu e-mail.' : 'Você recebe a confirmação por e-mail em breve.'}</span>
      </p>

      <button type="button" className={`pz-btn ${styles.btn}`} onClick={onClose}>Continuar comprando</button>
    </motion.div>
  )
}
