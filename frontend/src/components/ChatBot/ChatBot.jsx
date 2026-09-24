import { useState, useRef, useEffect, useCallback } from 'react'
import { AnimatePresence, motion, MotionConfig } from 'framer-motion'
import { FiMessageCircle, FiX, FiSend, FiPackage, FiTruck, FiCreditCard, FiRepeat, FiTag } from 'react-icons/fi'
import api from '../../services/api'
import { BRAND } from '../../config/brand'
import styles from './ChatBot.module.css'

const EASE = [0.22, 1, 0.36, 1]

const QUICK_MESSAGES = [
  { text: 'Quais marcas vocês vendem?', icon: <FiPackage /> },
  { text: 'Como funciona o frete?', icon: <FiTruck /> },
  { text: 'Formas de pagamento?', icon: <FiCreditCard /> },
  { text: 'Como trocar um produto?', icon: <FiRepeat /> },
  { text: 'Tem cupom de desconto?', icon: <FiTag /> },
]

const GREETING = `Oi! Aqui é o atendimento da ${BRAND.name}. Pergunte sobre tamanho, frete, troca ou pagamento.`

export default function ChatBot() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([
    { role: 'model', text: GREETING }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesRef = useRef(null)
  const inputRef = useRef(null)

  // rola só a caixa de mensagens, sem mexer na página
  const scrollToBottom = useCallback(() => {
    const box = messagesRef.current
    if (box) box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, loading, scrollToBottom])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => inputRef.current?.focus(), 300)
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const sendMessage = async (text) => {
    const msg = text || input.trim()
    if (!msg || loading) return

    setInput('')
    const userMsg = { role: 'user', text: msg }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      const history = messages.slice(-10).map(m => ({ role: m.role, text: m.text }))
      const { data } = await api.post('/chat', { message: msg, history })
      setMessages(prev => [...prev, { role: 'model', text: data.reply }])
    } catch {
      setMessages(prev => [...prev, { role: 'model', text: 'Não consegui responder agora. Tente de novo ou escreva para contato@pizzant.com.br.' }])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const showQuickMessages = messages.length <= 1

  return (
    <MotionConfig reducedMotion="user">
      {/* Botão flutuante */}
      <AnimatePresence>
        {!open && (
          <motion.button
            type="button"
            className={styles.fab}
            onClick={() => setOpen(true)}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.3, ease: EASE }}
            aria-label="Abrir atendimento"
            aria-haspopup="dialog"
          >
            <FiMessageCircle aria-hidden="true" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Janela do chat */}
      <AnimatePresence>
        {open && (
          <motion.div
            className={styles.chatWindow}
            role="dialog"
            aria-label={`Atendimento ${BRAND.name}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.35, ease: EASE }}
          >
            <div className={styles.chatHeader}>
              <div className={styles.chatHeaderInfo}>
                <span className={styles.chatAvatar} aria-hidden="true">{BRAND.short.charAt(0)}</span>
                <div>
                  <span className={styles.chatName}>Atendimento {BRAND.short}</span>
                  <span className={styles.chatStatus}>
                    <span className={styles.statusDot} aria-hidden="true" /> Responde na hora
                  </span>
                </div>
              </div>
              <button type="button" className={styles.chatClose} onClick={() => setOpen(false)} aria-label="Fechar atendimento">
                <FiX aria-hidden="true" />
              </button>
            </div>

            <div className={styles.chatMessages} ref={messagesRef} data-lenis-prevent aria-live="polite">
              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  className={`${styles.message} ${msg.role === 'user' ? styles.messageUser : styles.messageBot}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, ease: EASE }}
                >
                  <span className="pz-visually-hidden">{msg.role === 'user' ? 'Você:' : 'Atendimento:'}</span>
                  <div className={`${styles.msgBubble} ${msg.role === 'user' ? styles.bubbleUser : styles.bubbleBot}`}>
                    {msg.text}
                  </div>
                </motion.div>
              ))}

              {loading && (
                <motion.div
                  className={`${styles.message} ${styles.messageBot}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <div className={`${styles.msgBubble} ${styles.bubbleBot}`}>
                    <span className="pz-visually-hidden">Escrevendo</span>
                    <div className={styles.typing} aria-hidden="true">
                      <span /><span /><span />
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            <AnimatePresence initial={false}>
              {showQuickMessages && (
                <motion.div
                  className={styles.quickMessages}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3, ease: EASE }}
                >
                  <div className={styles.quickInner}>
                    {QUICK_MESSAGES.map((qm) => (
                      <button
                        key={qm.text}
                        type="button"
                        className={styles.quickBtn}
                        onClick={() => sendMessage(qm.text)}
                      >
                        <span aria-hidden="true">{qm.icon}</span>
                        <span>{qm.text}</span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className={styles.chatInput}>
              <input
                ref={inputRef}
                className={styles.input}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Escreva sua pergunta"
                aria-label="Sua mensagem"
                disabled={loading}
                maxLength={2000}
              />
              <button
                type="button"
                className={styles.sendBtn}
                onClick={() => sendMessage()}
                disabled={!input.trim() || loading}
                aria-label="Enviar"
              >
                <FiSend aria-hidden="true" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  )
}
