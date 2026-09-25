import { useCallback, useEffect, useRef, useState } from 'react'

// Conversa ao vivo com a equipe (Socket.io). O cliente só baixa o código do
// socket quando escolhe falar com alguém. A conversa fica guardada no
// aparelho: fechar e abrir o chat (ou recarregar) retoma de onde parou.
const KEY = 'pz-chat-equipe'
const ORIGIN = (import.meta.env.VITE_API_URL || 'http://localhost:3305/api').replace(/\/api\/?$/, '')

function newSessionId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return `c_${Array.from(bytes, b => chars[b % chars.length]).join('')}`
}

function loadProfile() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || 'null')
    return p && /^[A-Za-z0-9_-]{8,100}$/.test(p.sessionId) ? p : null
  } catch {
    return null
  }
}

export function useLiveChat() {
  const [profile, setProfile] = useState(loadProfile)
  const [messages, setMessages] = useState([])
  const [status, setStatus] = useState('idle') // idle | connecting | live | closed | offline
  const [staffOnline, setStaffOnline] = useState(null)
  const [unread, setUnread] = useState(0)
  const socketRef = useRef(null)
  const watching = useRef(false) // a janela do chat está aberta na conversa

  const connect = useCallback(async (p) => {
    if (!p || socketRef.current) return
    setStatus('connecting')
    const { io } = await import('socket.io-client')
    const socket = io(ORIGIN, { transports: ['websocket', 'polling'] })
    socketRef.current = socket
    socket.on('connect', () => socket.emit('customer:join', { sessionId: p.sessionId, name: p.name, email: p.email }))
    socket.on('chat:history', (list) => { setMessages(Array.isArray(list) ? list : []); setStatus('live') })
    socket.on('chat:message', (m) => {
      if (m?.session_id !== p.sessionId) return
      setMessages(prev => (prev.some(x => x.id === m.id) ? prev : [...prev, m]))
      if (m.sender === 'admin' && !watching.current) setUnread(n => n + 1)
      setStatus('live')
    })
    socket.on('staff:status', ({ online } = {}) => setStaffOnline(!!online))
    socket.on('session:closed', () => setStatus('closed'))
    socket.on('chat:error', ({ error } = {}) => {
      setMessages(prev => [...prev, { id: `erro-${Date.now()}`, sender: 'system', message: error || 'Não deu para enviar. Tente de novo.' }])
    })
    socket.on('disconnect', () => setStatus(s => (s === 'closed' ? s : 'offline')))
    socket.on('connect_error', () => setStatus(s => (s === 'live' || s === 'closed' ? s : 'offline')))
  }, [])

  useEffect(() => () => { socketRef.current?.disconnect(); socketRef.current = null }, [])

  // abre a conexão quando a conversa já existia e a janela é aberta
  const resume = useCallback(() => { if (profile) connect(profile) }, [profile, connect])

  const start = useCallback((name, email) => {
    const p = { sessionId: newSessionId(), name: String(name || '').trim().slice(0, 100) || 'Cliente', email: String(email || '').trim().slice(0, 255) }
    try { localStorage.setItem(KEY, JSON.stringify(p)) } catch { /* sem armazenamento: vale só nesta visita */ }
    setProfile(p)
    connect(p)
  }, [connect])

  const send = useCallback((text) => {
    const v = String(text || '').trim()
    if (!v || !profile || !socketRef.current?.connected) return false
    socketRef.current.emit('customer:message', { sessionId: profile.sessionId, message: v })
    if (status === 'closed') setStatus('live')
    return true
  }, [profile, status])

  // "Começar outra conversa": esquece a atual neste aparelho
  const forget = useCallback(() => {
    socketRef.current?.disconnect()
    socketRef.current = null
    try { localStorage.removeItem(KEY) } catch { /* nada */ }
    setProfile(null)
    setMessages([])
    setStatus('idle')
    setUnread(0)
  }, [])

  const setWatching = useCallback((on) => {
    watching.current = on
    if (on) setUnread(0)
  }, [])

  return { profile, messages, status, staffOnline, unread, start, resume, send, forget, setWatching }
}
