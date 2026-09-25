import { useEffect, useRef, useState } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import { FiEdit2, FiDownload, FiUploadCloud, FiPlus, FiTrash2, FiFileText, FiExternalLink, FiX } from 'react-icons/fi'
import api, { asList, asPage, downloadFile } from '../lib/api'
import { useDebounced, useResource } from '../lib/hooks'
import { number, plural, dateTime, date } from '../lib/format'
import { csvDownload } from '../lib/print'
import { getImageUrl } from '../../../utils/imageHelper'
import {
  PageHeader, Panel, SubNav, Button, ButtonLink, SearchField, Segmented, Select, DataTable, Pagination, ErrorNote, Skeleton,
  EmptyState, Dialog, TextField, Switch, Badge, SizeRun, SizeRunEditor, RunLegend, useConfirm, useToast,
} from '../ui'
import { EmptyRun, Stars, Envelope, ChartSketch, Tag } from '../art/Art'
import s from './sections.module.css'
import st from './Stock.module.css'

// Link para o produto que, ao fechar o editor, volta para cá (e não para a lista de produtos).
const FROM_HERE = { fromList: true }

export default function Stock() {
  return (
    <div>
      <PageHeader title="Estoque" description="Pares por tamanho, o que está acabando e quem está esperando reposição." />
      <SubNav items={[
        { to: '/admin/estoque', label: 'Grade', end: true },
        { to: '/admin/estoque/alertas', label: 'Acabando' },
        { to: '/admin/estoque/avise-me', label: 'Avise-me' },
        { to: '/admin/estoque/movimentacoes', label: 'Movimentações' },
        { to: '/admin/estoque/previsao', label: 'Previsão' },
        { to: '/admin/estoque/fornecedores', label: 'Fornecedores' },
        { to: '/admin/estoque/planilha', label: 'Planilha' },
      ]} />
      <Routes>
        <Route index element={<GradeTab />} />
        <Route path="alertas" element={<LowTab />} />
        <Route path="avise-me" element={<WaitlistTab />} />
        <Route path="movimentacoes" element={<HistoryTab />} />
        <Route path="previsao" element={<ForecastTab />} />
        <Route path="fornecedores" element={<SuppliersTab />} />
        <Route path="planilha" element={<SheetTab />} />
      </Routes>
    </div>
  )
}

function ProductCell({ name, brand, image }) {
  return (
    <div className={st.prod}>
      <img className={s.thumb} src={getImageUrl(image, name)} alt="" loading="lazy" />
      <div className={st.prodText}>
        <div className={s.listTitle}>{name}</div>
        <div className={s.listSub}>{brand || 'Sem marca'}</div>
      </div>
    </div>
  )
}

// Topo do cartão no celular: produto com o total ao lado.
function CardHead({ children, total }) {
  return (
    <div className={st.cardHead}>
      {children}
      <span className={st.cardTotal}><strong>{number(total)}</strong><span>{Number(total) === 1 ? 'par' : 'pares'}</span></span>
    </div>
  )
}

/* ---------- Ajuste rápido da grade ---------- */

