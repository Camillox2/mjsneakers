import { useEffect, useState } from 'react'
import { FiDownload, FiMail } from 'react-icons/fi'
import { FaWhatsapp } from 'react-icons/fa'
import api, { asPage } from '../lib/api'
import { useDebounced, useResource } from '../lib/hooks'
import { money, number, date, ago } from '../lib/format'
import { csvDownload } from '../lib/print'
import { PageHeader, Panel, Button, SearchField, DataTable, Pagination, ErrorNote, Skeleton, EmptyState, Dialog, Badge, useToast } from '../ui'
import { OrdersMini } from './Orders'
import { Stars } from '../art/Art'
import s from './sections.module.css'

const waLink = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '')
  if (digits.length < 10) return null
  return `https://wa.me/${digits.startsWith('55') ? digits : `55${digits}`}`
}

export default function Customers() {
  const toast = useToast()
  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim(), 350)
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState(null)
  const [exporting, setExporting] = useState(false)
  useEffect(() => { setPage(1) }, [q])

  const list = useResource(() => api.get('/customers', { params: { search: q || undefined, page, limit: 20 } }).then(r => asPage(r.data, page)), [q, page])
  const detail = useResource(() => (open ? api.get(`/customers/${encodeURIComponent(open.email)}`).then(r => r.data) : Promise.resolve(null)), [open?.email])

  const exportAll = async () => {
    setExporting(true)
    try {
      const rows = []
      for (let pg = 1; pg <= 40; pg++) {
        const { data } = await api.get('/customers', { params: { search: q || undefined, page: pg, limit: 50 } })
        const pageData = asPage(data, pg)
        rows.push(...pageData.items)
        if (pg >= pageData.pages) break
      }
      csvDownload(`clientes-${new Date().toISOString().slice(0, 10)}.csv`, ['nome', 'email', 'telefone', 'pedidos', 'total_gasto', 'ultimo_pedido'],
        rows.map(c => [c.name, c.email, c.phone, c.total_orders, Number(c.total_spent || 0).toFixed(2).replace('.', ','), date(c.last_order_at)]))
    } catch (err) { toast.error(err.message) } finally { setExporting(false) }
  }

  // o cliente aberto antes não aparece enquanto o novo carrega
  const d = detail.data && open && String(detail.data.email).toLowerCase() === String(open.email).toLowerCase() ? detail.data : null
  const wa = waLink(d?.phone || open?.phone)

  return (
    <div>
      <PageHeader
        title="Clientes"
        description="Quem já fez pedido na loja, reunido pelo e-mail. O total gasto conta só pedidos pagos."
        actions={<Button icon={<FiDownload />} onClick={exportAll} loading={exporting} disabled={!list.data?.total}>Baixar planilha</Button>}
      />
      <div className={s.filterBar}>
        <SearchField value={search} onChange={setSearch} placeholder="Nome, e-mail ou telefone" />
        {list.data && <span className={`${s.small} ${s.muted}`}>{list.data.total === 1 ? '1 cliente' : `${number(list.data.total)} clientes`}</span>}
      </div>
      <ErrorNote error={list.error} onRetry={list.reload} />
      <Panel flush>
        {list.loading && !list.data ? <div className={s.pad}><Skeleton lines={6} height={34} /></div> : (
          <DataTable
            rowKey="email"
            rows={list.data?.items || []}
            onRowClick={setOpen}
            dim={list.loading}
            columns={[
              {
                key: 'name', header: 'Cliente', primary: true,
                render: c => (
                  <div className={s.cellMain}>
                    <div className={s.listTitle}>{c.name || 'Sem nome'}</div>
                    <div className={s.listSub}>{c.email}</div>
                  </div>
                ),
              },
              { key: 'orders', header: 'Pedidos', align: 'right', render: c => number(c.total_orders) },
              { key: 'spent', header: 'Total gasto', align: 'right', render: c => <strong>{money(c.total_spent)}</strong> },
              { key: 'last', header: 'Último pedido', render: c => <span className={s.nowrap} title={date(c.last_order_at)}>{ago(c.last_order_at)}</span> },
            ]}
            empty={<EmptyState art={<Stars />} title={q ? 'Ninguém com essa busca' : 'Nenhum cliente ainda'}>{q ? 'Confira a grafia ou busque pelo e-mail.' : 'Cada pessoa que finaliza um pedido aparece aqui.'}</EmptyState>}
          />
        )}
      </Panel>
      <Pagination page={page} pages={list.data?.pages} onChange={setPage} />

      <Dialog
        open={!!open}
        onClose={() => setOpen(null)}
        title={open?.name || 'Cliente'}
        description={open?.email}
        footer={open && (
          <>
            {wa && <Button icon={<FaWhatsapp />} onClick={() => window.open(wa, '_blank', 'noopener,noreferrer')}>WhatsApp</Button>}
            <Button icon={<FiMail />} onClick={() => { window.location.href = `mailto:${open.email}` }}>Mandar e-mail</Button>
          </>
        )}
      >
        <ErrorNote error={detail.error} onRetry={detail.reload} />
        {!d ? (!detail.error && <Skeleton lines={5} height={24} />) : (
          <div className={s.grid}>
            <dl className={s.kv}>
              <dt>Telefone</dt><dd>{d.phone || 'Não informado'}</dd>
              <dt>Pedidos</dt><dd>{number(d.total_orders)}</dd>
              <dt>Total gasto</dt><dd><strong>{money(d.total_spent)}</strong> <span className={`${s.small} ${s.muted}`}>(só pedidos pagos)</span></dd>
              <dt>Primeira compra</dt><dd>{date(d.first_order_at)}</dd>
              <dt>Última compra</dt><dd>{date(d.last_order_at)} ({ago(d.last_order_at)})</dd>
              <dt>Pontos de fidelidade</dt><dd>{Number(d.loyalty_points) > 0 ? <Badge tone="info">{number(d.loyalty_points)} pontos</Badge> : 'Nenhum'}</dd>
            </dl>
            <div>
              <h3 className={s.sectionTitle}>Pedidos</h3>
              <OrdersMini orders={d.orders || []} />
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}
