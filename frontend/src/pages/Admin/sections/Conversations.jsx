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
  // Abertas pela API: traz a última mensagem (o tempo real só manda a lista crua)
  // e segura a tela se o tempo real cair.
  const openRest = useResource(
    () => api.get('/chat/sessions', { params: { status: 'open', limit: 100 } }).then(r => asPage(r.data).items),
    [chat?.connected]
  )

  const openList = useMemo(() => {
    const rest = openRest.data || []
    const byId = new Map(rest.map(x => [x.session_id, x]))
    const base = chat?.connected ? (chat.sessions || []) : rest
    return base
      .map(x => (x.last_message || !byId.has(x.session_id) ? x : { ...x, last_message: byId.get(x.session_id).last_message, last_sender: byId.get(x.session_id).last_sender }))
      .filter(x => !q || `${x.customer_name} ${x.customer_email}`.toLowerCase().includes(q))
  }, [chat?.connected, chat?.sessions, openRest.data, q])
  const list = tab === 'open' ? openList : closed.data || []
  const listError = tab === 'open' ? (!chat?.connected && openRest.error) : closed.error
  const current = [...openList, ...(chat?.sessions || []), ...(closed.data || [])].find(x => x.session_id === sessionId)
  const openCount = chat?.connected ? chat.sessions?.length : openRest.data?.length

  return (
    <div className={sessionId ? c.pageThread : undefined}>
      <div className={c.head}>
        <PageHeader title="Conversas" description="Chat ao vivo com os clientes da loja." />
      </div>
      <div className={`${c.wrap} ${sessionId ? c.hasThread : c.noThread}`}>
        <aside className={c.list} aria-label="Conversas">
          <div className={c.listHead}>
            <div className={c.listTop}>
              <Segmented label="Situação das conversas" value={tab} onChange={setTab} options={[
                { value: 'open', label: 'Abertas', count: openCount || undefined },
                { value: 'closed', label: 'Encerradas' },
              ]} />
              <span className={c.conn} role="status">
                <span className={`${c.dot} ${chat?.connected ? '' : c.dotOff}`} aria-hidden="true" />
                {chat?.connected ? 'Ao vivo' : 'Reconectando'}
              </span>
            </div>
            <SearchField value={search} onChange={setSearch} placeholder="Nome ou e-mail" />
          </div>
          <div className={c.listBody}>
            {listError && <div className={c.pad}><ErrorNote error={listError} onRetry={tab === 'open' ? openRest.reload : closed.reload} /></div>}
            {(tab === 'closed' ? closed.loading && !closed.data : !chat?.connected && openRest.loading && !openRest.data) ? <div className={c.pad}><Skeleton lines={4} height={40} /></div> : list.length ? (
              list.map(x => {
                const n = chat?.unread?.[x.session_id] || 0
                return (
                  <button key={x.session_id} type="button"
                    className={`${c.item} ${x.session_id === sessionId ? c.itemActive : ''} ${n ? c.itemUnread : ''}`}
                    aria-current={x.session_id === sessionId ? 'true' : undefined}
                    onClick={() => navigate(`/admin/conversas/${x.session_id}`, { replace: !!sessionId })}>
                    <span className={c.avatar} aria-hidden="true">{initials(x.customer_name)}</span>
                    <span className={c.itemMain}>
                      <span className={c.itemTop}>
                        <span className={c.itemName}>{x.customer_name || 'Cliente'}</span>
                        <span className={c.itemWhen}>{ago(x.updated_at || x.created_at)}</span>
                      </span>
                      <span className={c.itemLast}>
                        {x.last_message ? `${x.last_sender === 'admin' ? 'Você: ' : ''}${x.last_message}` : x.customer_email || 'Conversa nova'}
                      </span>
                    </span>
                    {n > 0 && <span className={c.badge} aria-label={`${n} não lidas`}>{n}</span>}
                  </button>
                )
              })
            ) : !listError && (
              <EmptyState art={<Envelope />} title={q ? 'Nada com essa busca' : tab === 'open' ? 'Nenhuma conversa aberta' : 'Nenhuma conversa encerrada'}>
                {q ? 'Confira a grafia ou busque pelo e-mail.' : tab === 'open' ? 'Quando um cliente pedir para falar com a equipe no chat da loja, a conversa aparece aqui na hora.' : 'As conversas que você encerrar ficam guardadas aqui.'}
              </EmptyState>
            )}
          </div>
        </aside>

        <section className={c.thread} aria-label="Conversa">
          {sessionId ? <Thread sessionId={sessionId} info={current} onClosed={() => { closed.reload(); openRest.reload() }} /> : (
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
  const inputRef = useRef(null)
  const [text, setText] = useState('')
  const [rest, setRest] = useState(null) // histórico pela API quando o socket cai
  const [restError, setRestError] = useState(null)
  const [closing, setClosing] = useState(false)

  const connected = !!chat?.connected
  const isOpen = connected ? (chat?.sessions || []).some(x => x.session_id === sessionId) : info?.status === 'open'

  useEffect(() => {
    if (!chat) return undefined
    setRest(null)
    setRestError(null)
    let alive = true
    if (chat.connected) chat.openSession(sessionId)
    else {
      api.get(`/chat/sessions/${encodeURIComponent(sessionId)}/messages`)
        .then(r => { if (alive) setRest(Array.isArray(r.data) ? r.data : []) })
        .catch(err => { if (alive) setRestError(err) })
    }
    return () => { alive = false; chat.leaveSession() }
  }, [sessionId, chat?.connected]) // eslint-disable-line react-hooks/exhaustive-deps

  const messages = chat?.thread?.sessionId === sessionId && connected ? chat.thread.messages : rest || []
  const loadingThread = !connected && !rest && !restError

  useEffect(() => {
    const box = boxRef.current
    if (box) box.scrollTop = box.scrollHeight
  }, [messages.length])

  const grow = (el) => { if (!el) return; el.style.height = 'auto'; el.style.height = `${Math.min(160, el.scrollHeight)}px` }

  const send = () => {
    const v = text.trim()
    if (!v) return
    if (!chat?.send(sessionId, v)) { toast.error('Sem conexão com o chat agora. A mensagem continua escrita: tente em alguns segundos.'); return }
    setText('')
    // a caixa volta a ter uma linha só depois de enviar
    requestAnimationFrame(() => grow(inputRef.current))
  }

  // Resposta pronta entra na caixa para conferir antes de enviar (um toque sem querer não manda nada).
  const pickQuick = (qm) => {
    setText(t => (t.trim() ? `${t.trimEnd()} ${qm}` : qm))
    requestAnimationFrame(() => { const el = inputRef.current; if (el) { grow(el); el.focus(); el.setSelectionRange(el.value.length, el.value.length) } })
  }

  const closeConversation = async () => {
    if (!(await confirm({ title: 'Encerrar esta conversa?', message: 'Ela sai das abertas. Se o cliente escrever de novo, volta sozinha.', confirmLabel: 'Encerrar conversa' }))) return
    setClosing(true)
    try {
      await api.post(`/chat/sessions/${encodeURIComponent(sessionId)}/close`)
      toast.good('Conversa encerrada.')
      onClosed?.()
      navigate('/admin/conversas', { replace: true })
    } catch (err) { toast.error(err.message) } finally { setClosing(false) }
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
        {isOpen && <Button size="small" icon={<FiXCircle />} loading={closing} onClick={closeConversation}>Encerrar</Button>}
      </header>

      {chat?.error && <div className={c.pad}><ErrorNote error={{ message: chat.error }} onRetry={() => chat.setError('')} /></div>}
      {restError && <div className={c.pad}><ErrorNote error={restError} /></div>}

      <div className={c.messages} ref={boxRef} aria-live="polite">
        {loadingThread && <Skeleton lines={3} height={34} />}
        {!loadingThread && !restError && !messages.length && <p className={c.system}>Nenhuma mensagem ainda.</p>}
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
        {!connected ? (
          <p className={c.closedNote} role="status">Sem conexão com o chat agora. Assim que voltar, dá para responder por aqui.</p>
        ) : isOpen ? (
          <>
            <div className={c.quick} role="group" aria-label="Respostas prontas">
              {QUICK.map(qm => <button key={qm} type="button" className={c.quickBtn} onClick={() => pickQuick(qm)}>{qm}</button>)}
            </div>
            <div className={c.row}>
              <textarea
                ref={inputRef}
                className={c.textarea}
                rows={1}
                value={text}
                onChange={e => { setText(e.target.value); grow(e.target) }}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send() } }}
                placeholder="Escreva a resposta. Enter envia, Shift+Enter pula linha."
                aria-label="Resposta para o cliente"
                maxLength={2000}
                enterKeyHint="send"
              />
              <Button variant="primary" icon={<FiSend />} aria-label="Enviar resposta" onClick={send} disabled={!text.trim()} />
            </div>
          </>
        ) : (
          <p className={c.closedNote}>Conversa encerrada. Se o cliente escrever de novo, ela volta para as abertas.</p>
        )}
      </div>
    </>
  )
}
