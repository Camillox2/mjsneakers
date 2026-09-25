import { useEffect, useState } from 'react'
import { Link, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { FiDownload, FiPrinter, FiSave, FiMail, FiPhone, FiCopy, FiXCircle, FiPlus, FiRefreshCw, FiRotateCcw, FiCreditCard, FiAlertTriangle, FiShield } from 'react-icons/fi'
import { FaWhatsapp } from 'react-icons/fa'
import api, { asPage, downloadFile } from '../lib/api'
import { useDebounced, useResource } from '../lib/hooks'
import { useAdmin } from '../lib/context'
import { money, dateTime, date, ago, number } from '../lib/format'
import { ORDER_STATUS, ORDER_FLOW, OrderBadge, nextStatus, NEXT_ACTION, NEXT_DONE, PaymentBadge, AttemptBadge, PAYMENT_STATUS, methodText, paymentDetail } from '../lib/status'
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
  // os números das abas seguem a busca e o período (só o status fica de fora)
  const counts = useResource(
    () => api.get('/orders/status-counts', { params: { search: filters.search, date_from: filters.date_from, date_to: filters.date_to } }).then(r => r.data),
    [q, from, to]
  )
  const filtered = !!(q || status || from || to)
  const clearFilters = () => { setSearch(''); setParams(new URLSearchParams(), { replace: true }) }

  const advance = async (order) => {
    const next = nextStatus(order.status)
    if (!next) return
    setBusyId(order.id)
    try {
      await api.put(`/orders/${order.id}/status`, { status: next })
      toast.good(`Pedido #${order.id} ${NEXT_DONE[next]}. O cliente recebe um e-mail.`)
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
      const fetchStatus = (st) => api.get('/orders', { params: { status: st, limit: 100 } }).then(r => asPage(r.data))
      const [confirmed, processing] = await Promise.all([fetchStatus('confirmed'), fetchStatus('processing')])
      const orders = [...confirmed.items, ...processing.items].sort((a, b) => a.id - b.id)
      if (!orders.length) { toast.info('Nenhum pedido confirmado ou em separação agora.'); return }
      // a API entrega até 100 por status: avisa se ficou pedido de fora
      const left = confirmed.total + processing.total - orders.length
      if (left > 0) toast.info(`A lista saiu com os ${orders.length} pedidos mais recentes. Faltaram ${left}: imprima de novo depois de separar estes.`)
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
        <div className={o.payCell}>
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
        // com o Mercado Pago ligado, o pedido se confirma sozinho quando o pagamento entra
        if (next === 'confirmed' && payments?.enabled && r.payment_status !== 'approved') return <span className={o.orderDate}>Confirma sozinho quando pagar</span>
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
        description="Abra um pedido para ver os itens, o pagamento, o endereço, o rastreio e as notas."
        actions={<>
          <Button icon={<FiPrinter />} onClick={printPicking} loading={picking}>Lista de separação</Button>
          <Button icon={<FiDownload />} onClick={exportCsv} loading={exporting}>Baixar planilha</Button>
        </>}
      />

      <div className={o.statusScroll}>
        <Segmented label="Filtrar pedidos por status" options={statusOptions} value={status} onChange={v => setParam({ status: v })} />
      </div>

      <div className={o.filters}>
        <SearchField value={search} onChange={setSearch} placeholder="Nome, e-mail, telefone ou nº do pedido" />
        <div className={o.dates}>
          <label className={o.dateLabel} htmlFor="ped-de">De</label>
          <input id="ped-de" className={o.dateInput} type="date" value={from} max={to || undefined} onChange={e => setParam({ de: e.target.value })} />
          <label className={o.dateLabel} htmlFor="ped-ate">até</label>
          <input id="ped-ate" className={o.dateInput} type="date" value={to} min={from || undefined} onChange={e => setParam({ ate: e.target.value })} />
          {(from || to) && <Button size="small" variant="ghost" onClick={() => setParam({ de: '', ate: '' })}>Limpar datas</Button>}
        </div>
      </div>

      <ErrorNote error={list.error} onRetry={list.reload} />

      <Panel flush>
        {list.loading && !list.data ? (
          <div className={s.pad}><Skeleton lines={6} height={36} /></div>
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            onRowClick={open}
            dim={list.loading}
            empty={
              <EmptyState
                art={<Receipt />}
                title={filtered ? 'Nenhum pedido com esses filtros' : 'Nenhum pedido ainda'}
                action={filtered ? <Button onClick={clearFilters}>Limpar filtros</Button> : undefined}
              >
                {filtered ? 'Tente outro status, outro período ou outra busca.' : 'Os pedidos da loja aparecem aqui assim que alguém finalizar uma compra.'}
              </EmptyState>
            }
          />
        )}
      </Panel>
      <Pagination page={page} pages={list.data?.pages} onChange={p => setParam({ pagina: String(p) })} />
    </div>
  )
}

/* ================= Detalhe ================= */

function Timeline({ status }) {
  const idx = ORDER_FLOW.indexOf(status)
  const pct = idx <= 0 ? 0 : idx / (ORDER_FLOW.length - 1)
  return (
    <div className={o.timeline} role="img" aria-label={`Andamento do pedido: ${ORDER_STATUS[status]?.label || status}`}>
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
      <div className={o.timelineDots} aria-hidden="true">
        {ORDER_FLOW.map((st, i) => (
          <motion.span
            key={st}
            className={`${o.timelineDot} ${i <= idx ? o.timelineDotDone : ''}`}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1 + i * 0.08 }}
          />
        ))}
      </div>
      <div className={o.steps} aria-hidden="true">
        {ORDER_FLOW.map((st, i) => (
          <span key={st} className={`${o.step} ${i <= idx ? o.stepDone : ''}`}>{ORDER_STATUS[st].label}</span>
        ))}
      </div>
    </div>
  )
}

