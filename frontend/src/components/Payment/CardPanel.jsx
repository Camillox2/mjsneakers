import { useEffect, useRef, useState } from 'react'
import { FiAlertTriangle, FiLoader, FiRefreshCw } from 'react-icons/fi'
import { getMercadoPago, payWithCard } from '../../lib/payments'
import styles from './Payment.module.css'

let hostSeq = 0

// Cartão: o formulário é o Brick oficial do Mercado Pago (Card Payment). Os
// dados do cartão ficam dentro dele; para a loja só volta um token, que vai
// junto com o pedido para POST /payments/card.
export default function CardPanel({ order, config, onPaid, onReview }) {
  const containerRef = useRef(null)
  const [state, setState] = useState('loading') // loading | ready | failed
  const [message, setMessage] = useState('')
  const [attempt, setAttempt] = useState(0)
  // callbacks do pai numa ref: o Brick guarda as funções da hora em que nasceu
  const cb = useRef({ onPaid, onReview })
  cb.current = { onPaid, onReview }

  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined
    let alive = true
    let controller = null
    // cada montagem num nó próprio: no modo estrito do React o Brick nasce e
    // morre duas vezes, e um não pode apagar o outro
    const host = document.createElement('div')
    hostSeq += 1
    host.id = `pz-card-brick-${hostSeq}`
    container.appendChild(host)
    setState('loading')

    const settings = {
      initialization: {
        amount: Number(order.total),
        ...(order.email ? { payer: { email: order.email } } : {}),
      },
      customization: {
        paymentMethods: { maxInstallments: config.maxInstallments },
        visual: {
          style: {
            theme: 'dark',
            // cromo da loja no botão e nos destaques
            customVariables: {
              baseColor: '#e4e7ec',
              buttonTextColor: '#0a0a0b',
              formBackgroundColor: '#07080a',
              borderRadiusMedium: '14px',
              borderRadiusLarge: '22px',
            },
          },
        },
      },
      callbacks: {
        onReady: () => {
          if (alive) setState('ready')
        },
        onError: (error) => {
          // erro do próprio Brick. Crítico (chave, rede) derruba o formulário;
          // o resto é aviso de campo, que o Brick já mostra. Nada vai para o console.
          if (!alive) return
          if (error?.type === 'critical') setState('failed')
        },
        onSubmit: (cardFormData) =>
          new Promise((resolve) => {
            setMessage('')
            payWithCard({ orderId: order.id, accessToken: order.access_token, cardFormData })
              .then((res) => {
                const pay = { method: 'card', installments: res?.installments ?? cardFormData?.installments, amount: res?.amount }
                if (res?.status === 'approved') cb.current.onPaid(pay)
                else if (res?.status === 'in_process' || res?.status === 'pending') cb.current.onReview(pay)
                else setMessage(res?.message || 'O cartão foi recusado. Confira os dados ou tente outro cartão.')
                resolve()
              })
              .catch((err) => {
                setMessage(err.response?.data?.message || err.response?.data?.error || 'Não deu para processar o cartão agora. Tente de novo.')
                resolve()
              })
          }),
      },
    }

    getMercadoPago(config.publicKey)
      .then((mp) => mp.bricks().create('cardPayment', host.id, settings))
      .then((ctrl) => {
        if (alive) controller = ctrl
        else ctrl?.unmount?.()
      })
      .catch(() => {
        if (alive) setState('failed')
      })

    return () => {
      alive = false
      try {
        controller?.unmount?.()
      } catch {
        /* o Brick já tinha saído */
      }
      host.remove()
    }
  }, [order.id, order.access_token, order.total, order.email, config.publicKey, config.maxInstallments, attempt])

  return (
    <div className={styles.card}>
      <p className={styles.panelTitle}>Pague com cartão</p>
      {message && (
        <p className={styles.notice} role="alert">
          <FiAlertTriangle aria-hidden="true" /> {message}
        </p>
      )}
      {state === 'loading' && (
        <p className={styles.checking} role="status">
          <FiLoader className={styles.spin} aria-hidden="true" /> Carregando o pagamento seguro…
        </p>
      )}
      {state === 'failed' && (
        <div className={styles.failed} role="alert">
          <p className={styles.panelText}>
            O pagamento com cartão não carregou. Pode ser a conexão ou um bloqueador de anúncios. Tente de novo ou pague com Pix.
          </p>
          <button type="button" className={`pz-btn-ghost ${styles.wide}`} onClick={() => setAttempt((n) => n + 1)}>
            <FiRefreshCw aria-hidden="true" /> Tentar de novo
          </button>
        </div>
      )}
      <div ref={containerRef} className={`${styles.brick} ${state === 'ready' ? styles.brickOn : ''}`} />
    </div>
  )
}