function AdjustDialog({ product, onClose, onSaved }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [run, setRun] = useState(null)
  const [changed, setChanged] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!product) return undefined
    // só a resposta do produto aberto agora entra (trocar rápido não mistura grades)
    let live = true
    setRun(null); setError(null); setChanged(false)
    api.get(`/stock/product/${product.id}/sizes`)
      .then(r => { if (live) setRun(asList(r.data).map(x => ({ size: String(x.size), stock: Number(x.stock) || 0, reserved: Number(x.reserved) || 0 }))) })
      .catch(err => { if (live) setError(err) })
    return () => { live = false }
  }, [product, attempt])

  const canClose = async () => !changed || confirm({
    title: 'Descartar o ajuste?',
    message: 'Os pares que você mudou ainda não foram salvos.',
    confirmLabel: 'Descartar',
    cancelLabel: 'Continuar ajustando',
    tone: 'danger',
  })

  const save = async () => {
    if (saving || !run?.length) return
    setSaving(true)
    try {
      await api.put(`/stock/product/${product.id}/sizes`, run.map(x => ({ size: x.size, stock: Number(x.stock) || 0 })))
      toast.good(`Grade de "${product.name}" salva.`)
      setChanged(false)
      onSaved?.()
      onClose()
    } catch (err) { toast.error(err.message) } finally { setSaving(false) }
  }

  const total = (run || []).reduce((n, x) => n + (Number(x.stock) || 0), 0)
  const reserved = (run || []).some(x => x.reserved > 0)

  return (
    <Dialog
      open={!!product}
      onClose={onClose}
      canClose={canClose}
      title="Ajustar pares"
      description={product ? `${product.name}, ${plural(total, 'par', 'pares')} no total` : ''}
      footer={<>
        <Button variant="ghost" onClick={async () => { if (await canClose()) onClose() }}>Cancelar</Button>
        <Button variant="primary" onClick={save} loading={saving} disabled={!run?.length || !changed}>Salvar grade</Button>
      </>}
    >
      <ErrorNote error={error} onRetry={() => setAttempt(n => n + 1)} />
      {!run && !error ? <Skeleton lines={3} height={60} /> : run?.length ? (
        <div className={s.formGrid}>
          <SizeRunEditor value={run} onChange={v => { setRun(v); setChanged(true) }} fixed />
          {reserved && <p className={st.note}>"Em sacolas" são pares que alguém colocou no carrinho. Ficam guardados por 15 minutos.</p>}
          <p className={st.note}>
            Para incluir ou tirar tamanhos, <Link className={s.linkBtn} to={`/admin/produtos/${product?.id}`} state={FROM_HERE}>abra o produto</Link>.
          </p>
        </div>
      ) : run ? (
        <EmptyState art={<EmptyRun />} title="Este produto não tem grade" action={<ButtonLink to={`/admin/produtos/${product?.id}`} state={FROM_HERE}>Montar a grade no produto</ButtonLink>}>
          Sem tamanhos, ele não pode ser vendido.
        </EmptyState>
      ) : null}
    </Dialog>
  )
}

/* ---------- Grade ---------- */

function GradeTab() {
  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim(), 350)
  const [stock, setStock] = useState('')
  const [page, setPage] = useState(1)
  const [adjust, setAdjust] = useState(null)
  useEffect(() => { setPage(1) }, [q, stock])

  const list = useResource(
    () => api.get('/products/admin', { params: { search: q || undefined, status: 'active', stock: stock || undefined, sort: 'stock', page, limit: 20 } }).then(r => asPage(r.data, page)),
    [q, stock, page]
  )
  const totals = useResource(async () => {
    const count = (level) => api.get('/products/admin', { params: { status: 'active', stock: level, limit: 1 } }).then(r => Number(r.data?.total || 0))
    const [out, low, ok] = await Promise.all([count('out'), count('low'), count('ok')])
    return { out, low, ok }
  }, [])
  const t = totals.data
  const filtered = q || stock

  const columns = [
    { key: 'name', header: 'Produto', primary: true, render: r => <ProductCell name={r.name} brand={r.brand_name} image={r.image_url} /> },
    { key: 'grade', header: 'Grade', hideOnCard: true, render: r => <div className={st.runWide}><SizeRun sizes={r.size_stock} animate={false} /></div> },
    { key: 'total', header: 'Pares', align: 'right', hideOnCard: true, render: r => <strong>{number(r.total_stock ?? r.stock)}</strong> },
    { key: 'act', header: '', render: r => <Button size="small" icon={<FiEdit2 />} aria-label={`Ajustar os pares de ${r.name}`} onClick={() => setAdjust(r)}>Ajustar</Button> },
  ]

  return (
    <div className={s.grid}>
      <Segmented
        label="Filtro de estoque"
        value={stock}
        onChange={setStock}
        options={[
          { value: '', label: 'Todos', count: t ? t.out + t.low + t.ok : undefined },
          { value: 'out', label: 'Esgotados', count: t?.out },
          { value: 'low', label: 'Acabando', count: t?.low },
          { value: 'ok', label: 'Com estoque', count: t?.ok },
        ]}
      />
      <div className={`${st.bar} ${st.barSplit}`}>
        <SearchField value={search} onChange={setSearch} placeholder="Buscar produto" />
        <RunLegend />
      </div>
      <ErrorNote error={list.error} onRetry={list.reload} />
      <Panel flush>
        {list.loading && !list.data ? <div className={st.pad}><Skeleton lines={6} height={40} /></div> : (
          <DataTable
            columns={columns}
            rows={list.data?.items || []}
            onRowClick={setAdjust}
            dim={list.loading}
            cardTop={r => (
              <div className={st.cardTop}>
                <CardHead total={r.total_stock ?? r.stock}><ProductCell name={r.name} brand={r.brand_name} image={r.image_url} /></CardHead>
                <SizeRun sizes={r.size_stock} animate={false} />
              </div>
            )}
            empty={
              <EmptyState
                art={<EmptyRun />}
                title={filtered ? 'Nada com esse filtro' : 'Nenhum produto na loja'}
                action={filtered
                  ? <Button icon={<FiX />} onClick={() => { setSearch(''); setStock('') }}>Limpar filtros</Button>
                  : <ButtonLink to="/admin/produtos/novo" variant="primary" icon={<FiPlus />}>Cadastrar produto</ButtonLink>}
              >
                {filtered ? 'Troque o filtro ou limpe a busca.' : 'A grade aparece aqui quando houver produto na loja.'}
              </EmptyState>
            }
          />
        )}
      </Panel>
      <Pagination page={page} pages={list.data?.pages} onChange={setPage} />
      <AdjustDialog product={adjust} onClose={() => setAdjust(null)} onSaved={() => { list.reload(); totals.reload() }} />
    </div>
  )
}

