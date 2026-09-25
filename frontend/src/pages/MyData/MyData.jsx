import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { FiAlertCircle, FiArrowLeft, FiCheck, FiDownload, FiBellOff, FiEdit3, FiTrash2 } from 'react-icons/fi'
import { BRAND } from '../../config/brand'
import api, { captchaHeaders, isCaptchaError } from '../../services/api'
import Turnstile, { useTurnstile } from '../../components/Turnstile/Turnstile'
import CodeInput from '../../components/CodeInput/CodeInput'
import panel from '../../styles/panel.module.css'

const EASE = [0.22, 1, 0.36, 1]
const step = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: EASE } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.18 } },
}

// Tipos de pedido do titular (LGPD), com rótulos simples.
const TYPES = [
  { value: 'access', label: 'Quero uma cópia dos meus dados', icon: FiDownload },
  { value: 'correction', label: 'Corrigir dados', icon: FiEdit3 },
  { value: 'deletion', label: 'Apagar meus dados', icon: FiTrash2 },
  { value: 'revoke_marketing', label: 'Parar de receber e-mails', icon: FiBellOff },
]

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// /meus-dados: pedido do titular (LGPD). Passo 1: tipo, e-mail e mensagem
// (com captcha) em POST /privacy/requests. Passo 2: o código de 6 dígitos que
// chega no e-mail confirma que o pedido é de quem é dono do endereço.
export default function MyData() {
  const [type, setType] = useState('access')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [requestId, setRequestId] = useState(null)
  const [code, setCode] = useState('')
  const [phase, setPhase] = useState('form') // form | code | done
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const captcha = useTurnstile()
  const emailId = useId()
  const msgId = useId()

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    if (!EMAIL_RE.test(email.trim())) {
      setError('Confira o e-mail, parece incompleto.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const token = await captcha.getToken()
      const { data } = await api.post('/privacy/requests', { type, email: email.trim(), message: message.trim() }, captchaHeaders(token))
      setRequestId(data?.id)
      setCode('')
      setPhase('code')
    } catch (err) {
      if (isCaptchaError(err)) captcha.reset()
      setError(err.response?.data?.error || err.message || 'Não deu para enviar o pedido agora. Tente de novo.')
    } finally {
      setBusy(false)
    }
  }

  const verify = async (value = code) => {
    if (busy || String(value).length !== 6 || !requestId) return
    setBusy(true)
    setError('')
    try {
      await api.post(`/privacy/requests/${encodeURIComponent(requestId)}/verify`, { code: value })
      setPhase('done')
    } catch (err) {
      setError(err.response?.data?.error || 'Esse código não confere ou venceu. Confira no e-mail e tente de novo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className={panel.page}>
      <title>{`Meus dados | ${BRAND.name}`}</title>
      <div className={panel.container}>
        <Link to="/" className={panel.back}>
          <FiArrowLeft aria-hidden="true" /> Voltar para a loja
        </Link>
        <h1 className={panel.title}>Meus dados</h1>
        <p className={panel.lead}>
          Peça uma cópia, a correção ou a exclusão dos seus dados, ou pare de receber e-mails. É só confirmar com um código no seu e-mail.
        </p>

        <AnimatePresence mode="wait" initial={false}>
          {phase === 'form' && (
            <motion.form key="form" className={panel.card} onSubmit={submit} noValidate {...step}>
              <fieldset className={panel.field} style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className={panel.label} style={{ marginBottom: 8 }}>O que você precisa?</legend>
                <div className={panel.choices} role="radiogroup">
                  {TYPES.map((t) => {
                    const Icon = t.icon
                    const on = type === t.value
                    return (
                      <button
                        key={t.value}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        className={`${panel.choice} ${on ? panel.choiceOn : ''}`}
                        onClick={() => setType(t.value)}
                      >
                        <Icon aria-hidden="true" /> {t.label}
                      </button>
                    )
                  })}
                </div>
              </fieldset>

              {type === 'deletion' && (
                <p className={panel.hint}>
                  Pedidos com nota fiscal ficam guardados pelo prazo que a lei exige; o resto é apagado.
                </p>
              )}

              <label className={panel.field} htmlFor={emailId}>
                <span className={panel.label}>E-mail usado na loja</span>
                <input
                  id={emailId}
                  className={panel.input}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  enterKeyHint="next"
                  placeholder="voce@email.com"
                />
              </label>

              <label className={panel.field} htmlFor={msgId}>
                <span className={panel.label}>Mensagem (opcional)</span>
                <textarea
                  id={msgId}
                  className={panel.textarea}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  maxLength={2000}
                  placeholder={type === 'correction' ? 'Conte o que precisa ser corrigido.' : 'Se quiser, conte mais detalhes.'}
                />
              </label>

              <Turnstile captcha={captcha} />
              {error && <p className={panel.error} role="alert"><FiAlertCircle aria-hidden="true" /> {error}</p>}

              <button type="submit" className="pz-btn" disabled={busy}>
                {busy ? 'Enviando…' : 'Enviar pedido'}
              </button>
            </motion.form>
          )}

          {phase === 'code' && (
            <motion.div key="code" className={panel.card} {...step}>
              <p className={panel.label}>Enviamos um código de 6 dígitos para <strong style={{ color: 'var(--pz-text)' }}>{email.trim()}</strong>.</p>
              <CodeInput value={code} onChange={setCode} onComplete={verify} disabled={busy} invalid={Boolean(error)} />
              {error && <p className={panel.error} role="alert"><FiAlertCircle aria-hidden="true" /> {error}</p>}
              <div className={panel.actions}>
                <button type="button" className="pz-btn" onClick={() => verify()} disabled={busy || code.length !== 6}>
                  {busy ? 'Conferindo…' : 'Confirmar pedido'}
                </button>
              </div>
              <button type="button" className={panel.linkBtn} onClick={() => { setPhase('form'); setError('') }}>
                Voltar e corrigir o e-mail
              </button>
            </motion.div>
          )}

          {phase === 'done' && (
            <motion.div key="done" className={`${panel.card} ${panel.done}`} role="status" {...step}>
              <span className={panel.doneIcon} aria-hidden="true"><FiCheck /></span>
              <p className={panel.doneTitle}>Recebemos.</p>
              <p className={panel.doneText}>Respondemos em até 15 dias, no e-mail {email.trim()}.</p>
              <Link to="/" className="pz-btn-ghost">Voltar para a loja</Link>
            </motion.div>
          )}
        </AnimatePresence>

        <p className={panel.hint} style={{ marginTop: 20 }}>
          Veja como cuidamos dos seus dados na <Link to="/privacidade" style={{ textDecoration: 'underline' }}>Política de privacidade</Link>.
        </p>
      </div>
    </main>
  )
}
