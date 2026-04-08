import { useState, useRef, useEffect, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { FiMessageCircle, FiX, FiSend, FiPackage, FiTruck, FiCreditCard, FiRepeat, FiHelpCircle } from 'react-icons/fi'
import api from '../../services/api'
import styles from './ChatBot.module.css'

const QUICK_MESSAGES = [
  { text: 'Quais marcas vocês vendem?', icon: <FiPackage /> },
  { text: 'Como funciona o frete?', icon: <FiTruck /> },
  { text: 'Formas de pagamento?', icon: <FiCreditCard /> },
  { text: 'Como trocar um produto?', icon: <FiRepeat /> },
  { text: 'Tem cupom de desconto?', icon: <FiHelpCircle /> },
]

export default function ChatBot() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([
    { role: 'model', text: 'Olá! 👟 Sou o MJ Bot, assistente da MJ Sneakers. Como posso ajudar?' }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300)
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
      setMessages(prev => [...prev, { role: 'model', text: 'Desculpe, tive um problema. Tente novamente ou envie email para contato@mjsneakers.com.br 📧' }])
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
    <>
      {/* Floating Button */}
      <AnimatePresence>
        {!open && (
          <motion.button
            className={styles.fab}
            onClick={() => setOpen(true)}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          >
            <FiMessageCircle />
            <span className={styles.fabPulse} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat Window */}
      <AnimatePresence>
        {open && (
          <motion.div
            className={styles.chatWindow}
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          >
            {/* Header */}
            <div className={styles.chatHeader}>
              <div className={styles.chatHeaderInfo}>
                <div className={styles.chatAvatar}>MJ</div>
                <div>
                  <span className={styles.chatName}>MJ Bot</span>
                  <span className={styles.chatStatus}>
                    <span className={styles.statusDot} /> Online
                  </span>
                </div>
              </div>
              <button className={styles.chatClose} onClick={() => setOpen(false)}>
                <FiX />
              </button>
            </div>

            {/* Messages */}
            <div className={styles.chatMessages}>
              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  className={`${styles.message} ${msg.role === 'user' ? styles.messageUser : styles.messageBot}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {msg.role === 'model' && <div className={styles.msgAvatar}>MJ</div>}
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
                  <div className={styles.msgAvatar}>MJ</div>
                  <div className={`${styles.msgBubble} ${styles.bubbleBot}`}>
                    <div className={styles.typing}>
                      <span /><span /><span />
                    </div>
                  </div>
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Quick Messages */}
            <AnimatePresence>
              {showQuickMessages && (
                <motion.div
                  className={styles.quickMessages}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  {QUICK_MESSAGES.map((qm, i) => (
                    <motion.button
                      key={i}
                      className={styles.quickBtn}
                      onClick={() => sendMessage(qm.text)}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      {qm.icon}
                      <span>{qm.text}</span>
                    </motion.button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Input */}
            <div className={styles.chatInput}>
              <input
                ref={inputRef}
                className={styles.input}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Digite sua mensagem..."
                disabled={loading}
                maxLength={2000}
              />
              <button
                className={styles.sendBtn}
                onClick={() => sendMessage()}
                disabled={!input.trim() || loading}
              >
                <FiSend />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