/* ---------- Acabando ---------- */

function LowTab() {
  const [adjust, setAdjust] = useState(null)
  const low = useResource(() => api.get('/stock/low-stock').then(r => asList(r.data)), [])
  const rows = low.data || []
  const situation = (r) => (Number(r.stock) <= 0 ? <Badge tone="critical">Esgotado</Badge> : <Badge tone="warning">Acabando</Badge>)
  return (
    <div className={s.grid}>
      <p className={st.note}>Produtos na loja com o total igual ou abaixo do aviso de cada um (5 pares, se ninguém mudou). O aviso muda no cadastro do produto.</p>
      <ErrorNote error={low.error} onRetry={low.reload} />
      <Panel flush>
        {low.loading && !low.data ? <div className={st.pad}><Skeleton lines={5} height={40} /></div> : (
          <DataTable
            rowKey="id"
            rows={rows}
            onRowClick={setAdjust}
            cardTop={r => (
              <CardHead total={r.stock}><ProductCell name={r.name} brand={r.brand} image={r.image_url} /></CardHead>
            )}
            columns={[
              { key: 'name', header: 'Produto', primary: true, render: r => <ProductCell name={r.name} brand={r.brand} image={r.image_url} /> },
              { key: 'stock', header: 'Pares', align: 'right', hideOnCard: true, render: r => <strong>{number(r.stock)}</strong> },
              { key: 'th', header: 'Avisa com', align: 'right', render: r => plural(r.threshold, 'par', 'pares') },
              { key: 'st', header: 'Situação', render: situation },
              {
                key: 'act', header: '',
                render: r => (
                  <div className={st.actions}>
                    <Button size="small" icon={<FiEdit2 />} aria-label={`Repor os pares de ${r.name}`} onClick={() => setAdjust(r)}>Repor</Button>
                    <ButtonLink to={`/admin/produtos/${r.id}`} state={FROM_HERE} size="small" variant="ghost" icon={<FiExternalLink />} aria-label={`Abrir o cadastro de ${r.name}`} />
                  </div>
                ),
              },
            ]}
            empty={<EmptyState art={<Stars />} title="Nada acabando">Todos os produtos na loja estão acima do aviso de estoque.</EmptyState>}
          />
        )}
      </Panel>
      <AdjustDialog product={adjust} onClose={() => setAdjust(null)} onSaved={low.reload} />
    </div>
  )
}

