import { useState } from 'react'
import { motion, AnimatePresence, MotionConfig } from 'framer-motion'
import { FiMail, FiX, FiCheck } from 'react-icons/fi'
import axios from 'axios'
import { cometShower } from '../../lib/comets'
import styles from './Newsletter.module.css'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3305/api'
const EASE = [0.22, 1, 0.36, 1]

export default function Newsletter({ variant = 'footer' }) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle') // idle | loading | success | error
  const [msg, setMsg] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email.trim()) return
    // a chuva de cometas cai dentro da seção (ou da janela) da inscrição
    const zone = e.currentTarget.closest('section, [role="dialog"]')
    setStatus('loading')
    try {
      await axios.post(`${API}/newsletter/subscribe`, { email: email.trim() })
      const box = zone?.getBoundingClientRect()
      cometShower(box && box.width ? box : null, { count: 18, duration: 1500 })
      setStatus('success')
      setMsg('Pronto. O cupom de 10% vai para o seu e-mail.')
      setEmail('')
    } catch (err) {
      setStatus('error')
      setMsg(err.response?.data?.error || err.response?.data?.message || 'Não deu para inscrever agora. Tente de novo.')
      setTimeout(() => setStatus('idle'), 3000)
    }
  }

  if (variant === 'popup') {
    return <NewsletterPopup onSubmit={handleSubmit} email={email} setEmail={setEmail} status={status} msg={msg} />
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
              placeholder="voce@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className={styles.input}
              disabled={busy}
            />
            <button type="submit" className={`pz-btn ${styles.btn}`} disabled={busy}>
              {status === 'loading' ? 'Enviando...' : status === 'success' ? <><FiCheck aria-hidden="true" /> Inscrito</> : 'Inscrever'}
            </button>
          </form>
          <div aria-live="polite">
            <AnimatePresence>
              {msg && (
                <motion.p
                  className={`${styles.msg} ${status === 'error' ? styles.msgError : styles.msgSuccess}`}
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

function NewsletterPopup({ onSubmit, email, setEmail, status, msg }) {
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
                className={styles.input}
                disabled={busy}
              />
              <button type="submit" className="pz-btn" disabled={busy}>
                {status === 'loading' ? 'Enviando...' : status === 'success' ? <><FiCheck aria-hidden="true" /> Inscrito</> : 'Quero o cupom'}
              </button>
            </form>
            {msg && (
              <p className={`${styles.msg} ${status === 'error' ? styles.msgError : styles.msgSuccess}`} aria-live="polite">{msg}</p>
            )}
            <button type="button" className={styles.skip} onClick={() => setClosed(true)}>Agora não</button>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    </MotionConfig>
  )
}
