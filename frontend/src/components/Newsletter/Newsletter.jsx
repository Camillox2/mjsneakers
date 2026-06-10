import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FiMail, FiX, FiCheck } from 'react-icons/fi'
import axios from 'axios'
import styles from './Newsletter.module.css'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3305/api'

export default function Newsletter({ variant = 'footer' }) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle') // idle | loading | success | error
  const [msg, setMsg] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email.trim()) return
    setStatus('loading')
    try {
      await axios.post(`${API}/newsletter/subscribe`, { email: email.trim() })
      setStatus('success')
      setMsg('Inscrito! Verifique seu email para o cupom de 10% off 🎉')
      setEmail('')
    } catch (err) {
      setStatus('error')
      setMsg(err.response?.data?.message || 'Erro ao inscrever. Tente novamente.')
      setTimeout(() => setStatus('idle'), 3000)
    }
  }

  if (variant === 'popup') {
    return <NewsletterPopup onSubmit={handleSubmit} email={email} setEmail={setEmail} status={status} msg={msg} />
  }

  return (
    <div className={styles.footer}>
      <FiMail className={styles.icon} />
      <div className={styles.footerText}>
        <strong>Receba ofertas exclusivas</strong>
        <span>Ganhe 10% de desconto na primeira compra</span>
      </div>
      <form onSubmit={handleSubmit} className={styles.form}>
        <input
          type="email"
          placeholder="seu@email.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className={styles.input}
          disabled={status === 'loading' || status === 'success'}
        />
        <button type="submit" className={styles.btn} disabled={status === 'loading' || status === 'success'}>
          {status === 'loading' ? '...' : status === 'success' ? <FiCheck /> : 'Inscrever'}
        </button>
      </form>
      <AnimatePresence>
        {msg && (
          <motion.p
            className={`${styles.msg} ${status === 'error' ? styles.msgError : styles.msgSuccess}`}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          >
            {msg}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}

function NewsletterPopup({ onSubmit, email, setEmail, status, msg }) {
  const [closed, setClosed] = useState(false)

  if (closed) return null

  return (
    <AnimatePresence>
      <motion.div
        className={styles.overlay}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={() => setClosed(true)}
      >
        <motion.div
          className={styles.popup}
          initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.85, opacity: 0 }}
          onClick={e => e.stopPropagation()}
        >
          <button className={styles.closeBtn} onClick={() => setClosed(true)}><FiX /></button>
          <div className={styles.popupEmoji}>📧</div>
          <h2 className={styles.popupTitle}>10% OFF na primeira compra</h2>
          <p className={styles.popupSub}>Inscreva-se e receba um cupom exclusivo no seu email</p>
          <form onSubmit={onSubmit} className={styles.popupForm}>
            <input
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className={styles.popupInput}
              disabled={status === 'loading' || status === 'success'}
            />
            <button type="submit" className={styles.popupBtn} disabled={status === 'loading' || status === 'success'}>
              {status === 'loading' ? 'Enviando...' : status === 'success' ? '✓ Inscrito!' : 'Quero o cupom'}
            </button>
          </form>
          {msg && <p className={`${styles.msg} ${status === 'error' ? styles.msgError : styles.msgSuccess}`}>{msg}</p>}
          <button className={styles.skip} onClick={() => setClosed(true)}>Não, obrigado</button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