/* ---------- Avise-me ---------- */

function WaitlistTab() {
  const alerts = useResource(() => api.get('/stock-alerts').then(r => asList(r.data)), [])
  const [onlyWaiting, setOnlyWaiting] = useState(true)
  const all = alerts.data || []
  const rows = onlyWaiting ? all.filter(a => !a.notified) : all

  // agrupa por produto e tamanho: o que mais gente quer aparece primeiro
  const groups = Object.values(rows.reduce((acc, a) => {
    const k = `${a.product_id}-${a.size || ''}`
    acc[k] = acc[k] || { key: k, product_id: a.product_id, product_name: a.product_name, size: a.size, people: [] }
    acc[k].people.push(a)
    return acc
  }, {})).sort((a, b) => b.people.length - a.people.length)

  const exportCsv = () => csvDownload(
    `avise-me-${new Date().toISOString().slice(0, 10)}.csv`,
    ['produto', 'tamanho', 'email', 'avisado', 'pedido_em'],
    rows.map(a => [a.product_name, a.size || '', a.email, a.notified ? 'sim' : 'não', dateTime(a.created_at)])
  )

  return (
    <div className={s.grid}>
      <div className={st.bar}>
        <Switch checked={onlyWaiting} onChange={setOnlyWaiting} label="Só quem ainda está esperando" />
        <span className={st.spacer} />
        <Button icon={<FiDownload />} onClick={exportCsv} disabled={!rows.length}>Baixar lista</Button>
      </div>
      <p className={st.note}>Quando o tamanho volta ao estoque, a loja manda o e-mail sozinha.</p>
      <ErrorNote error={alerts.error} onRetry={alerts.reload} />
      {alerts.loading && !alerts.data ? <Panel><Skeleton lines={4} height={36} /></Panel> : groups.length ? (
        <div className={s.cardGrid}>
          {groups.map(g => (
            <Panel key={g.key} title={g.product_name || `Produto ${g.product_id}`} subtitle={g.size ? `tamanho ${g.size}` : 'qualquer tamanho'}
              actions={<Link className={s.linkBtn} to={`/admin/produtos/${g.product_id}`} state={FROM_HERE} aria-label={`Abrir o cadastro de ${g.product_name || 'produto'}`}>Abrir</Link>}>
              <p className={st.people}>{plural(g.people.length, 'pessoa', 'pessoas')}</p>
              <div className={s.list}>
                {g.people.slice(0, 5).map(a => (
                  <div key={a.id} className={`${s.listItem} ${st.person}`}>
                    <span className={s.listMain}><span className={`${s.small} ${st.personEmail}`}>{a.email}</span></span>
                    <span className={`${s.small} ${s.muted}`}>{a.notified ? 'avisado' : date(a.created_at)}</span>
                  </div>
                ))}
                {g.people.length > 5 && <span className={`${s.small} ${s.muted}`}>e mais {number(g.people.length - 5)}</span>}
              </div>
            </Panel>
          ))}
        </div>
      ) : (
        <Panel><EmptyState art={<Envelope />} title="Ninguém esperando reposição">Quando um tamanho esgota, o cliente pode deixar o e-mail na página do produto. A lista aparece aqui.</EmptyState></Panel>
      )}
    </div>
  )
}

/* ---------- Movimentações ---------- */

const TYPES = { sale: { label: 'Venda', tone: 'info' }, adjustment: { label: 'Ajuste', tone: 'neutral' }, return: { label: 'Devolução', tone: 'good' }, import: { label: 'Planilha', tone: 'neutral' } }
// motivo padrão do ajuste manual não diz nada além do próprio tipo
const PLAIN_REASONS = ['Ajuste manual de estoque', 'Importação CSV']

