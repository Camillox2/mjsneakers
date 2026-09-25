import { useEffect, useState } from 'react'
import { Link, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { FiDownload, FiPrinter, FiSave, FiMail, FiPhone, FiCopy, FiXCircle, FiPlus, FiRefreshCw, FiRotateCcw, FiCreditCard } from 'react-icons/fi'
import { FaWhatsapp } from 'react-icons/fa'
import api, { asPage, downloadFile } from '../lib/api'
import { useDebounced, useResource } from '../lib/hooks'
import { useAdmin } from '../lib/context'
import { money, dateTime, date, ago, number } from '../lib/format'
import { ORDER_STATUS, ORDER_FLOW, OrderBadge, nextStatus, NEXT_ACTION, PaymentBadge, PAYMENT_STATUS, methodText } from '../lib/status'
import { labelHTML, pickingHTML, printHTML } from '../lib/print'
import { getImageUrl } from '../../../utils/imageHelper'
import {
  PageHeader, Panel, Button, SearchField, Segmented, DataTable, Pagination, ErrorNote, Skeleton,
  EmptyState, Dialog, TextField, useConfirm, useToast,
} from '../ui'
import { Receipt } from '../art/Art'
import OrderInvoice from './OrderInvoice'
import s from './sections.module.css'
import o from './orders.module.css'

export default function Orders() {
  return (
    <>
      <OrderList />
      <Routes>
        <Route path=":id" element={<OrderDetail />} />
      </Routes>
    </>
  )
}

function OrderList() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { refreshCounts, payments } = useAdmin()
  const [search, setSearch] = useState(params.get('busca') || '')
  const q = useDebounced(search.trim(), 350)
  const status = params.get('status') || ''
  const from = params.get('de') || ''
  const to = params.get('ate') || ''
  const page = Number(params.get('pagina') || 1)
  const [busyId, setBusyId] = useState(null)
  const [exporting, setExporting] = useState(false)

  const setParam = (patch) => {
    const next = new URLSearchParams(params)
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)))
    if (!('pagina' in patch)) next.delete('pagina')
    setParams(next, { replace: true })
  }

  useEffect(() => { if (q !== (params.get('busca') || '')) setParam({ busca: q }) }, [q]) // eslint-disable-line react-hooks/exhaustive-deps

  const filters = { search: q || undefined, status: status || undefined, date_from: from || undefined, date_to: to || undefined }
  const list = useResource(
    () => api.get('/orders', { params: { ...filters, page, limit: 20 } }).then(r => asPage(r.data, page)),
    [q, status, from, to, page]
  )
  const counts = useResource(() => api.get('/orders/status-counts').then(r => r.data), [])

  const advance = async (order) => {
    const next = nextStatus(order.status)
    if (!next) return
    setBusyId(order.id)
    try {
      await api.put(`/orders/${order.id}/status`, { status: next })
      toast.good(`Pedido #${order.id}: ${ORDER_STATUS[next].label.toLowerCase()}. O cliente recebe um e-mail.`)
      list.reload(); counts.reload(); refreshCounts()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusyId(null)
    }
  }

  const [picking, setPicking] = useState(false)
  const printPicking = async () => {
    setPicking(true)
    try {
      const fetchStatus = (st) => api.get('/orders', { params: { status: st, limit: 100 } }).then(r => asPage(r.data).items)
      const [confirmed, processing] = await Promise.all([fetchStatus('confirmed'), fetchStatus('processing')])
      const orders = [...confirmed, ...processing].sort((a, b) => a.id - b.id)
      if (!orders.length) { toast.info('Nenhum pedido confirmado ou em separação agora.'); return }
      await printHTML(pickingHTML(orders))
    } catch (err) {
      toast.error(err.message)
    } finally {
      setPicking(false)
    }
  }

  const exportCsv = async () => {
    setExporting(true)
    try {
      await downloadFile('/orders/export/csv', filters, `pedidos-${new Date().toISOString().slice(0, 10)}.csv`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setExporting(false)
    }
  }

  const c = counts.data || {}
  const statusOptions = [
    { value: '', label: 'Todos', count: c.all },
    ...Object.entries(ORDER_STATUS).map(([k, m]) => ({ value: k, label: m.label, count: c[k] })),
  ]

  const rows = list.data?.items || []
  const open = (r) => navigate(`/admin/pedidos/${r.id}${window.location.search}`, { state: { fromList: true } })

  const columns = [
    {
      key: 'id', header: 'Pedido', primary: true,
      render: r => (
        <div>
          <div className={o.orderNo}>#{r.id}</div>
          <div className={o.orderDate}>{dateTime(r.created_at)}</div>
        </div>
      ),
    },
    {
      key: 'customer', header: 'Cliente',
      render: r => (
        <div className={o.who}>
          <div className={o.whoName}>{r.customer_name || 'Sem nome'}</div>
          <div className={o.whoMail}>{r.customer_email || r.customer_phone || ''}</div>
        </div>
      ),
    },
    { key: 'items', header: 'Pares', align: 'right', render: r => number(r.items_count ?? r.items?.reduce((n, i) => n + Number(i.quantity || 0), 0) ?? 0) },
    { key: 'total', header: 'Total', align: 'right', render: r => <strong>{money(r.total)}</strong> },
    {
      key: 'pay', header: 'Pagamento',
      render: r => (r.payment_status ? (
        <div style={{ display: 'grid', gap: 2, justifyItems: 'start' }}>
          <PaymentBadge status={r.payment_status} />
          {r.payment_method && <span className={o.orderDate}>{methodText(r.payment_method, r.payment_installments)}</span>}
        </div>
      ) : null),
    },
    { key: 'status', header: 'Status', render: r => <OrderBadge status={r.status} /> },
    {
      key: 'act', header: '', hideOnCard: false,
      render: r => {
        const next = nextStatus(r.status)
        if (next === 'confirmed' && payments?.enabled && r.payment_status !== 'approved') return <span className={o.orderDate}>Esperando o pagamento</span>
        return next ? (
          <Button size="small" onClick={() => advance(r)} loading={busyId === r.id}>{NEXT_ACTION[next]}</Button>
        ) : null
      },
    },
  ]

  return (
    <div>
      <PageHeader
        title="Pedidos"
        description="Toque num pedido para ver itens, endereço, rastreio e notas."
        actions={<>
          <Button icon={<FiPrinter />} onClick={printPicking} loading={picking}>Lista de separação</Button>
          <Button icon={<FiDownload />} onClick={exportCsv} loading={exporting}>Baixar planilha</Button>
        </>}
      />

      <div className={o.statusScroll}>
        <Segmented label="Status" options={statusOptions} value={status} onChange={v => setParam({ status: v })} />
      </div>

      <div className={o.filters}>
        <SearchField value={search} onChange={setSearch} placeholder="Nome, e-mail ou número do pedido" />
        <div className={o.dates}>
          <label className={o.dateLabel} htmlFor="ped-de">De</label>
          <input id="ped-de" type="date" value={from} max={to || undefined} onChange={e => setParam({ de: e.target.value })} style={dateStyle} />
          <label className={o.dateLabel} htmlFor="ped-ate">até</label>
          <input id="ped-ate" type="date" value={to} min={from || undefined} onChange={e => setParam({ ate: e.target.value })} style={dateStyle} />
          {(from || to) && <Button size="small" variant="ghost" onClick={() => setParam({ de: '', ate: '' })}>Limpar datas</Button>}
        </div>
      </div>

      <ErrorNote error={list.error} onRetry={list.reload} />

      <Panel flush>
        {list.loading && !list.data ? (
          <div style={{ padding: 18 }}><Skeleton lines={6} height={36} /></div>
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            onRowClick={open}
            dim={list.loading}
            empty={
              <EmptyState art={<Receipt />} title={q || status || from || to ? 'Nenhum pedido com esses filtros' : 'Nenhum pedido ainda'}>
                {q || status || from || to ? 'Tente outro status, outro período ou limpe a busca.' : 'Os pedidos da loja aparecem aqui assim que alguém finalizar uma compra.'}
              </EmptyState>
            }
          />
        )}
      </Panel>
      <Pagination page={page} pages={list.data?.pages} onChange={p => setParam({ pagina: String(p) })} />
    </div>
  )
}

