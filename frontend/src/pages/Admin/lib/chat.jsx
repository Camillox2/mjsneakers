import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { API_ORIGIN } from './api'
import { notify } from './notify'

// Chat ao vivo do painel: uma conexão só para o painel inteiro, aberta no
// login. Assim o contador de não lidas e o aviso funcionam em qualquer tela.
const ChatContext = createContext(null)

export function ChatProvider({ children }) {
  const socketRef = useRef(null)
  const activeRef = useRef(null) // conversa aberta na tela agora
  const [connected, setConnected] = useState(false)
  const [sessions, setSessions] = useState([]) // abertas
  const [unread, setUnread] = useState({}) // session_id -> quantas
  const [thread, setThread] = useState({ sessionId: null, messages: [] })
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    let socket = null
    import('socket.io-client').then(({ io }) => {
      if (!alive) return
      socket = io(API_ORIGIN, {
        auth: (cb) => cb({ token: localStorage.getItem('mj_token') }),
        transports: ['websocket', 'polling'],
      })
      socketRef.current = socket

      socket.on('connect', () => {
        setConnected(true)
        setError('')
        socket.emit('admin:join')
        if (activeRef.current) socket.emit('admin:join-session', { sessionId: activeRef.current })
      })
      socket.on('disconnect', () => setConnected(false))
      socket.on('connect_error', () => setConnected(false))
      socket.on('sessions:list', (list) => setSessions(Array.isArray(list) ? list : []))
      socket.on('session:new', (sess) => {
        if (!sess?.session_id) return
        setSessions(prev => [{ ...sess, status: 'open' }, ...prev.filter(x => x.session_id !== sess.session_id)])
      })
      socket.on('session:closed', ({ sessionId }) => {
        setSessions(prev => prev.filter(x => x.session_id !== sessionId))
        setUnread(u => { const n = { ...u }; delete n[sessionId]; return n })
      })
      socket.on('chat:history', (list) => {
        setThread(t => ({ ...t, messages: Array.isArray(list) ? list : [] }))
      })
      socket.on('chat:message', (msg) => {
        if (!msg?.session_id) return
        setSessions(prev => {
          const found = prev.find(x => x.session_id === msg.session_id)
          const rest = prev.filter(x => x.session_id !== msg.session_id)
          const updated = { ...(found || { session_id: msg.session_id, customer_name: 'Cliente', status: 'open' }), last_message: msg.message, last_sender: msg.sender, updated_at: msg.created_at }
          return [updated, ...rest]
        })
        const viewing = activeRef.current === msg.session_id && document.visibilityState === 'visible'
        if (activeRef.current === msg.session_id) {
          setThread(t => (t.sessionId === msg.session_id && !t.messages.some(m => m.id === msg.id) ? { ...t, messages: [...t.messages, msg] } : t))
        }
        if (msg.sender === 'customer' && !viewing) {
          setUnread(u => ({ ...u, [msg.session_id]: (u[msg.session_id] || 0) + 1 }))
          notify('Mensagem nova no chat', msg.message, `/admin/conversas/${msg.session_id}`, `chat-${msg.session_id}`)
        }
      })
      socket.on('chat:error', ({ error: e }) => setError(e || 'Erro no chat.'))
    })
    return () => {
      alive = false
      socket?.disconnect()
      socketRef.current = null
    }
  }, [])

  const openSession = useCallback((sessionId) => {
    activeRef.current = sessionId
    setThread({ sessionId, messages: [] })
    setUnread(u => { if (!u[sessionId]) return u; const n = { ...u }; delete n[sessionId]; return n })
    socketRef.current?.emit('admin:join-session', { sessionId })
  }, [])

  const leaveSession = useCallback(() => {
    const id = activeRef.current
    activeRef.current = null
    if (id) socketRef.current?.emit('admin:leave-session', { sessionId: id })
    setThread({ sessionId: null, messages: [] })
  }, [])

  const send = useCallback((sessionId, message) => {
    const text = String(message || '').trim()
    if (!text || !socketRef.current?.connected) return false
    socketRef.current.emit('admin:message', { sessionId, message: text })
    return true
  }, [])

  const totalUnread = Object.values(unread).reduce((n, v) => n + v, 0)

  const value = useMemo(() => ({
    connected, sessions, unread, totalUnread, thread, error, setError, openSession, leaveSession, send,
  }), [connected, sessions, unread, totalUnread, thread, error, openSession, leaveSession, send])

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

export const useChat = () => useContext(ChatContext)