function HistoryTab() {
  const [productId, setProductId] = useState('')
  const [type, setType] = useState('')
  const [page, setPage] = useState(1)
  useEffect(() => { setPage(1) }, [productId, type])
  const products = useResource(() => api.get('/products/admin', { params: { status: 'all', sort: 'name', limit: 100 } }).then(r => asList(r.data)), [])
  const hist = useResource(
    () => api.get('/stock/history', { params: { product_id: productId || undefined, type: type || undefined, page, limit: 30 } }).then(r => asPage(r.data, page)),
    [productId, type, page]
  )
  const productName = (r) => r.product_name || `Produto ${r.product_id}`
  return (
    <div className={s.grid}>
      <div className={st.filters}>
        <Select className={st.filterSelect} aria-label="Produto" placeholder="Todos os produtos" value={productId} onChange={e => setProductId(e.target.value)} options={(products.data || []).map(x => ({ value: String(x.id), label: x.name }))} />
        <Select className={st.filterSelect} aria-label="Tipo de movimentação" placeholder="Todos os tipos" value={type} onChange={e => setType(e.target.value)} options={Object.entries(TYPES).map(([value, m]) => ({ value, label: m.label }))} />
      </div>
      <ErrorNote error={hist.error} onRetry={hist.reload} />
      <Panel flush>
        {hist.loading && !hist.data ? <div className={st.pad}><Skeleton lines={6} height={30} /></div> : (
          <DataTable
            rows={hist.data?.items || []}
            dim={hist.loading}
            cardTop={r => (
              <div>
                <div className={s.listTitle}>{productName(r)}{r.size ? `, tamanho ${r.size}` : ''}</div>
                <div className={s.listSub}>{dateTime(r.created_at)}</div>
              </div>
            )}
            columns={[
              { key: 'when', header: 'Quando', primary: true, render: r => <span className={s.nowrap}>{dateTime(r.created_at)}</span> },
              { key: 'prod', header: 'Produto', hideOnCard: true, render: productName },
              { key: 'size', header: 'Tamanho', hideOnCard: true, render: r => r.size || '' },
              {
                key: 'type', header: 'Tipo',
                render: r => (
                  <span>
                    <Badge tone={TYPES[r.type]?.tone}>{TYPES[r.type]?.label || 'Outro'}</Badge>
                    {r.order_id
                      ? <span className={st.reason}><Link className={s.linkBtn} to={`/admin/pedidos/${r.order_id}`}>Pedido #{r.order_id}</Link></span>
                      : r.reason && !PLAIN_REASONS.includes(r.reason) && <span className={st.reason}>{r.reason}</span>}
                  </span>
                ),
              },
              { key: 'chg', header: 'Mudou', align: 'right', render: r => { const n = Number(r.quantity_change) || 0; return <strong>{n > 0 ? `+${number(n)}` : number(n)}</strong> } },
              { key: 'after', header: 'Pares no tamanho', align: 'right', render: r => `de ${number(r.quantity_before)} para ${number(r.quantity_after)}` },
              { key: 'who', header: 'Quem', render: r => r.admin_username || (r.type === 'sale' ? 'Loja' : '') },
            ]}
            empty={<EmptyState art={<Tag />} title="Nenhuma movimentação">Vendas, ajustes e planilhas importadas ficam registrados aqui.</EmptyState>}
          />
        )}
      </Panel>
      <Pagination page={page} pages={hist.data?.pages} onChange={setPage} />
    </div>
  )
}

/* ---------- Previsão ---------- */

const FILL = { critical: st.fillCritical, warning: st.fillWarning, good: '' }