// Pagamento do pedido: situação, cada tentativa no Mercado Pago e o estorno.
function PaymentBlock({ order: d, busy, onSync, onRefund }) {
  const { payments, user } = useAdmin()
  const attempts = d.payments || []
  const approved = attempts.filter(p => p.status === 'approved')
  const owner = user?.role === 'super_admin'
  const canRefund = owner && !!user?.totp_enabled
  // O que pede ação aparece antes da lista, em frase.
  const alerts = []
  if (approved.length > 1) alerts.push('Este pedido foi pago mais de uma vez. Estorne o pagamento que sobrou.')
  if (d.status === 'cancelled' && d.payment_status === 'approved') alerts.push('O pedido foi cancelado, mas está pago. Estorne o pagamento para o dinheiro voltar ao cliente.')
  if (d.payment_status === 'charged_back') alerts.push('O cliente contestou a compra no cartão. Responda a contestação pelo Mercado Pago.')

  return (
    <div className={o.block}>
      <h3 className={o.blockTitle}><FiCreditCard aria-hidden="true" /> Pagamento <PaymentBadge status={d.payment_status} /></h3>
      {alerts.map(a => (
        <p key={a} className={o.payAlert}><FiAlertTriangle aria-hidden="true" />{a}</p>
      ))}
      <dl className={s.kv}>
        {d.payment_method && <><dt>Forma</dt><dd>{methodText(d.payment_method, d.payment_installments)}</dd></>}
        {d.paid_at && <><dt>Pago em</dt><dd>{dateTime(d.paid_at)}</dd></>}
        {!attempts.length && <><dt>Tentativas</dt><dd>{d.status === 'pending' ? 'O cliente ainda não tentou pagar.' : 'Nenhuma pelo Mercado Pago (pago por fora).'}</dd></>}
      </dl>
      {attempts.length > 0 && (
        <ul className={o.attempts} aria-label="Tentativas de pagamento">
          {attempts.map(pay => {
            const why = paymentDetail(pay.status_detail)
            return (
              <li key={pay.id} className={o.attempt}>
                <div className={o.attemptMain}>
                  <div className={s.strong}>{methodText(pay.method, pay.installments) || 'Pagamento'} de {money(pay.amount)}</div>
                  <div className={o.attemptSub}>
                    {dateTime(pay.created_at)}{why ? `, ${why}` : ''}
                    {pay.provider_payment_id && <><br />Nº no Mercado Pago: {pay.provider_payment_id}</>}
                  </div>
                </div>
                <AttemptBadge status={pay.status} method={pay.method} />
                {pay.status === 'approved' && canRefund && (
                  <Button size="small" variant="danger" icon={<FiRotateCcw />} loading={busy === `refund-${pay.id}`} disabled={!!busy} onClick={() => onRefund(pay)}>Estornar</Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {approved.length > 0 && !canRefund && (
        <p className={o.payHint}>
          <FiShield aria-hidden="true" />
          {!owner
            ? <span>Só o dono da loja pode estornar um pagamento.</span>
            : <span>Para estornar, ligue a verificação em duas etapas na sua conta. <Link className={s.linkBtn} to="/admin/equipe?duas-etapas=1">Ligar agora</Link></span>}
        </p>
      )}
      {payments?.enabled && (
        <div className={o.contactLinks}>
          <Button size="small" icon={<FiRefreshCw />} loading={busy === 'sync'} disabled={!!busy} onClick={onSync}>Conferir no Mercado Pago</Button>
        </div>
      )}
    </div>
  )
}

function OrderDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const confirm = useConfirm()
  const { refreshCounts, payments } = useAdmin()
  const order = useResource(() => api.get(`/orders/${id}`).then(r => r.data), [id])
  const [tracking, setTracking] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState('')
  const [waLink, setWaLink] = useState('')

  // o pedido anterior não aparece enquanto o novo carrega
  const d = order.data && String(order.data.id) === String(id) ? order.data : null
  useEffect(() => { if (d) setTracking(d.tracking_code || '') }, [d])
  useEffect(() => { setNote(''); setWaLink('') }, [id])

  const close = () => (location.state?.fromList ? navigate(-1) : navigate('/admin/pedidos'))

  const changeStatus = async (next) => {
    const cancel = next === 'cancelled'
    const unpaid = next === 'confirmed' && payments?.enabled && d?.payment_status !== 'approved'
    const paid = d?.payment_status === 'approved'
    const ok = await confirm({
      title: cancel ? `Cancelar o pedido #${id}?` : {
        confirmed: `Confirmar o pedido #${id}?`,
        processing: `Separar o pedido #${id}?`,
        shipped: `Marcar o pedido #${id} como enviado?`,
        delivered: `Marcar o pedido #${id} como entregue?`,
      }[next],
      message: cancel
        ? `Os pares voltam para a grade, os pontos de fidelidade do pedido são estornados e o cliente recebe um e-mail avisando.${paid ? ' O pagamento não volta sozinho: depois, estorne no bloco Pagamento.' : ''} Depois de cancelado, o pedido não muda mais de status.`
        : unpaid
          ? 'O Mercado Pago ainda não confirmou o pagamento deste pedido. Só confirme se você recebeu por fora (Pix direto, dinheiro). O cliente recebe um e-mail com o novo status.'
          : `O pedido passa para "${ORDER_STATUS[next].label.toLowerCase()}" e o cliente recebe um e-mail.`,
      confirmLabel: cancel ? 'Cancelar pedido' : NEXT_ACTION[next],
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
        ? `Pedido #${id} cancelado. Estoque devolvido${points ? `, ${number(points)} pontos ganhos estornados` : ''}${refunded ? `, ${number(refunded)} pontos usados devolvidos ao cliente` : ''}.`
        : `Pedido #${id} ${NEXT_DONE[next]}.`)
      // cancelou um pedido que já estava pago: o dinheiro não volta sozinho
      if (res?.payment_refund_needed) toast.info('Este pedido estava pago. Estorne no bloco Pagamento para o dinheiro voltar ao cliente.')
      order.reload(); refreshCounts()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy('')
    }
  }

  const saveTracking = async (e) => {
    e?.preventDefault()
    const code = tracking.trim()
    if (!code || code === (d?.tracking_code || '') || busy) return
    setBusy('tracking')
    try {
      const { data } = await api.put(`/orders/${id}/tracking`, { tracking_code: code })
      if (data?.wa_link) setWaLink(data.wa_link)
      toast.good(data?.status === 'shipped' && d?.status !== 'shipped' ? 'Rastreio salvo e pedido marcado como enviado.' : 'Rastreio salvo.')
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

  const addNote = async (e) => {
    e?.preventDefault()
    if (!note.trim() || busy) return
    setBusy('note')
    try {
      await api.post(`/orders/${id}/notes`, { note: note.trim() })
      setNote('')
      toast.good('Anotado.')
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
      const label = PAYMENT_STATUS[res?.payment_status]?.label
      toast.good(res?.synced === 0
        ? 'Conferido: o Mercado Pago não tem pagamento deste pedido.'
        : `Conferido no Mercado Pago: ${(label || 'sem mudança').toLowerCase()}.`)
      order.reload(); refreshCounts()
    } catch (err) { toast.error(err.message) } finally { setBusy('') }
  }

  const refund = async (pay) => {
    const ok = await confirm({
      title: `Estornar ${money(pay.amount)}?`,
      message: 'O valor volta para o cliente pelo Mercado Pago. Se o pedido ainda não saiu, ele é cancelado e os pares voltam para o estoque. Não dá para desfazer.',
      confirmLabel: 'Estornar pagamento',
      tone: 'danger',
    })
    if (!ok) return
    setBusy(`refund-${pay.id}`)
    try {
      await api.post(`/payments/${pay.id}/refund`)
      toast.good('Pagamento estornado. O cliente recebe o valor pelo Mercado Pago.')
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
  const intl = phone.startsWith('55') ? phone : `55${phone}`
  // Pagamento aparece com o Mercado Pago ligado ou quando o pedido já tem algum registro dele.
  const showPayment = d && (payments?.enabled || d.payments?.length > 0 || (d.payment_status && d.payment_status !== 'unpaid'))
  const beforeShipped = d && ['pending', 'confirmed', 'processing'].includes(d.status)

  return (
    <Dialog
      open
      routed
      onClose={close}
      size="l"
      title={`Pedido #${id}`}
      description={d ? `Feito em ${dateTime(d.created_at)}, ${ago(d.created_at)}` : 'Carregando'}
      footer={d && d.status !== 'cancelled' && d.status !== 'delivered' ? (
        <>
          <Button variant="danger" icon={<FiXCircle />} onClick={() => changeStatus('cancelled')} loading={busy === 'cancelled'} disabled={!!busy}>Cancelar pedido</Button>
          {next && <Button variant="primary" onClick={() => changeStatus(next)} loading={busy === next} disabled={!!busy}>{NEXT_ACTION[next]}</Button>}
        </>
      ) : null}
    >
      <ErrorNote error={order.error} onRetry={order.reload} />
      {!d ? (!order.error && <Skeleton lines={8} height={20} />) : (
        <>
          {d.status === 'cancelled' ? (
            <div className={o.cancelNote}><FiXCircle aria-hidden="true" /><span>Pedido cancelado. Os pares já voltaram para o estoque.</span></div>
          ) : <Timeline status={d.status} />}

          <div className={`${o.block} ${o.blockFirst}`}>
            <h3 className={o.blockTitle}>Itens <OrderBadge status={d.status} /></h3>
            {items.map((it, i) => (
              <div key={it.id || i} className={o.item}>
                <img className={s.thumb} src={getImageUrl(it.image_url, it.product_name)} alt="" loading="lazy" />
                <div className={o.itemMain}>
                  <div className={o.itemName}>{it.product_name || it.name || 'Produto que saiu do catálogo'}</div>
                  <div className={o.itemMeta}>Tamanho {it.size}, {it.quantity} {Number(it.quantity) === 1 ? 'par' : 'pares'} de {money(it.price)}</div>
                </div>
                <div className={o.itemPrice}>{money(Number(it.price) * Number(it.quantity))}</div>
              </div>
            ))}
            <dl className={o.totals}>
              <dt>Subtotal</dt><dd>{money(subtotal)}</dd>
              {Number(d.discount_amount) > 0 && <><dt>Cupom{d.coupon_code ? ` ${d.coupon_code}` : ''}</dt><dd>- {money(d.discount_amount)}</dd></>}
              {Number(d.points_discount) > 0 && <><dt>Pontos de fidelidade ({number(d.points_used)})</dt><dd>- {money(d.points_discount)}</dd></>}
              <dt>Frete{d.shipping_type ? ` (${d.shipping_type})` : ''}</dt><dd>{Number(d.shipping_price) > 0 ? money(d.shipping_price) : 'Grátis'}</dd>
              {d.gift_wrap ? <><dt>Embrulho de presente</dt><dd>{Number(d.gift_wrap_price) > 0 ? money(d.gift_wrap_price) : 'Grátis'}</dd></> : null}
              {Number(d.pix_discount_amount) > 0 && <><dt>Desconto do Pix</dt><dd>- {money(d.pix_discount_amount)}</dd></>}
              <dt className={o.totalFinal}>Total</dt><dd className={o.totalFinal}>{money(d.total)}</dd>
            </dl>
            {d.gift_message && <p className={o.giftNote}>Mensagem do presente: “{d.gift_message}”</p>}
          </div>

          {showPayment && <PaymentBlock order={d} busy={busy} onSync={syncPayment} onRefund={refund} />}

          <OrderInvoice orderId={id} orderStatus={d.status} paymentStatus={d.payment_status} />

          <div className={o.twoCol}>
            <div className={o.block}>
              <h3 className={o.blockTitle}>Cliente</h3>
              <div className={s.strong}>{d.customer_name || 'Sem nome'}</div>
              <div className={`${s.muted} ${o.wrapAny}`}>{d.customer_email}</div>
              <div className={s.muted}>{d.customer_phone}</div>
              <div className={o.contactLinks}>
                {d.customer_email && <Button size="small" icon={<FiMail />} onClick={() => { window.location.href = `mailto:${d.customer_email}` }}>E-mail</Button>}
                {phone && <Button size="small" icon={<FiPhone />} onClick={() => { window.location.href = `tel:+${intl}` }}>Ligar</Button>}
                {phone && <Button size="small" icon={<FaWhatsapp />} onClick={() => window.open(`https://wa.me/${intl}`, '_blank', 'noopener')}>WhatsApp</Button>}
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
            <form className={o.tracking} onSubmit={saveTracking}>
              <TextField
                label="Código de rastreio"
                value={tracking}
                onChange={e => setTracking(e.target.value.toUpperCase())}
                placeholder="Ex.: BR123456789BR"
                maxLength={100}
                autoCapitalize="characters"
                spellCheck={false}
                hint={d.status === 'cancelled'
                  ? 'Pedido cancelado não recebe rastreio.'
                  : beforeShipped ? 'Ao salvar, o pedido passa para enviado e o cliente recebe o código por e-mail.' : 'Se trocar o código, o cliente recebe o novo por e-mail.'}
                disabled={d.status === 'cancelled'}
              />
              <Button type="submit" icon={<FiSave />} loading={busy === 'tracking'} disabled={!tracking.trim() || tracking.trim() === (d.tracking_code || '') || d.status === 'cancelled' || (!!busy && busy !== 'tracking')}>Salvar rastreio</Button>
              <Button icon={<FiPrinter />} onClick={printLabel} loading={busy === 'label'} disabled={d.status === 'cancelled' || (!!busy && busy !== 'label')}>Imprimir etiqueta</Button>
            </form>
            {waLink && (
              <div className={o.contactLinks}>
                <Button icon={<FaWhatsapp />} onClick={() => window.open(waLink, '_blank', 'noopener')}>Mandar o rastreio no WhatsApp</Button>
              </div>
            )}
          </div>

          <div className={o.block}>
            <h3 className={o.blockTitle}>Notas internas <span className={o.blockNote}>(o cliente não vê)</span></h3>
            {(d.notes || []).map((n, i) => (
              <div key={n.id || i} className={o.note}>
                <div className={o.noteText}>{n.note}</div>
                <div className={o.noteMeta}>{n.admin_username ? `${n.admin_username}, ` : ''}{dateTime(n.created_at)}</div>
              </div>
            ))}
            <form className={o.noteAdd} onSubmit={addNote}>
              <TextField label="Nova nota" value={note} onChange={e => setNote(e.target.value)} placeholder="Ex.: cliente pediu para entregar depois das 18h" maxLength={2000} />
              <Button type="submit" icon={<FiPlus />} loading={busy === 'note'} disabled={!note.trim() || (!!busy && busy !== 'note')}>Anotar</Button>
            </form>
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
