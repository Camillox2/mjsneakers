import { useState } from 'react'
import { motion, AnimatePresence, MotionConfig } from 'framer-motion'
import { FiMail, FiX, FiCheck } from 'react-icons/fi'
import api, { captchaHeaders, isCaptchaError } from '../../services/api'
import { cometShower } from '../../lib/comets'
import Turnstile, { useTurnstile } from '../Turnstile/Turnstile'
import PrivacyModal from '../PrivacyModal/PrivacyModal'
import styles from './Newsletter.module.css'

const EASE = [0.22, 1, 0.36, 1]

// O backend responde a inscrição de três jeitos:
//   201 subscribed: e-mail novo, ganha o cupom (chuva de cometas);
//   200 returning: e-mail que tinha saído e voltou (chuva também);
//   409 already: já está na lista (sem chuva, aviso neutro, não é erro).
const MESSAGES = {
  subscribed: 'Pronto. O cupom de 10% vai para o seu e-mail.',
  returning: 'Que bom ter você de volta. Os próximos drops chegam no seu e-mail.',
  already: 'Esse e-mail já está na nossa lista. Os próximos drops chegam por lá.',
}

export default function Newsletter({ variant = 'footer' }) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle') // idle | loading | success | already | error
  const [msg, setMsg] = useState('')
  const [privacyOpen, setPrivacyOpen] = useState(false)
  // captcha só entra em cena quando a pessoa vai digitar (o script da
  // Cloudflare não baixa para quem só passa pela seção)
  const captcha = useTurnstile()
  const [armed, setArmed] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email.trim() || status === 'loading') return
    // a chuva de cometas cai dentro da seção (ou da janela) da inscrição
    const zone = e.currentTarget.closest('section, [role="dialog"]')
    setArmed(true)
    setStatus('loading')
    try {
      const token = await captcha.getToken()
      const res = await api.post('/newsletter/subscribe', { email: email.trim() }, captchaHeaders(token))
      const kind = res.data?.status === 'returning' ? 'returning' : 'subscribed'
      const box = zone?.getBoundingClientRect()
      cometShower(box && box.width ? box : null, { count: 18, duration: 1500 })
      setStatus('success')
      setMsg(MESSAGES[kind])
      setEmail('')
    } catch (err) {
      if (err.response?.status === 409) {
        // já inscrito: nada de erro vermelho nem de chuva
        setStatus('already')
        setMsg(MESSAGES.already)
        return
      }
      if (isCaptchaError(err)) captcha.reset()
      setStatus('error')
      setMsg(err.response?.data?.error || err.response?.data?.message || err.message || 'Não deu para inscrever agora. Tente de novo.')
    }
  }

  // mexeu no e-mail depois de um aviso: o aviso sai
  const typeEmail = (value) => {
    setEmail(value)
    if (status === 'already' || status === 'error') {
      setStatus('idle')
      setMsg('')
    }
  }

  const msgClass = status === 'error' ? styles.msgError : status === 'already' ? styles.msgNeutral : styles.msgSuccess

  const consent = (
    <p className={styles.consent}>
      Ao se inscrever, você concorda com a{' '}
      <button type="button" className={styles.consentLink} onClick={() => setPrivacyOpen(true)}>Política de privacidade</button>.
      <PrivacyModal isOpen={privacyOpen} onClose={() => setPrivacyOpen(false)} />
    </p>
  )

  if (variant === 'popup') {
    return (
      <NewsletterPopup onSubmit={handleSubmit} email={email} setEmail={typeEmail} status={status} msg={msg} msgClass={msgClass} onArm={() => setArmed(true)}>
        {armed && <Turnstile captcha={captcha} />}
        {consent}
      </NewsletterPopup>
    )
  }

  const busy = status === 'loading' || status === 'success'

  return (
    <MotionConfig reducedMotion="user">
      <div className={styles.footer}>
        <div className={styles.footerText}>
          <h2 className={styles.footerTitle}>Os próximos drops no seu e-mail</h2>
          <p>Inscreva-se e ganhe 10% de desconto na primeira compra.</p>
        </div>
        <div className={styles.formWrap}>
          <form onSubmit={handleSubmit} className={styles.form}>
            <label className="pz-visually-hidden" htmlFor="newsletter-email">Seu e-mail</label>
            <input
              id="newsletter-email"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="send"
              placeholder="voce@email.com"
              value={email}
              onChange={e => typeEmail(e.target.value)}
              onFocus={() => setArmed(true)}
              className={styles.input}
              disabled={busy}
            />
            <button type="submit" className={`pz-btn ${styles.btn}`} disabled={busy}>
              {status === 'loading' ? 'Enviando...' : status === 'success' ? <><FiCheck aria-hidden="true" /> Inscrito</> : 'Inscrever'}
            </button>
          </form>
          {armed && <Turnstile captcha={captcha} />}
          {consent}
          <div aria-live="polite">
            <AnimatePresence>
              {msg && (
                <motion.p
                  key={msg}
                  className={`${styles.msg} ${msgClass}`}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3, ease: EASE }}
                >
                  {msg}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </MotionConfig>
  )
}

function NewsletterPopup({ onSubmit, email, setEmail, status, msg, msgClass, onArm, children }) {
  const [closed, setClosed] = useState(false)

  if (closed) return null

  const busy = status === 'loading' || status === 'success'

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        <motion.div
          className={styles.overlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: EASE }}
          onClick={() => setClosed(true)}
        >
          <motion.div
            className={styles.popup}
            role="dialog"
            aria-modal="true"
            aria-labelledby="newsletter-popup-titulo"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.4, ease: EASE }}
            onClick={e => e.stopPropagation()}
          >
            <button type="button" className={styles.closeBtn} onClick={() => setClosed(true)} aria-label="Fechar">
              <FiX aria-hidden="true" />
            </button>
            <span className={styles.popupIcon} aria-hidden="true"><FiMail /></span>
            <h2 id="newsletter-popup-titulo" className={styles.popupTitle}>10% na primeira compra</h2>
            <p className={styles.popupSub}>Deixe seu e-mail e o cupom chega em seguida.</p>
            <form onSubmit={onSubmit} className={styles.popupForm}>
              <label className="pz-visually-hidden" htmlFor="newsletter-popup-email">Seu e-mail</label>
              <input
                id="newsletter-popup-email"
                type="email"
                autoComplete="email"
                placeholder="voce@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onFocus={onArm}
                className={styles.input}
                disabled={busy}
              />
              <button type="submit" className="pz-btn" disabled={busy}>
                {status === 'loading' ? 'Enviando...' : status === 'success' ? <><FiCheck aria-hidden="true" /> Inscrito</> : 'Quero o cupom'}
              </button>
            </form>
            {children}
            {msg && (
              <p className={`${styles.msg} ${msgClass}`} aria-live="polite">{msg}</p>
            )}
            <button type="button" className={styles.skip} onClick={() => setClosed(true)}>Agora não</button>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    </MotionConfig>
  )
}