function ForecastTab() {
  const fc = useResource(() => api.get('/stock/forecast').then(r => asList(r.data)), [])
  const rows = fc.data || []
  const selling = rows.filter(r => r.estimatedDaysLeft30 != null)
  const still = rows.filter(r => r.estimatedDaysLeft30 == null)
  const tone = (d) => (d < 10 ? 'critical' : d < 30 ? 'warning' : 'good')

  return (
    <div className={s.grid}>
      <p className={st.note}>Conta feita com a média de vendas dos últimos 30 dias. Produto sem venda no período não entra na conta.</p>
      <ErrorNote error={fc.error} onRetry={fc.reload} />
      {fc.loading && !fc.data ? <Panel><Skeleton lines={5} height={34} /></Panel> : selling.length ? (
        <Panel title="Quanto tempo o estoque dura" subtitle="no ritmo atual">
          <div className={s.list}>
            {selling.map(r => {
              const days = Math.round(Number(r.estimatedDaysLeft30))
              const t = tone(days)
              return (
                <Link key={r.product_id} to={`/admin/produtos/${r.product_id}`} state={FROM_HERE} className={s.listItem}>
                  <img className={s.thumb} src={getImageUrl(r.image_url, r.name)} alt="" loading="lazy" />
                  <div className={s.listMain}>
                    <div className={s.listTitle}>{r.name}</div>
                    <div className={s.listSub}>{plural(r.stock, 'par', 'pares')}, vende {Number(r.avgSalesPerDay30).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} por dia</div>
                    <div className={st.track} aria-hidden="true">
                      <div className={`${st.fill} ${FILL[t]}`} style={{ width: `${Math.max(3, Math.min(100, (days / 60) * 100))}%` }} />
                    </div>
                  </div>
                  <div className={s.listEnd}>
                    <Badge tone={t}>{days <= 0 ? 'acabou' : plural(days, 'dia', 'dias')}</Badge>
                  </div>
                </Link>
              )
            })}
          </div>
        </Panel>
      ) : (
        <Panel><EmptyState art={<ChartSketch />} title="Ainda sem vendas para prever">Com vendas nos últimos 30 dias, a previsão mostra quantos dias cada produto dura.</EmptyState></Panel>
      )}
      {still.length > 0 && <p className={st.note}>{number(still.length)} {still.length === 1 ? 'produto não vendeu' : 'produtos não venderam'} nos últimos 30 dias.</p>}
    </div>
  )
}

/* ---------- Fornecedores ---------- */

const EMPTY_SUP = { name: '', contact_name: '', email: '', phone: '', lead_days: '7', notes: '', active: true }

