import { useEffect, useId, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { FiAlertCircle, FiMail } from 'react-icons/fi'
import { useAccount } from '../../lib/AccountContext'
import { isCaptchaError } from '../../services/api'
import Turnstile, { useTurnstile } from '../../components/Turnstile/Turnstile'
import CodeInput from '../../components/CodeInput/CodeInput'
import panel from '../../styles/panel.module.css'
import styles from './Account.module.css'

const EASE = [0.22, 1, 0.36, 1]
const step = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: EASE } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.18 } },
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const RESEND_AFTER = 60

// Entrar sem senha: e-mail (com captcha) e depois o código de 6 dígitos
// que chega por e-mail. Quem nunca comprou também entra: a conta nasce aqui.
export default function SignIn({ onSignedIn }) {
  const { requestCode, verify } = useAccount()
  const captcha = useTurnstile()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [phase, setPhase] = useState('email') // email | code
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [wait, setWait] = useState(0)
  const emailId = useId()

  useEffect(() => {
    if (wait <= 0) return undefined
    const t = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  const sendCode = async (e) => {
    e?.preventDefault()
    if (busy) return
    if (!EMAIL_RE.test(email.trim())) {
      setError('Confira o e-mail, parece incompleto.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const token = await captcha.getToken()
      await requestCode(email, token)
      setCode('')
      setPhase('code')
      setWait(RESEND_AFTER)
    } catch (err) {
      if (isCaptchaError(err)) captcha.reset()
      setError(err.response?.data?.error || err.message || 'Não deu para mandar o código agora. Tente de novo.')
    } finally {
      setBusy(false)
    }
  }

  const check = async (value = code) => {
    if (busy || String(value).length !== 6) return
    setBusy(true)
    setError('')
    try {
      const me = await verify(email, value)
      onSignedIn?.(me)
    } catch (err) {
      setError(err.response?.data?.error || 'Esse código não confere ou venceu. Confira no e-mail e tente de novo.')
      setBusy(false)
    }
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      {phase === 'email' ? (
        <motion.form key="email" className={panel.card} onSubmit={sendCode} noValidate {...step}>
          <p className={styles.signTitle}>Entre com o seu e-mail</p>
          <p className={panel.hint}>Sem senha: mandamos um código de 6 dígitos para o seu e-mail.</p>
          <label className={panel.field} htmlFor={emailId}>
            <span className={panel.label}>E-mail</span>
            <input
              id={emailId}
              className={panel.input}
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setError('')
              }}
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="send"
              placeholder="voce@email.com"
            />
          </label>
          <Turnstile captcha={captcha} />
          {error && <p className={panel.error} role="alert"><FiAlertCircle aria-hidden="true" /> {error}</p>}
          <button type="submit" className="pz-btn" disabled={busy}>
            <FiMail aria-hidden="true" /> {busy ? 'Enviando…' : 'Receber o código'}
          </button>
        </motion.form>
      ) : (
        <motion.div key="code" className={panel.card} {...step}>
          <p className={styles.signTitle}>Digite o código</p>
          <p className={panel.hint}>
            Enviamos para <strong style={{ color: 'var(--pz-text)' }}>{email.trim()}</strong>. Olhe também a caixa de spam.
          </p>
          <CodeInput value={code} onChange={(v) => { setCode(v); setError('') }} onComplete={check} disabled={busy} invalid={Boolean(error)} />
          {error && <p className={panel.error} role="alert"><FiAlertCircle aria-hidden="true" /> {error}</p>}
          <button type="button" className="pz-btn" onClick={() => check()} disabled={busy || code.length !== 6}>
            {busy ? 'Entrando…' : 'Entrar'}
          </button>
          <div className={styles.signRow}>
            <button type="button" className={panel.linkBtn} onClick={() => { setPhase('email'); setError('') }}>
              Trocar o e-mail
            </button>
            <button type="button" className={panel.linkBtn} onClick={sendCode} disabled={wait > 0 || busy}>
              {wait > 0 ? `Mandar de novo em ${wait}s` : 'Mandar outro código'}
            </button>
          </div>
          {/* o captcha continua montado para o "mandar outro código" */}
          <Turnstile captcha={captcha} />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
