import { useEffect, useMemo, useRef, useState } from 'react'
import { Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { FiArrowLeft, FiSend, FiMail, FiXCircle } from 'react-icons/fi'
import api, { asPage } from '../lib/api'
import { useChat } from '../lib/chat'
import { useDebounced, useResource } from '../lib/hooks'
import { ago, date, dateTime } from '../lib/format'
import { PageHeader, Button, Segmented, SearchField, ErrorNote, Skeleton, EmptyState, useConfirm, useToast } from '../ui'
import { Envelope } from '../art/Art'
import c from './conversations.module.css'

const QUICK = [
  'Oi! Já vejo isso pra você.',
  'Qual é o número do seu pedido?',
  'Qual tamanho você procura?',
  'Esse tamanho volta em breve. Quer que eu te avise por e-mail?',
  'Seu pedido já saiu. O código de rastreio foi para o seu e-mail.',
  'Obrigado! Qualquer coisa é só chamar.',
]

const initials = (name) => String(name || 'C').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase()

export default function Conversations() {
  return (
    <Routes>
      <Route index element={<Inbox />} />
      <Route path=":sessionId" element={<Inbox />} />
    </Routes>
  )
}

function Inbox() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const chat = useChat()
  const [tab, setTab] = useState('open')
  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim().toLowerCase(), 250)

  const closed = useResource(
    () => (tab === 'closed' ? api.get('/chat/sessions', { params: { status: 'closed', search: q || undefined, limit: 50 } }).then(r => asPage(r.data).items) : Promise.resolve(null)),
    [tab, q]
  )

  const openList = useMemo(() => (chat?.sessions || []).filter(x => !q || `${x.customer_name} ${x.customer_email}`.toLowerCase().includes(q)), [chat?.sessions, q])
  const list = tab === 'open' ? openList : closed.data || []
  const current = [...(chat?.sessions || []), ...(closed.data || [])].find(x => x.session_id === sessionId)

  return (
    <div>
      <PageHeader title="Conversas" description="O chat da loja em tempo real. O cliente escolhe falar com a equipe dentro do atendimento automático." />
      <div className={`${c.wrap} ${sessionId ? c.hasThread : c.noThread}`}>
        <aside className={c.list} aria-label="Conversas">
          <div className={c.listHead}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <Segmented label="Situação" value={tab} onChange={setTab} options={[
                { value: 'open', label: 'Abertas', count: chat?.sessions?.length || undefined },
                { value: 'closed', label: 'Encerradas' },
              ]} />
              <span className={c.conn} title={chat?.connected ? 'Recebendo mensagens em tempo real' : 'Sem conexão com o chat, tentando de novo'}>
                <span className={`${c.dot} ${chat?.connected ? '' : c.dotOff}`} aria-hidden="true" />
                {chat?.connected ? 'Ao vivo' : 'Reconectando'}
              </span>
            </div>
            <SearchField value={search} onChange={setSearch} placeholder="Nome ou e-mail" />
          </div>
          <div className={c.listBody}>
            {tab === 'closed' && closed.loading && !closed.data ? <div style={{ padding: 14 }}><Skeleton lines={4} height={40} /></div> : list.length ? (
              list.map(x => {
                const n = chat?.unread?.[x.session_id] || 0
                return (
                  <button key={x.session_id} type="button"
                    className={`${c.item} ${x.session_id === sessionId ? c.itemActive : ''} ${n ? c.itemUnread : ''}`}
                    onClick={() => navigate(`/admin/conversas/${x.session_id}`, { replace: !!sessionId })}>
                    <span className={c.avatar} aria-hidden="true">{initials(x.customer_name)}</span>
                    <span className={c.itemMain}>
                      <span className={c.itemTop}>
                        <span className={c.itemName}>{x.customer_name || 'Cliente'}</span>
                        <span className={c.itemWhen}>{ago(x.updated_at || x.created_at)}</span>
                      </span>
                      <span className={c.itemLast} style={{ display: 'block' }}>
                        {x.last_message ? `${x.last_sender === 'admin' ? 'Você: ' : ''}${x.last_message}` : x.customer_email || 'Conversa nova'}
                      </span>
                    </span>
                    {n > 0 && <span className={c.badge} aria-label={`${n} não lidas`}>{n}</span>}
                  </button>
                )
              })
            ) : (
              <EmptyState art={<Envelope />} title={tab === 'open' ? 'Nenhuma conversa aberta' : 'Nenhuma conversa encerrada'}>
                {tab === 'open' ? 'Quando um cliente pedir para falar com a equipe, a conversa aparece aqui na hora.' : q ? 'Nada com essa busca.' : 'As conversas que você encerrar ficam guardadas aqui.'}
              </EmptyState>
            )}
          </div>
        </aside>

        <section className={c.thread} aria-label="Conversa">
          {sessionId ? <Thread sessionId={sessionId} info={current} onClosed={() => closed.reload()} /> : (
            <div className={c.emptyPane}>
              <EmptyState art={<Envelope />} title="Escolha uma conversa">As mensagens novas chegam sozinhas, com aviso e som se você ligar em Avisos.</EmptyState>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function Thread({ sessionId, info, onClosed }) {
  const chat = useChat()
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const boxRef = useRef(null)
  const [text, setText] = useState('')
  const [rest, setRest] = useState(null) // histórico pela API quando o socket cai

  const isOpen = (chat?.sessions || []).some(x => x.session_id === sessionId)

  useEffect(() => {
    if (!chat) return undefined
    if (chat.connected) chat.openSession(sessionId)
    else api.get(`/chat/sessions/${encodeURIComponent(sessionId)}/messages`).then(r => setRest(Array.isArray(r.data) ? r.data : [])).catch(() => setRest([]))
    return () => chat.leaveSession()
  }, [sessionId, chat?.connected]) // eslint-disable-line react-hooks/exhaustive-deps

  const messages = chat?.thread?.sessionId === sessionId && chat.connected ? chat.thread.messages : rest || []

  useEffect(() => {
    const box = boxRef.current
    if (box) box.scrollTop = box.scrollHeight
  }, [messages.length])

  const send = (value = text) => {
    const v = value.trim()
    if (!v) return
    if (!chat?.send(sessionId, v)) { toast.error('Sem conexão com o chat agora. Tente em alguns segundos.'); return }
    if (value === text) setText('')
  }

  const closeConversation = async () => {
    if (!(await confirm({ title: 'Encerrar esta conversa?', message: 'Ela sai das abertas. Se o cliente escrever de novo, volta sozinha.', confirmLabel: 'Encerrar' }))) return
    try {
      await api.post(`/chat/sessions/${encodeURIComponent(sessionId)}/close`)
      toast.good('Conversa encerrada.')
      onClosed?.()
      navigate('/admin/conversas', { replace: true })
    } catch (err) { toast.error(err.message) }
  }

  // agrupa por dia: "24/09/2026" aparece uma vez antes das mensagens do dia
  let lastDay = ''

  return (
    <>
      <header className={c.threadHead}>
        <Button className={c.back} variant="ghost" icon={<FiArrowLeft />} aria-label="Voltar para a lista" onClick={() => navigate('/admin/conversas')} />
        <span className={c.avatar} aria-hidden="true">{initials(info?.customer_name)}</span>
        <div className={c.threadWho}>
          <div className={c.threadName}>{info?.customer_name || 'Cliente'}</div>
          <div className={c.threadMail}>{info?.customer_email || 'Sem e-mail'}</div>
        </div>
        {info?.customer_email && <Button variant="ghost" icon={<FiMail />} aria-label="Mandar e-mail" onClick={() => { window.location.href = `mailto:${info.customer_email}` }} />}
        {isOpen && <Button size="small" icon={<FiXCircle />} onClick={closeConversation}>Encerrar</Button>}
      </header>

      {chat?.error && <div style={{ padding: '8px 12px' }}><ErrorNote error={{ message: chat.error }} onRetry={() => chat.setError('')} /></div>}

      <div className={c.messages} ref={boxRef} aria-live="polite">
        {!messages.length && <p className={c.system}>Nenhuma mensagem ainda.</p>}
        {messages.map(m => {
          const day = date(m.created_at)
          const showDay = day !== lastDay
          lastDay = day
          const mine = m.sender === 'admin'
          return (
            <div key={m.id} style={{ display: 'contents' }}>
              {showDay && <span className={c.day}>{day}</span>}
              <div className={`${c.msg} ${mine ? c.msgMine : c.msgTheirs}`}>
                <div className={c.bubble}>{m.message}</div>
                <span className={c.msgTime} title={dateTime(m.created_at)}>{mine ? 'Você, ' : ''}{new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
          )
        })}
      </div>

      <div className={c.composer}>
        {isOpen ? (
          <>
            <div className={c.quick}>
              {QUICK.map(qm => <button key={qm} type="button" className={c.quickBtn} onClick={() => send(qm)}>{qm}</button>)}
            </div>
            <div className={c.row}>
              <textarea
                className={c.textarea}
                rows={1}
                value={text}
                onChange={e => { setText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(160, e.target.scrollHeight)}px` }}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                placeholder="Escreva a resposta. Enter envia, Shift+Enter pula linha."
                aria-label="Resposta"
                maxLength={2000}
                enterKeyHint="send"
              />
              <Button variant="primary" icon={<FiSend />} aria-label="Enviar" onClick={() => send()} disabled={!text.trim()} />
            </div>
          </>
        ) : (
          <p className={c.closedNote}>Conversa encerrada. Se o cliente escrever de novo, ela volta para as abertas.</p>
        )}
      </div>
    </>
  )
}