function SuppliersTab() {
  const toast = useToast()
  const confirm = useConfirm()
  const sup = useResource(() => api.get('/suppliers', { params: { all: 1 } }).then(r => asList(r.data)), [])
  const [edit, setEdit] = useState(null)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  const open = (r) => { setErrors({}); setEdit(r ? { ...EMPTY_SUP, ...r, lead_days: String(r.lead_days ?? ''), active: !!r.active } : { ...EMPTY_SUP }) }

  const save = async () => {
    if (saving) return
    const e = {}
    if (!edit.name.trim()) e.name = 'Dê um nome ao fornecedor.'
    if (edit.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(edit.email.trim())) e.email = 'E-mail inválido.'
    const lead = String(edit.lead_days).trim()
    if (lead && !(/^\d+$/.test(lead) && Number(lead) <= 3650)) e.lead = 'Use um número de dias, até 3650.'
    setErrors(e)
    if (Object.keys(e).length) return
    setSaving(true)
    const payload = {
      name: edit.name.trim(),
      contact_name: edit.contact_name || null,
      email: edit.email?.trim() || null,
      phone: edit.phone || null,
      lead_days: lead ? Number(lead) : 0,
      notes: edit.notes || null,
      active: !!edit.active,
    }
    try {
      if (edit.id) await api.put(`/suppliers/${edit.id}`, payload)
      else await api.post('/suppliers', payload)
      toast.good('Fornecedor salvo.')
      setEdit(null)
      sup.reload()
    } catch (err) { toast.error(err.message) } finally { setSaving(false) }
  }

  const remove = async (r) => {
    if (!(await confirm({ title: `Desativar ${r.name}?`, message: 'O contato fica guardado e dá para reativar editando.', confirmLabel: 'Desativar', tone: 'danger' }))) return
    try { await api.delete(`/suppliers/${r.id}`); toast.good('Fornecedor desativado.'); sup.reload() } catch (err) { toast.error(err.message) }
  }

  const set = (k) => (e) => setEdit(x => ({ ...x, [k]: e?.target ? e.target.value : e }))

  return (
    <div className={s.grid}>
      <div className={st.bar}>
        <p className={st.note}>Contato e prazo de quem repõe os pares. Fica só aqui no painel.</p>
        <span className={st.spacer} />
        <Button variant="primary" icon={<FiPlus />} onClick={() => open(null)}>Novo fornecedor</Button>
      </div>
      <ErrorNote error={sup.error} onRetry={sup.reload} />
      <Panel flush>
        {sup.loading && !sup.data ? <div className={st.pad}><Skeleton lines={4} height={30} /></div> : (
          <DataTable
            rows={sup.data || []}
            onRowClick={open}
            columns={[
              { key: 'name', header: 'Fornecedor', primary: true, render: r => <strong>{r.name}</strong> },
              { key: 'contact', header: 'Contato', render: r => [r.contact_name, r.phone].filter(Boolean).join(', ') },
              { key: 'email', header: 'E-mail', render: r => r.email || '' },
              { key: 'lead', header: 'Prazo', align: 'right', render: r => plural(r.lead_days, 'dia', 'dias') },
              { key: 'active', header: 'Situação', render: r => (r.active ? <Badge tone="good">Ativo</Badge> : <Badge>Inativo</Badge>) },
              { key: 'act', header: '', render: r => r.active && <Button size="small" variant="ghost" icon={<FiTrash2 />} aria-label={`Desativar ${r.name}`} onClick={() => remove(r)} /> },
            ]}
            empty={<EmptyState art={<Tag />} title="Nenhum fornecedor" action={<Button variant="primary" icon={<FiPlus />} onClick={() => open(null)}>Cadastrar fornecedor</Button>}>Guarde aqui o contato e o prazo de quem repõe os pares.</EmptyState>}
          />
        )}
      </Panel>
      <Dialog
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? 'Editar fornecedor' : 'Novo fornecedor'}
        footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button><Button variant="primary" onClick={save} loading={saving}>Salvar fornecedor</Button></>}
      >
        {edit && (
          <div className={s.formGrid}>
            <TextField label="Nome" value={edit.name} onChange={set('name')} error={errors.name} data-autofocus maxLength={255} />
            <div className={s.formRow}>
              <TextField label="Pessoa de contato" value={edit.contact_name || ''} onChange={set('contact_name')} maxLength={255} />
              <TextField label="Telefone" type="tel" value={edit.phone || ''} onChange={set('phone')} maxLength={50} />
            </div>
            <div className={s.formRow}>
              <TextField label="E-mail" type="email" value={edit.email || ''} onChange={set('email')} error={errors.email} />
              <TextField label="Prazo de entrega" suffix="dias" inputMode="numeric" value={edit.lead_days} onChange={set('lead_days')} error={errors.lead} />
            </div>
            <TextField label="Observações" multiline value={edit.notes || ''} onChange={set('notes')} maxLength={5000} />
            <Switch checked={edit.active} onChange={set('active')} label="Fornecedor ativo" />
          </div>
        )}
      </Dialog>
    </div>
  )
}

/* ---------- Planilha ---------- */

