import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { FiAlertTriangle, FiCheck, FiClock, FiCopy, FiExternalLink, FiLoader } from 'react-icons/fi'
import { createPix, formatCpf, getOrderPayment, isValidCpf, onlyDigits } from '../../lib/payments'
import styles from './Payment.module.css'

const brl = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0)
const POLL_MS = 4000
const SLOW_MS = 15000 // depois de um 429 (limite de consultas), espera mais

const two = (n) => String(n).padStart(2, '0')
function clock(sec) {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}:${two(m)}:${two(s % 60)}` : `${two(m)}:${two(s % 60)}`
}

// Copia com a API do navegador; sem ela (http, navegador de app), cai no
// jeito antigo com um campo escondido.
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const area = document.createElement('textarea')
      area.value = text
      area.setAttribute('readonly', '')
      area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none'
      document.body.appendChild(area)
      area.select()
      area.setSelectionRange(0, text.length)
      const ok = document.execCommand('copy')
      area.remove()
      return ok
    } catch {
      return false
    }
  }
}

// Pix: CPF (o Mercado Pago pede), QR code, copia e cola e a espera pela
// confirmação. No celular o copia e cola vem primeiro (ninguém escaneia a
// própria tela); no computador o QR ganha destaque.
export default function PixPanel({ order, expectedAmount, initialPix, onPix, onPaid, onCancelled }) {
  const [cpf, setCpf] = useState('')
  const [cpfError, setCpfError] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [pix, setPix] = useState(initialPix || null)
  const [status, setStatus] = useState('waiting') // waiting | expired | rejected
  const [left, setLeft] = useState(null) // segundos até vencer
  const [copied, setCopied] = useState(false)
  const cpfId = useId()
  const cpfErrorId = useId()
  const copyTimer = useRef(0)
  const paidRef = useRef(false)
  // callbacks do pai numa ref: a contagem re-renderiza a cada segundo e não
  // pode reiniciar a espera junto
  const cb = useRef({ onPaid, onCancelled })
  cb.current = { onPaid, onCancelled }

  const cpfOk = isValidCpf(cpf)

  const generate = async (e) => {
    e?.preventDefault()
    if (loading) return
    if (!cpfOk) {
      setCpfError(onlyDigits(cpf).length < 11 ? 'O CPF tem 11 números.' : 'Esse CPF não confere. Dá uma olhada nos números.')
      return
    }
    setCpfError('')
    setError('')
    setLoading(true)
    try {
      const data = await createPix({ orderId: order.id, accessToken: order.access_token, cpf })
      setPix(data)
      onPix?.(data)
      setStatus('waiting')
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Não deu para gerar o Pix agora. Tente de novo em instantes.')
    } finally {
      setLoading(false)
    }
  }

  // Contagem até o Pix vencer.
  useEffect(() => {
    if (!pix?.expires_at || status !== 'waiting') {
      setLeft(null)
      return undefined
    }
    const end = new Date(pix.expires_at).getTime()
    if (!Number.isFinite(end)) return undefined
    const tick = () => {
      const s = (end - Date.now()) / 1000
      setLeft(s)
      if (s <= 0) setStatus('expired')
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [pix?.expires_at, status])

  // Espera a confirmação: pergunta ao servidor a cada 4 s, só com a aba à
  // vista (escondida, para; voltando, pergunta na hora).
  const poll = useCallback(async () => {
    const s = await getOrderPayment({ orderId: order.id, accessToken: order.access_token })
    const orderStatus = String(s?.order_status || '')
    if (orderStatus === 'cancelled' || orderStatus === 'canceled') return 'cancelled'
    return s?.payment_status || 'pending'
  }, [order.id, order.access_token])

  useEffect(() => {
    if (!pix || status !== 'waiting') return undefined
    let alive = true
    let timer = 0
    const schedule = (ms) => {
      clearTimeout(timer)
      timer = setTimeout(run, ms)
    }
    const run = async () => {
      if (!alive) return
      if (document.hidden) return // volta pelo visibilitychange
      try {
        const next = await poll()
        if (!alive) return
        if (next === 'approved') {
          if (paidRef.current) return
          paidRef.current = true
          cb.current.onPaid({ method: 'pix', amount: pix.amount ?? expectedAmount })
          return
        }
        if (next === 'cancelled') {
          cb.current.onCancelled('Este pedido foi cancelado, então o Pix não vale mais.')
          return
        }
        if (next === 'expired') {
          setStatus('expired')
          return
        }
        if (next === 'rejected') {
          setStatus('rejected')
          return
        }
        schedule(POLL_MS)
      } catch (err) {
        if (!alive) return
        schedule(err?.response?.status === 429 ? SLOW_MS : POLL_MS)
      }
    }
    const onVisible = () => {
      if (!document.hidden) schedule(0)
    }
    document.addEventListener('visibilitychange', onVisible)
    schedule(POLL_MS)
    return () => {
      alive = false
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [pix, status, poll, expectedAmount])

  useEffect(() => () => clearTimeout(copyTimer.current), [])

  const copy = async () => {
    if (!pix?.qr_code) return
    const ok = await copyText(pix.qr_code)
    if (!ok) {
      setError('Não deu para copiar sozinho. Toque em "Ver o código" e copie à mão.')
      return
    }
    setError('')
    setCopied(true)
    clearTimeout(copyTimer.current)
    copyTimer.current = setTimeout(() => setCopied(false), 2500)
  }

  const again = () => {
    setPix(null)
    onPix?.(null)
    setStatus('waiting')
    setCopied(false)
  }

  // ---------- sem Pix ainda (ou venceu e vai gerar outro): CPF ----------
  if (!pix) {
    return (
      <form className={styles.pixForm} onSubmit={generate} noValidate>
        <p className={styles.panelTitle}>Pague com Pix</p>
        <p className={styles.panelText}>
          O Pix sai por <strong>{brl(expectedAmount)}</strong>. Informe o CPF de quem vai pagar para gerar o código.
        </p>
        <label className={styles.label} htmlFor={cpfId}>CPF</label>
        <input
          id={cpfId}
          className={`${styles.input} ${cpfError ? styles.inputError : ''}`}
          value={cpf}
          onChange={(e) => {
            setCpf(formatCpf(e.target.value))
            setCpfError('')
          }}
          onBlur={() => onlyDigits(cpf).length === 11 && !cpfOk && setCpfError('Esse CPF não confere. Dá uma olhada nos números.')}
          placeholder="000.000.000-00"
          inputMode="numeric"
          autoComplete="off"
          enterKeyHint="go"
          maxLength={14}
          aria-invalid={Boolean(cpfError)}
          aria-describedby={cpfError ? cpfErrorId : undefined}
        />
        {cpfError && <p id={cpfErrorId} className={styles.fieldError} role="alert">{cpfError}</p>}
        {error && <p className={styles.notice} role="alert"><FiAlertTriangle aria-hidden="true" /> {error}</p>}
        <button type="submit" className={`pz-btn ${styles.wide}`} disabled={loading}>
          {loading ? <><FiLoader className={styles.spin} aria-hidden="true" /> Gerando o Pix…</> : 'Gerar Pix'}
        </button>
      </form>
    )
  }

  // ---------- venceu ou não passou ----------
  if (status !== 'waiting') {
    return (
      <div className={styles.pixEnd} role="alert">
        <span className={styles.endIcon} aria-hidden="true"><FiClock /></span>
        <p className={styles.panelTitle}>{status === 'expired' ? 'O Pix venceu' : 'O Pix não passou'}</p>
        <p className={styles.panelText}>
          {status === 'expired'
            ? 'O tempo para pagar este código acabou. Gere outro, é rapidinho.'
            : 'O pagamento não foi concluído. Gere um Pix novo e tente de novo.'}
        </p>
        <button type="button" className={`pz-btn ${styles.wide}`} onClick={again}>Gerar outro</button>
      </div>
    )
  }

  // ---------- esperando o pagamento ----------
  const amount = pix.amount ?? expectedAmount
  const discount = Number(pix.discount_amount) || 0
  return (
    <div className={styles.pix}>
      <div className={styles.pixHead}>
        <p className={styles.panelTitle}>Pix de {brl(amount)}</p>
        {discount > 0 && <p className={styles.pixSaved}>Você economiza {brl(discount)} pagando com Pix.</p>}
        <p className={styles.waiting} role="status">
          <span className={styles.pulse} aria-hidden="true" />
          Esperando o pagamento
          {left != null && left > 0 && (
            <span className={styles.countdown}>
              <FiClock aria-hidden="true" /> vence em <span className={styles.clock}>{clock(left)}</span>
            </span>
          )}
        </p>
      </div>

      <div className={styles.pixMain}>
        <div className={styles.pixActions}>
          <button type="button" className={`pz-btn ${styles.wide} ${styles.copyBtn}`} onClick={copy} aria-live="polite">
            {copied ? <><FiCheck aria-hidden="true" /> Código copiado</> : <><FiCopy aria-hidden="true" /> Copiar código Pix</>}
          </button>
          <p className={styles.howTo}>No app do banco, escolha Pix e depois <strong>Pix copia e cola</strong>.</p>
          {pix.ticket_url && (
            <a className={`pz-btn-ghost ${styles.wide}`} href={pix.ticket_url} target="_blank" rel="noopener noreferrer">
              <FiExternalLink aria-hidden="true" /> Abrir no app do banco
            </a>
          )}
          <details className={styles.codeBox}>
            <summary>Ver o código</summary>
            <textarea className={styles.code} readOnly value={pix.qr_code} rows={4} onFocus={(e) => e.target.select()} aria-label="Código Pix copia e cola" />
          </details>
          {error && <p className={styles.notice} role="alert"><FiAlertTriangle aria-hidden="true" /> {error}</p>}
        </div>

        {pix.qr_code_base64 && (
          <figure className={styles.qr}>
            <img
              src={`data:image/png;base64,${pix.qr_code_base64}`}
              alt={`QR code do Pix de ${brl(amount)} para o pedido ${order.id}. Se não conseguir escanear, use o botão Copiar código Pix.`}
              width="220"
              height="220"
            />
            <figcaption>Ou escaneie com a câmera do app do banco</figcaption>
          </figure>
        )}
      </div>
    </div>
  )
}