const dateStyle = {
  minHeight: 42,
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid var(--a-line-strong)',
  background: 'var(--a-sunken)',
  color: 'var(--a-text)',
  fontSize: 16,
  colorScheme: 'inherit',
}

/* ================= Detalhe ================= */

function Timeline({ status }) {
  const idx = ORDER_FLOW.indexOf(status)
  const pct = idx <= 0 ? 0 : idx / (ORDER_FLOW.length - 1)
  return (
    <div className={o.timeline} aria-label={`Andamento: ${ORDER_STATUS[status]?.label || status}`}>
      <svg className={o.timelineSvg} viewBox="0 0 100 26" preserveAspectRatio="none" aria-hidden="true">
        <line x1="1" x2="99" y1="13" y2="13" stroke="var(--a-line-strong)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <motion.line
          x1="1" y1="13" y2="13"
          stroke="var(--a-series-1)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          initial={{ x2: 1 }}
          animate={{ x2: 1 + pct * 98 }}
          transition={{ duration: 0.8, ease: [0.65, 0, 0.35, 1] }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: '0 0 auto 0', height: 26, display: 'flex', justifyContent: 'space-between', alignItems: 'center', pointerEvents: 'none' }}>
        {ORDER_FLOW.map((st, i) => (
          <motion.span
            key={st}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1 + i * 0.08 }}
            style={{
              width: 14, height: 14, borderRadius: '50%',
              background: i <= idx ? 'var(--a-series-1)' : 'var(--a-surface)',
              boxShadow: i <= idx ? '0 0 0 3px var(--a-surface)' : 'inset 0 0 0 2px var(--a-line-strong), 0 0 0 3px var(--a-surface)',
            }}
          />
        ))}
      </div>
      <div className={o.steps}>
        {ORDER_FLOW.map((st, i) => (
          <span key={st} className={`${o.step} ${i <= idx ? o.stepDone : ''}`}>{ORDER_STATUS[st].label}</span>
        ))}
      </div>
    </div>
  )
}

function OrderDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const confirm = useConfirm()
  const { refreshCounts, payments, user } = useAdmin()
  const order = useResource(() => api.get(`/orders/${id}`).then(r => r.data), [id])
  const [tracking, setTracking] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState('')
  const [waLink, setWaLink] = useState('')

  const d = order.data
  useEffect(() => { if (d) setTracking(d.tracking_code || '') }, [d])

  const close = () => (location.state?.fromList ? navigate(-1) : navigate('/admin/pedidos'))

  const changeStatus = async (next) => {
    const cancel = next === 'cancelled'
    const unpaid = next === 'confirmed' && payments?.enabled && d?.payment_status !== 'approved'
    const ok = await confirm({
      title: cancel ? `Cancelar o pedido #${id}?` : `Marcar o pedido #${id} como ${ORDER_STATUS[next].label.toLowerCase()}?`,
      message: cancel
        ? 'Os pares voltam para a grade, os pontos de fidelidade do pedido são estornados e o cliente recebe um e-mail avisando. Depois de cancelado, o pedido não muda mais de status.'
        : unpaid
          ? 'O Mercado Pago ainda não confirmou o pagamento deste pedido. Só confirme se você recebeu por fora (Pix direto, dinheiro). O cliente recebe um e-mail com o novo status.'
          : 'O cliente recebe um e-mail com o novo status.',
      confirmLabel: cancel ? 'Cancelar pedido' : 'Confirmar',
      cancelLabel: 'Voltar',
      tone: cancel ? 'danger' : undefined,
    })
    if (!ok) return
    setBusy(next)
    try {
      const { data: res } = await api.put(`/orders/${id}/status`, { status: next })
      const points = Number(res?.loyalty_points_reversed) || 0
      const refunded = Number(res?.points_refunded) || 0
      toast.good(cancel
        ? `Pedido #${id} cancelado. Estoque devolvido${points ? `, ${points.toLocaleString('pt-BR')} pontos ganhos estornados` : ''}${refunded ? `, ${refunded.toLocaleString('pt-BR')} pontos usados devolvidos ao cliente` : ''}.`
        : `Pedido #${id}: ${ORDER_STATUS[next].label.toLowerCase()}.`)
      // cancelou um pedido que já estava pago: o dinheiro não volta sozinho
      if (res?.payment_refund_needed) toast.info('Este pedido estava pago. Faça o estorno no bloco Pagamento para o dinheiro voltar ao cliente.')
      order.reload(); refreshCounts()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy('')
    }
  }

  const saveTracking = async () => {
    setBusy('tracking')
    try {
      const { data } = await api.put(`/orders/${id}/tracking`, { tracking_code: tracking.trim() })
      if (data?.wa_link) setWaLink(data.wa_link)
      toast.good('Rastreio salvo. O pedido foi marcado como enviado.')
      order.reload(); refreshCounts()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy('')
    }
  }

  const printLabel = async () => {
    setBusy('label')
    try {
      const { data } = await api.post(`/shipping/label/${id}/generate`)
      await printHTML(await labelHTML(data))
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy('')
    }
  }

  const addNote = async () => {
    if (!note.trim()) return
    setBusy('note')
    try {
      await api.post(`/orders/${id}/notes`, { note: note.trim() })
      setNote('')
      order.reload()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy('')
    }
  }

  const syncPayment = async () => {
    setBusy('sync')
    try {
      const { data: res } = await api.post(`/payments/order/${id}/sync`)
      toast.good(`Conferido no Mercado Pago: ${(PAYMENT_STATUS[res?.payment_status]?.label || 'sem mudança').toLowerCase()}.`)
      order.reload(); refreshCounts()
    } catch (err) { toast.error(err.message) } finally { setBusy('') }
  }

  const refund = async (pay) => {
    const ok = await confirm({
      title: `Estornar ${money(pay.amount)}?`,
      message: 'O valor volta para o cliente pelo Mercado Pago. Se o pedido ainda não saiu, ele é cancelado e os pares voltam para o estoque.',
      confirmLabel: 'Estornar pagamento',
      tone: 'danger',
    })
    if (!ok) return
    setBusy(`refund-${pay.id}`)
    try {
      await api.post(`/payments/${pay.id}/refund`)
      toast.good('Estorno pedido ao Mercado Pago.')
      order.reload(); refreshCounts()
    } catch (err) { toast.error(err.message) } finally { setBusy('') }
  }

  const copy = async (text, what) => {
    try { await navigator.clipboard.writeText(text); toast.good(`${what} copiado.`) } catch { toast.error('Não deu para copiar. Selecione o texto e copie.') }
  }

  const next = d && nextStatus(d.status)
  const items = d?.items || []
  const subtotal = d?.subtotal ?? items.reduce((n, i) => n + Number(i.price || 0) * Number(i.quantity || 0), 0)
  const addressLines = d ? [
    [d.address_street, d.address_number].filter(Boolean).join(', ') + (d.address_complement ? `, ${d.address_complement}` : ''),
    [d.address_neighborhood, [d.address_city, d.address_state].filter(Boolean).join('/')].filter(Boolean).join(' - '),
    d.address_cep ? `CEP ${d.address_cep}` : '',
  ].filter(Boolean) : []
  const phone = String(d?.customer_phone || '').replace(/\D/g, '')

  return (
    <Dialog
      open
      routed
      onClose={close}
      size="l"
      title={`Pedido #${id}`}
      description={d ? `${dateTime(d.created_at)}, ${ago(d.created_at)}` : 'Carregando'}
      footer={d && d.status !== 'cancelled' && d.status !== 'delivered' ? (
        <>
          <Button variant="danger" icon={<FiXCircle />} onClick={() => changeStatus('cancelled')} loading={busy === 'cancelled'}>Cancelar pedido</Button>
          {next && <Button variant="primary" onClick={() => changeStatus(next)} loading={busy === next}>{NEXT_ACTION[next]}</Button>}
        </>
      ) : null}
    >
      <ErrorNote error={order.error} onRetry={order.reload} />
      {!d ? <Skeleton lines={8} height={20} /> : (
        <>
          {d.status === 'cancelled' ? (
            <div className={o.cancelNote}><FiXCircle aria-hidden="true" /><span>Pedido cancelado. Os pares já voltaram para o estoque.</span></div>
          ) : <Timeline status={d.status} />}

          <div className={o.block} style={{ borderTop: 0, paddingTop: 0 }}>
            <h3 className={o.blockTitle}>Itens <OrderBadge status={d.status} /></h3>
            {items.map((it, i) => (
              <div key={i} className={o.item}>
                <img className={s.thumb} src={getImageUrl(it.image_url, it.product_name)} alt="" loading="lazy" />
                <div className={o.itemMain}>
                  <div className={o.itemName}>{it.product_name || it.name}</div>
                  <div className={o.itemMeta}>Tamanho {it.size}, {it.quantity} {Number(it.quantity) === 1 ? 'par' : 'pares'} de {money(it.price)}</div>
                </div>
                <div className={o.itemPrice}>{money(Number(it.price) * Number(it.quantity))}</div>
              </div>
            ))}
            <dl className={o.totals}>
              <dt>Subtotal</dt><dd>{money(subtotal)}</dd>
              {Number(d.discount_amount) > 0 && <><dt>Desconto{d.coupon_code ? ` (${d.coupon_code})` : ''}</dt><dd>- {money(d.discount_amount)}</dd></>}
              {Number(d.points_discount) > 0 && <><dt>Pontos de fidelidade ({number(d.points_used)})</dt><dd>- {money(d.points_discount)}</dd></>}
              <dt>Frete{d.shipping_type ? ` (${d.shipping_type})` : ''}</dt><dd>{Number(d.shipping_price) > 0 ? money(d.shipping_price) : 'Grátis'}</dd>
              {d.gift_wrap ? <><dt>Embrulho de presente</dt><dd>Sim</dd></> : null}
              <dt className={o.totalFinal}>Total</dt><dd className={o.totalFinal}>{money(d.total)}</dd>
            </dl>
            {d.gift_message && <p className={s.muted} style={{ marginTop: 10 }}>Mensagem do presente: “{d.gift_message}”</p>}
          </div>

          {(d.payment_status || d.payments?.length > 0) && (
            <div className={o.block}>
              <h3 className={o.blockTitle}><FiCreditCard aria-hidden="true" /> Pagamento <PaymentBadge status={d.payment_status} /></h3>
              <dl className={s.kv}>
                {d.payment_method && <><dt>Forma</dt><dd>{methodText(d.payment_method, d.payment_installments)}</dd></>}
                {d.paid_at && <><dt>Pago em</dt><dd>{dateTime(d.paid_at)}</dd></>}
                {Number(d.pix_discount_amount) > 0 && <><dt>Desconto do Pix</dt><dd>- {money(d.pix_discount_amount)}</dd></>}
                {!d.payments?.length && <><dt>Tentativas</dt><dd>O cliente ainda não tentou pagar.</dd></>}
              </dl>
              {d.payments?.length > 0 && (
                <div className={s.list} style={{ marginTop: 10 }}>
                  {d.payments.map(pay => (
                    <div key={pay.id} className={s.listItem}>
                      <div className={s.listMain}>
                        <div className={s.listTitle}>{methodText(pay.method, pay.installments) || 'Pagamento'} de {money(pay.amount)}</div>
                        <div className={s.listSub}>{dateTime(pay.created_at)}{pay.provider_payment_id ? `, Mercado Pago ${pay.provider_payment_id}` : ''}{pay.status_detail ? `, ${pay.status_detail}` : ''}</div>
                      </div>
                      <PaymentBadge status={pay.status === 'in_process' ? 'pending' : pay.status === 'cancelled' ? 'expired' : pay.status} />
                      {pay.status === 'approved' && user?.role === 'super_admin' && (
                        <Button size="small" variant="danger" icon={<FiRotateCcw />} loading={busy === `refund-${pay.id}`} onClick={() => refund(pay)}>Estornar</Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {payments?.enabled && (
                <div className={o.contactLinks}>
                  <Button size="small" icon={<FiRefreshCw />} loading={busy === 'sync'} onClick={syncPayment}>Conferir no Mercado Pago</Button>
                </div>
              )}
            </div>
          )}

          <OrderInvoice orderId={id} orderStatus={d.status} paymentStatus={d.payment_status} />

          <div className={o.twoCol}>
            <div className={o.block}>
              <h3 className={o.blockTitle}>Cliente</h3>
              <div className={s.strong}>{d.customer_name || 'Sem nome'}</div>
              <div className={s.muted}>{d.customer_email}</div>
              <div className={s.muted}>{d.customer_phone}</div>
              <div className={o.contactLinks}>
                {d.customer_email && <Button size="small" icon={<FiMail />} onClick={() => { window.location.href = `mailto:${d.customer_email}` }}>E-mail</Button>}
                {phone && <Button size="small" icon={<FiPhone />} onClick={() => { window.location.href = `tel:+${phone.startsWith('55') ? phone : `55${phone}`}` }}>Ligar</Button>}
                {phone && <Button size="small" icon={<FaWhatsapp />} onClick={() => window.open(`https://wa.me/${phone.startsWith('55') ? phone : `55${phone}`}`, '_blank', 'noopener')}>WhatsApp</Button>}
              </div>
            </div>
            <div className={o.block}>
              <h3 className={o.blockTitle}>Entrega</h3>
              {addressLines.length ? (
                <address className={o.address}>{addressLines.map((l, i) => <div key={i}>{l}</div>)}</address>
              ) : <span className={s.muted}>Sem endereço no pedido.</span>}
              {addressLines.length > 0 && (
                <div className={o.contactLinks}>
                  <Button size="small" icon={<FiCopy />} onClick={() => copy(`${d.customer_name}\n${addressLines.join('\n')}`, 'Endereço')}>Copiar endereço</Button>
                </div>
              )}
            </div>
          </div>

          <div className={o.block}>
            <h3 className={o.blockTitle}>Rastreio e etiqueta</h3>
            <div className={o.tracking}>
              <TextField
                label="Código de rastreio"
                value={tracking}
                onChange={e => setTracking(e.target.value.toUpperCase())}
                placeholder="Ex.: BR123456789BR"
                hint={d.status === 'cancelled' ? undefined : 'Ao salvar, o pedido passa para enviado.'}
                disabled={d.status === 'cancelled'}
              />
              <Button icon={<FiSave />} onClick={saveTracking} loading={busy === 'tracking'} disabled={!tracking.trim() || tracking.trim() === (d.tracking_code || '') || d.status === 'cancelled'}>Salvar rastreio</Button>
              <Button icon={<FiPrinter />} onClick={printLabel} loading={busy === 'label'}>Imprimir etiqueta</Button>
            </div>
            {waLink && (
              <div className={o.contactLinks}>
                <Button icon={<FaWhatsapp />} onClick={() => window.open(waLink, '_blank', 'noopener')}>Mandar o rastreio no WhatsApp</Button>
              </div>
            )}
          </div>

          <div className={o.block}>
            <h3 className={o.blockTitle}>Notas internas <span className={s.muted} style={{ fontWeight: 500 }}>(o cliente não vê)</span></h3>
            {(d.notes || []).map((n, i) => (
              <div key={n.id || i} className={o.note}>
                <div className={o.noteText}>{n.note}</div>
                <div className={o.noteMeta}>{n.admin_username ? `${n.admin_username}, ` : ''}{dateTime(n.created_at)}</div>
              </div>
            ))}
            <div className={o.noteAdd}>
              <TextField label="Nova nota" value={note} onChange={e => setNote(e.target.value)} placeholder="Ex.: cliente pediu para entregar depois das 18h" maxLength={1000} />
              <Button icon={<FiPlus />} onClick={addNote} loading={busy === 'note'} disabled={!note.trim()}>Anotar</Button>
            </div>
          </div>
        </>
      )}
    </Dialog>
  )
}

export function OrdersMini({ orders }) {
  return (
    <div className={s.list}>
      {orders.map(x => (
        <Link key={x.id} to={`/admin/pedidos/${x.id}`} className={s.listItem}>
          <div className={s.listMain}>
            <div className={s.listTitle}>#{x.id}, {date(x.created_at)}</div>
            <div className={s.listSub}>{number(x.items_count || 0)} pares</div>
          </div>
          <div className={s.listEnd}>
            <div className={s.strong}>{money(x.total)}</div>
            <OrderBadge status={x.status} />
          </div>
        </Link>
      ))}
    </div>
  )
}

// Recarregar manualmente (usado em telas que ficam abertas muito tempo).
export function ReloadButton({ onClick, loading }) {
  return <Button variant="ghost" icon={<FiRefreshCw />} onClick={onClick} loading={loading} aria-label="Atualizar" />
}