function SheetTab() {
  const toast = useToast()
  const confirm = useConfirm()
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState([])
  const [lines, setLines] = useState(0)
  const [busy, setBusy] = useState('')
  const [result, setResult] = useState(null)
  const [drag, setDrag] = useState(false)

  const pick = (f) => {
    if (!f) return
    if (!/\.csv$/i.test(f.name)) { toast.error('Escolha um arquivo .csv'); return }
    if (f.size > 2 * 1024 * 1024) { toast.error('A planilha passa de 2 MB. Divida em partes.'); return }
    setFile(f); setResult(null); setPreview([]); setLines(0)
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result || '')
      // tira a marca de início (BOM) que o Excel põe no arquivo
      const all = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).split(/\r?\n/).filter(l => l.trim())
      setLines(Math.max(0, all.length - 1))
      setPreview(all.slice(0, 6).map(l => l.split(/[;,]/)))
    }
    reader.readAsText(f)
  }

  const clear = () => { setFile(null); setPreview([]); setLines(0); setResult(null) }

  const importFile = async () => {
    if (!file || busy) return
    const ok = await confirm({
      title: 'Trocar o estoque pelo da planilha?',
      message: `${lines ? `${plural(lines, 'linha', 'linhas')}: cada` : 'Cada'} tamanho da planilha fica com o número dela. Os tamanhos que não estão nela não mudam.`,
      confirmLabel: 'Importar',
    })
    if (!ok) return
    setBusy('import')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const { data } = await api.post('/stock/import-csv', fd)
      const imported = Number(data?.imported ?? data?.count ?? 0)
      const errors = data?.errors || []
      setResult({ imported, errors })
      if (!errors.length) toast.good(`Planilha importada: ${plural(imported, 'linha', 'linhas')}.`)
      else if (imported) toast.info(`${plural(imported, 'linha importada', 'linhas importadas')}. ${plural(errors.length, 'linha ficou', 'linhas ficaram')} de fora: veja abaixo.`)
      else toast.error('Nenhuma linha importada. Veja os problemas abaixo.')
    } catch (err) { toast.error(err.message) } finally { setBusy('') }
  }

  const download = async (url, name, kind) => {
    setBusy(kind)
    try { await downloadFile(url, undefined, name) } catch (err) { toast.error(err.message) } finally { setBusy('') }
  }
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className={s.half}>
      <Panel title="Importar planilha">
        <p className={s.sectionHint}>Colunas: <strong>product_id</strong>, <strong>size</strong> e <strong>stock</strong>. O número substitui o estoque do tamanho. O jeito mais fácil é baixar a planilha atual, editar e importar de volta.</p>
        <button
          type="button"
          className={`${st.drop} ${drag ? st.dropOn : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]) }}
        >
          <FiUploadCloud aria-hidden="true" />
          {file
            ? <><span className={st.fileName}>{file.name}</span><span>{plural(lines, 'linha', 'linhas')}. Toque para trocar.</span></>
            : 'Toque para escolher o .csv (ou arraste até aqui)'}
        </button>
        <input ref={inputRef} type="file" accept=".csv,text/csv" hidden onChange={e => { pick(e.target.files?.[0]); e.target.value = '' }} />
        {preview.length > 0 && (
          <div className={st.preview}>
            <table>
              <caption className={s.muted}>Primeiras linhas</caption>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i}>{row.map((c, j) => (i === 0 ? <th key={j} scope="col">{c}</th> : <td key={j}>{c}</td>))}</tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className={st.sheetActions}>
          <Button variant="primary" icon={<FiUploadCloud />} onClick={importFile} loading={busy === 'import'} disabled={!file || !!busy}>Importar</Button>
          {file && <Button variant="ghost" icon={<FiX />} onClick={clear} disabled={!!busy}>Tirar arquivo</Button>}
          <Button variant="ghost" icon={<FiFileText />} onClick={() => download('/stock/csv-template', 'modelo-estoque.csv', 'model')} loading={busy === 'model'}>Baixar modelo</Button>
        </div>
        {result && (
          <div className={st.result}>
            <div><Badge tone={result.imported ? 'good' : 'neutral'}>{plural(result.imported, 'linha importada', 'linhas importadas')}</Badge></div>
            {result.errors.length > 0 && (
              <div>
                <p className={st.resultTitle}>{plural(result.errors.length, 'linha com problema', 'linhas com problema')}:</p>
                <div className={s.list}>
                  {result.errors.slice(0, 50).map((e, i) => (
                    <div key={i} className={`${s.listItem} ${st.errLine}`}>
                      <span className={`${s.small} ${s.muted} ${st.errLineNo}`}>Linha {e.line ?? e.row ?? '?'}</span>
                      <span className={s.small}>{e.reason || e.message || e.error || String(e)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Panel>
      <Panel title="Baixar planilha">
        <p className={s.sectionHint}>Todos os produtos e tamanhos com o estoque de agora, no mesmo formato da importação.</p>
        <Button icon={<FiDownload />} onClick={() => download('/stock/export-csv', `estoque-${today}.csv`, 'export')} loading={busy === 'export'}>Baixar estoque completo</Button>
      </Panel>
    </div>
  )
}
