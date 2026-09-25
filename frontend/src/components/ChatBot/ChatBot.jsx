import { useState, useRef, useEffect, useCallback } from 'react'
import { AnimatePresence, motion, MotionConfig } from 'framer-motion'
import { FiMessageCircle, FiX, FiSend, FiPackage, FiTruck, FiCreditCard, FiRepeat, FiTag, FiHeadphones, FiCpu } from 'react-icons/fi'
import api from '../../services/api'
import { BRAND } from '../../config/brand'
import { MQ, MQ_HANDHELD, matches, useMedia } from '../../lib/breakpoints'
import { useScrollLock } from '../../lib/useScrollLock'
import { useBackToClose } from '../../lib/layers'
import { useLiveChat } from './useLiveChat'
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
  // 'bot' = atendimento automático; 'live' = conversa com a equipe
  const live = useLiveChat()
  const [mode, setMode] = useState(() => (live.profile ? 'live' : 'bot'))
  const [liveName, setLiveName] = useState('')
  const [liveEmail, setLiveEmail] = useState('')
  const messagesRef = useRef(null)
  const inputRef = useRef(null)
  const windowRef = useRef(null)
  // no celular (em pé ou deitado) o chat ocupa a tela inteira
  const full = useMedia(MQ_HANDHELD)
  const close = useCallback(() => setOpen(false), [])
  useScrollLock(open && full)
  useBackToClose(open, close)

  // rola só a caixa de mensagens, sem mexer na página
  const scrollToBottom = useCallback(() => {
    const box = messagesRef.current
    if (box) box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, loading, live.messages, mode, scrollToBottom])

  useEffect(() => {
    if (open && mode === 'live') live.resume()
    live.setWatching(open && mode === 'live')
  }, [open, mode]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return
    // no toque, focar sozinho abriria o teclado por cima dos atalhos
    const t = matches(MQ.touch) ? 0 : setTimeout(() => inputRef.current?.focus(), 300)
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Tela cheia com o teclado aberto: a janela acompanha a parte visível da
  // tela (visualViewport), para o campo e o cabeçalho não sumirem atrás do
  // teclado no iPhone.
  useEffect(() => {
    const el = windowRef.current
    const vv = window.visualViewport
    if (!open || !full || !el || !vv) return undefined
    const fit = () => {
      el.style.top = `${Math.round(vv.offsetTop)}px`
      el.style.height = `${Math.round(vv.height)}px`
      el.style.bottom = 'auto'
    }
    fit()
    vv.addEventListener('resize', fit)
    vv.addEventListener('scroll', fit)
    return () => {
      vv.removeEventListener('resize', fit)
      vv.removeEventListener('scroll', fit)
      el.style.top = ''
      el.style.height = ''
      el.style.bottom = ''
    }
  }, [open, full])

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
      setMessages(prev => [...prev, { role: 'model', text: 'Não consegui responder agora. Toque em "Falar com a equipe" que uma pessoa te responde.' }])
    } finally {
      setLoading(false)
    }
  }

  const liveReady = mode === 'live' && !!live.profile
  const send = () => {
    if (!liveReady) { sendMessage(); return }
    if (live.send(input)) setInput('')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const startLive = (e) => {
    e.preventDefault()
    live.start(liveName, liveEmail)
  }

  const emailOk = !liveEmail.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(liveEmail.trim())
  const showQuickMessages = mode === 'bot' && messages.length <= 1
  const statusText = mode === 'bot'
    ? 'Assistente automático'
    : live.staffOnline === false ? 'Equipe fora agora' : live.staffOnline ? 'Equipe online' : 'Equipe da loja'

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
            {live.unread > 0 && <span className={styles.fabBadge} aria-label={`${live.unread} respostas novas da equipe`}>{live.unread}</span>}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Janela do chat */}
      <AnimatePresence>
        {open && (
          <motion.div
            ref={windowRef}
            className={styles.chatWindow}
            role="dialog"
            aria-modal={full ? 'true' : undefined}
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
                    <span className={`${styles.statusDot} ${mode === 'live' && live.staffOnline === false ? styles.statusDotOff : ''}`} aria-hidden="true" /> {statusText}
                  </span>
                </div>
              </div>
              <div className={styles.headerActions}>
                {mode === 'bot' ? (
                  <button type="button" className={styles.modeBtn} onClick={() => setMode('live')}>
                    <FiHeadphones aria-hidden="true" /> Falar com a equipe
                  </button>
                ) : (
                  <button type="button" className={styles.modeBtn} onClick={() => setMode('bot')} aria-label="Voltar ao assistente automático">
                    <FiCpu aria-hidden="true" /> Assistente
                  </button>
                )}
                <button type="button" className={styles.chatClose} onClick={() => setOpen(false)} aria-label="Fechar atendimento">
                  <FiX aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className={styles.chatMessages} ref={messagesRef} data-lenis-prevent aria-live="polite">
              {mode === 'live' && !live.profile && (
                <form className={styles.liveForm} onSubmit={startLive}>
                  <p className={styles.liveTitle}>Falar com a equipe</p>
                  <p className={styles.liveText}>
                    {live.staffOnline === false ? 'Agora não tem ninguém online, mas deixe sua mensagem: respondemos aqui ou por e-mail.' : 'Uma pessoa da loja responde por aqui. Diga seu nome para a gente saber com quem fala.'}
                  </p>
                  <label className={styles.liveLabel}>
                    Seu nome
                    <input className={styles.input} value={liveName} onChange={e => setLiveName(e.target.value)} autoComplete="name" maxLength={100} enterKeyHint="next" required />
                  </label>
                  <label className={styles.liveLabel}>
                    E-mail (para a gente responder se você sair)
                    <input className={styles.input} type="email" value={liveEmail} onChange={e => setLiveEmail(e.target.value)} autoComplete="email" maxLength={255} enterKeyHint="go" />
                  </label>
                  <button type="submit" className={styles.liveStart} disabled={!liveName.trim() || !emailOk}>Começar conversa</button>
                </form>
              )}

              {liveReady && (
                <>
                  <div className={styles.note}>
                    {live.status === 'connecting' ? 'Conectando com a equipe.' : live.status === 'offline' ? 'Sem conexão agora. Tentando de novo.' : live.staffOnline === false ? 'A equipe não está online agora. Deixe sua mensagem que respondemos aqui ou por e-mail.' : 'Você está falando com uma pessoa da loja.'}
                  </div>
                  {live.messages.map(m => (m.sender === 'system' ? (
                    <div key={m.id} className={styles.note}>{m.message}</div>
                  ) : (
                    <div key={m.id} className={`${styles.message} ${m.sender === 'customer' ? styles.messageUser : styles.messageBot}`}>
                      <span className="pz-visually-hidden">{m.sender === 'customer' ? 'Você:' : 'Equipe:'}</span>
                      <div className={`${styles.msgBubble} ${m.sender === 'customer' ? styles.bubbleUser : styles.bubbleBot}`}>{m.message}</div>
                    </div>
                  )))}
                  {live.status === 'closed' && <div className={styles.note}>A equipe encerrou a conversa. Se precisar de mais alguma coisa, é só escrever.</div>}
                  <button type="button" className={styles.linkBtn} onClick={live.forget}>Começar outra conversa</button>
                </>
              )}

              {mode === 'bot' && messages.map((msg, i) => (
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

              {mode === 'bot' && loading && (
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
                    <button type="button" className={styles.quickBtn} onClick={() => setMode('live')}>
                      <span aria-hidden="true"><FiHeadphones /></span>
                      <span>Falar com uma pessoa</span>
                    </button>
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

            {!(mode === 'live' && !live.profile) && <div className={styles.chatInput}>
              <input
                ref={inputRef}
                className={styles.input}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={liveReady ? 'Escreva para a equipe' : 'Escreva sua pergunta'}
                aria-label="Sua mensagem"
                enterKeyHint="send"
                disabled={liveReady ? live.status === 'connecting' : loading}
                maxLength={2000}
              />
              <button
                type="button"
                className={styles.sendBtn}
                onClick={send}
                disabled={!input.trim() || (liveReady ? live.status !== 'live' && live.status !== 'closed' : loading)}
                aria-label="Enviar"
              >
                <FiSend aria-hidden="true" />
              </button>
            </div>}
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  )
}
