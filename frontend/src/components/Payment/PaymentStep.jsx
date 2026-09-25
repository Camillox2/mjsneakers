import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { FiAlertTriangle, FiChevronLeft, FiCreditCard, FiLoader } from 'react-icons/fi'
import { MdPix } from 'react-icons/md'
import { getOrderPayment } from '../../lib/payments'
import PixPanel from './PixPanel'
import CardPanel from './CardPanel'
import styles from './Payment.module.css'

const EASE = [0.22, 1, 0.36, 1]
const brl = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0)

// valor do Pix com o desconto da loja (o servidor confirma o valor exato ao gerar)
export const pixValue = (total, pct) => Math.round(Number(total) * (100 - pct)) / 100

const panel = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.32, ease: EASE } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.16 } },
}

// Etapa de pagamento do checkout. O pedido já existe (o servidor devolveu o
// total e o access_token); aqui a pessoa escolhe Pix ou cartão.
//   onPaid({ method, installments, amount }): aprovado
//   onReview({ method, installments, amount }): cartão em análise
//   onCancelled(mensagem): pedido cancelado ou estornado, nada a pagar
// `fresh`: pedido criado agora (não precisa perguntar a situação ao servidor).
export default function PaymentStep({ order, config, fresh, onPaid, onReview, onCancelled }) {
  const [phase, setPhase] = useState(fresh ? 'choose' : 'checking') // checking | choose | pix | card
  const [notice, setNotice] = useState('')
  const [existingPix, setExistingPix] = useState(null)

  // Voltando para um pedido (recarregou a página, abriu pela sacola): o
  // servidor diz onde o pagamento parou.
  useEffect(() => {
    if (fresh) return undefined
    let alive = true
    getOrderPayment({ orderId: order.id, accessToken: order.access_token })
      .then((s) => {
        if (!alive) return
        const orderStatus = String(s?.order_status || '')
        if (orderStatus === 'cancelled' || orderStatus === 'canceled') {
          onCancelled('Este pedido foi cancelado, então não há nada para pagar.')
          return
        }
        const pay = { method: s?.payment_method, installments: s?.installments, amount: s?.amount }
        switch (s?.payment_status) {
          case 'approved':
            onPaid(pay)
            return
          case 'pending':
            if (s?.pix?.qr_code) {
              setExistingPix({ ...s.pix, amount: s.amount })
              setPhase('pix')
            } else {
              onReview(pay)
            }
            return
          case 'expired':
            setNotice('O Pix venceu. Gere outro ou pague com cartão.')
            break
          case 'rejected':
            setNotice('O último pagamento não passou. Tente de novo, com Pix ou outro cartão.')
            break
          case 'refunded':
          case 'charged_back':
            onCancelled('O pagamento deste pedido foi estornado. Se tiver dúvida, fale com a gente pelo chat.')
            return
          default:
            break
        }
        setPhase('choose')
      })
      .catch(() => alive && setPhase('choose'))
    return () => {
      alive = false
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const total = Number(order.total) || 0
  const pixTotal = config.pixDiscount > 0 ? pixValue(total, config.pixDiscount) : total
  const max = config.maxInstallments

  const choose = (next) => {
    setNotice('')
    setPhase(next)
  }

  return (
    <div className={styles.step}>
      {config.testMode && (
        <p className={styles.testStrip} role="note">
          Modo de teste: use os cartões de teste do Mercado Pago
        </p>
      )}

      <div className={styles.summary}>
        <span className={styles.summaryLabel}>Pedido #{order.id}</span>
        <span className={styles.summaryTotal}>{brl(total)}</span>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {phase === 'checking' && (
          <motion.p key="checking" className={styles.checking} role="status" {...panel}>
            <FiLoader className={styles.spin} aria-hidden="true" /> Conferindo o pagamento…
          </motion.p>
        )}

        {phase === 'choose' && (
          <motion.div key="choose" className={styles.choose} {...panel}>
            {notice && (
              <p className={styles.notice} role="alert">
                <FiAlertTriangle aria-hidden="true" /> {notice}
              </p>
            )}
            <p className={styles.chooseTitle}>Como você quer pagar?</p>
            <div className={styles.methods} role="group" aria-label="Forma de pagamento">
              <button type="button" className={styles.method} onClick={() => choose('pix')}>
                <span className={styles.methodIcon} aria-hidden="true"><MdPix /></span>
                <span className={styles.methodText}>
                  <span className={styles.methodName}>
                    Pix
                    {config.pixDiscount > 0 && <span className={styles.badge}>-{config.pixDiscount}%</span>}
                  </span>
                  <span className={styles.methodSub}>Aprovação na hora</span>
                </span>
                <span className={styles.methodValue}>
                  {config.pixDiscount > 0 && <span className={styles.methodOld}>{brl(total)}</span>}
                  {brl(pixTotal)}
                </span>
              </button>
              <button type="button" className={styles.method} onClick={() => choose('card')}>
                <span className={styles.methodIcon} aria-hidden="true"><FiCreditCard /></span>
                <span className={styles.methodText}>
                  <span className={styles.methodName}>Cartão de crédito</span>
                  <span className={styles.methodSub}>
                    {max > 1 ? `Em até ${max}x de ${brl(total / max)}` : 'À vista'}
                  </span>
                </span>
                <span className={styles.methodValue}>{brl(total)}</span>
              </button>
            </div>
            <p className={styles.secure}>Pagamento processado pelo Mercado Pago. A loja não vê nem guarda os dados do seu cartão.</p>
          </motion.div>
        )}

        {phase === 'pix' && (
          <motion.div key="pix" {...panel}>
            <button type="button" className={styles.backLink} onClick={() => choose('choose')}>
              <FiChevronLeft aria-hidden="true" /> Outras formas de pagamento
            </button>
            <PixPanel
              order={order}
              expectedAmount={pixTotal}
              initialPix={existingPix}
              onPix={setExistingPix}
              onPaid={onPaid}
              onCancelled={onCancelled}
            />
          </motion.div>
        )}

        {phase === 'card' && (
          <motion.div key="card" {...panel}>
            <button type="button" className={styles.backLink} onClick={() => choose('choose')}>
              <FiChevronLeft aria-hidden="true" /> Outras formas de pagamento
            </button>
            <CardPanel order={order} config={config} onPaid={onPaid} onReview={onReview} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
