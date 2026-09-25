import { useEffect, useRef, useState } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import { FiEdit2, FiDownload, FiUploadCloud, FiPlus, FiTrash2, FiFileText, FiExternalLink } from 'react-icons/fi'
import api, { asList, asPage, downloadFile } from '../lib/api'
import { useDebounced, useResource } from '../lib/hooks'
import { number, dateTime, date } from '../lib/format'
import { csvDownload } from '../lib/print'
import { getImageUrl } from '../../../utils/imageHelper'
import {
  PageHeader, Panel, SubNav, Button, ButtonLink, SearchField, Segmented, Select, DataTable, Pagination, ErrorNote, Skeleton,
  EmptyState, Dialog, TextField, Switch, Badge, SizeRun, SizeRunEditor, RunLegend, useConfirm, useToast,
} from '../ui'
import { EmptyRun, Stars, Envelope, ChartSketch, Tag } from '../art/Art'
import s from './sections.module.css'

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

/* ---------- Ajuste rápido da grade ---------- */

function AdjustDialog({ product, onClose, onSaved }) {
  const toast = useToast()
  const [run, setRun] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!product) return
    setRun(null); setError(null)
    api.get(`/stock/product/${product.id}/sizes`)
      .then(r => setRun(asList(r.data).map(x => ({ size: String(x.size), stock: Number(x.stock) || 0, reserved: Number(x.reserved) || 0 }))))
      .catch(setError)
  }, [product])

  const save = async () => {
    setSaving(true)
    try {
      await api.put(`/stock/product/${product.id}/sizes`, run.map(x => ({ size: x.size, stock: Number(x.stock) || 0 })))
      toast.good(`Grade de "${product.name}" atualizada.`)
      onSaved?.()
      onClose()
    } catch (err) { toast.error(err.message) } finally { setSaving(false) }
  }

  const total = (run || []).reduce((n, x) => n + (Number(x.stock) || 0), 0)

  return (
    <Dialog
      open={!!product}
      onClose={onClose}
      title="Ajustar pares"
      description={product ? `${product.name}, ${number(total)} pares no total` : ''}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={save} loading={saving} disabled={!run?.length}>Salvar grade</Button></>}
    >
      <ErrorNote error={error} />
      {!run && !error ? <Skeleton lines={3} height={60} /> : run?.length ? (
        <>
          <SizeRunEditor value={run} onChange={setRun} fixed />
          <p className={`${s.small} ${s.muted}`} style={{ marginTop: 14 }}>
            Para incluir ou tirar tamanhos, <Link className={s.linkBtn} to={`/admin/produtos/${product?.id}`}>abra o produto</Link>.
          </p>
        </>
      ) : (
        <EmptyState art={<EmptyRun />} title="Este produto não tem grade" action={<ButtonLink to={`/admin/produtos/${product?.id}`}>Montar a grade no produto</ButtonLink>}>
          Sem tamanhos, ele não pode ser vendido.
        </EmptyState>
      )}
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
    const count = (st) => api.get('/products/admin', { params: { status: 'active', stock: st, limit: 1 } }).then(r => Number(r.data?.total || 0))
    const [out, low, ok] = await Promise.all([count('out'), count('low'), count('ok')])
    return { out, low, ok }
  }, [])
  const t = totals.data

  const columns = [
    {
      key: 'name', header: 'Produto', primary: true,
      render: r => (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
          <img className={s.thumb} src={getImageUrl(r.image_url, r.name)} alt="" loading="lazy" />
          <div style={{ minWidth: 0 }}>
            <div className={s.listTitle}>{r.name}</div>
            <div className={s.listSub}>{r.brand_name || 'Sem marca'}</div>
          </div>
        </div>
      ),
    },
    { key: 'grade', header: 'Grade', render: r => <div style={{ minWidth: 220, maxWidth: 420 }}><SizeRun sizes={r.size_stock} animate={false} /></div> },
    { key: 'total', header: 'Pares', align: 'right', render: r => <strong>{number(r.total_stock ?? r.stock)}</strong> },
    { key: 'act', header: '', render: r => <Button size="small" icon={<FiEdit2 />} onClick={() => setAdjust(r)}>Ajustar</Button> },
  ]

  return (
    <div className={s.grid}>
      <Segmented
        label="Filtro de estoque"
        value={stock}
        onChange={setStock}
        options={[
          { value: '', label: 'Todos' },
          { value: 'out', label: 'Esgotados', count: t?.out },
          { value: 'low', label: 'Acabando', count: t?.low },
          { value: 'ok', label: 'Com estoque', count: t?.ok },
        ]}
      />
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <SearchField value={search} onChange={setSearch} placeholder="Buscar produto" />
        <RunLegend />
      </div>
      <ErrorNote error={list.error} onRetry={list.reload} />
      <Panel flush>
        {list.loading && !list.data ? <div style={{ padding: 18 }}><Skeleton lines={6} height={40} /></div> : (
          <DataTable
            columns={columns}
            rows={list.data?.items || []}
            onRowClick={setAdjust}
            dim={list.loading}
            empty={<EmptyState art={<EmptyRun />} title={q || stock ? 'Nada com esse filtro' : 'Nenhum produto na loja'}>{q || stock ? 'Troque o filtro ou limpe a busca.' : 'Cadastre produtos em Produtos para montar a grade.'}</EmptyState>}
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
  return (
    <div className={s.grid}>
      <ErrorNote error={low.error} onRetry={low.reload} />
      <Panel flush>
        {low.loading && !low.data ? <div style={{ padding: 18 }}><Skeleton lines={5} height={40} /></div> : (
          <DataTable
            rowKey="id"
            rows={rows}
            onRowClick={setAdjust}
            columns={[
              {
                key: 'name', header: 'Produto', primary: true,
                render: r => (
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
                    <img className={s.thumb} src={getImageUrl(r.image_url, r.name)} alt="" loading="lazy" />
                    <div style={{ minWidth: 0 }}>
                      <div className={s.listTitle}>{r.name}</div>
                      <div className={s.listSub}>{r.brand || 'Sem marca'}</div>
                    </div>
                  </div>
                ),
              },
              { key: 'stock', header: 'Pares', align: 'right', render: r => <strong>{number(r.stock)}</strong> },
              { key: 'th', header: 'Aviso em', align: 'right', render: r => number(r.threshold) },
              { key: 'st', header: 'Situação', render: r => (Number(r.stock) <= 0 ? <Badge tone="critical">Esgotado</Badge> : <Badge tone="warning">Acabando</Badge>) },
              {
                key: 'act', header: '',
                render: r => (
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <Button size="small" icon={<FiEdit2 />} onClick={() => setAdjust(r)}>Repor</Button>
                    <ButtonLink to={`/admin/produtos/${r.id}`} size="small" variant="ghost" icon={<FiExternalLink />} aria-label={`Abrir ${r.name}`} />
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
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <Switch checked={onlyWaiting} onChange={setOnlyWaiting} label="Só quem ainda está esperando" />
        <span style={{ flex: 1 }} />
        <Button icon={<FiDownload />} onClick={exportCsv} disabled={!rows.length}>Baixar lista</Button>
      </div>
      <p className={`${s.small} ${s.muted}`} style={{ margin: 0 }}>Quando o tamanho volta ao estoque, a loja manda o e-mail sozinha.</p>
      <ErrorNote error={alerts.error} onRetry={alerts.reload} />
      {alerts.loading && !alerts.data ? <Panel><Skeleton lines={4} height={36} /></Panel> : groups.length ? (
        <div className={s.cardGrid}>
          {groups.map(g => (
            <Panel key={g.key} title={g.product_name || `Produto ${g.product_id}`} subtitle={g.size ? `tamanho ${g.size}` : 'qualquer tamanho'}
              actions={<Link className={s.linkBtn} to={`/admin/produtos/${g.product_id}`}>Abrir</Link>}>
              <div className={s.strong} style={{ fontSize: 22, marginBottom: 6 }}>{number(g.people.length)} {g.people.length === 1 ? 'pessoa' : 'pessoas'}</div>
              <div className={s.list}>
                {g.people.slice(0, 5).map(a => (
                  <div key={a.id} className={s.listItem} style={{ padding: '6px 0' }}>
                    <span className={s.listMain}><span className={s.listSub} style={{ color: 'var(--a-text-2)' }}>{a.email}</span></span>
                    <span className={`${s.small} ${s.muted}`}>{a.notified ? 'avisado' : date(a.created_at)}</span>
                  </div>
                ))}
                {g.people.length > 5 && <span className={`${s.small} ${s.muted}`}>e mais {g.people.length - 5}</span>}
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
  return (
    <div className={s.grid}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Select aria-label="Produto" style={{ width: 'auto', minWidth: 220, maxWidth: '100%' }} placeholder="Todos os produtos" value={productId} onChange={e => setProductId(e.target.value)} options={(products.data || []).map(x => ({ value: String(x.id), label: x.name }))} />
        <Select aria-label="Tipo" style={{ width: 'auto', minWidth: 160 }} placeholder="Todos os tipos" value={type} onChange={e => setType(e.target.value)} options={Object.entries(TYPES).map(([value, m]) => ({ value, label: m.label }))} />
      </div>
      <ErrorNote error={hist.error} onRetry={hist.reload} />
      <Panel flush>
        {hist.loading && !hist.data ? <div style={{ padding: 18 }}><Skeleton lines={6} height={30} /></div> : (
          <DataTable
            rows={hist.data?.items || []}
            dim={hist.loading}
            columns={[
              { key: 'when', header: 'Quando', primary: true, render: r => <span className={s.nowrap}>{dateTime(r.created_at)}</span> },
              { key: 'prod', header: 'Produto', render: r => r.product_name || `Produto ${r.product_id}` },
              { key: 'size', header: 'Tam.', render: r => r.size || '' },
              { key: 'type', header: 'Tipo', render: r => <Badge tone={TYPES[r.type]?.tone}>{TYPES[r.type]?.label || r.type}</Badge> },
              { key: 'chg', header: 'Mudou', align: 'right', render: r => { const n = Number(r.quantity_change) || 0; return <strong>{n > 0 ? `+${n}` : n}</strong> } },
              { key: 'after', header: 'Ficou', align: 'right', render: r => `${number(r.quantity_before)} para ${number(r.quantity_after)}` },
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

function ForecastTab() {
  const fc = useResource(() => api.get('/stock/forecast').then(r => asList(r.data)), [])
  const rows = fc.data || []
  const selling = rows.filter(r => r.estimatedDaysLeft30 != null)
  const still = rows.filter(r => r.estimatedDaysLeft30 == null)
  const tone = (d) => (d < 10 ? 'critical' : d < 30 ? 'warning' : 'good')
  const color = { critical: 'var(--a-critical)', warning: 'var(--a-warning)', good: 'var(--a-series-1)' }

  return (
    <div className={s.grid}>
      <p className={`${s.small} ${s.muted}`} style={{ margin: 0 }}>Conta feita com a média de vendas dos últimos 30 dias. Produto sem venda no período não entra na conta.</p>
      <ErrorNote error={fc.error} onRetry={fc.reload} />
      {fc.loading && !fc.data ? <Panel><Skeleton lines={5} height={34} /></Panel> : selling.length ? (
        <Panel title="Quanto tempo o estoque dura" subtitle="no ritmo atual">
          <div className={s.list}>
            {selling.map(r => {
              const days = Math.round(Number(r.estimatedDaysLeft30))
              const t = tone(days)
              return (
                <Link key={r.product_id} to={`/admin/produtos/${r.product_id}`} className={s.listItem}>
                  <img className={s.thumb} src={getImageUrl(r.image_url, r.name)} alt="" loading="lazy" />
                  <div className={s.listMain}>
                    <div className={s.listTitle}>{r.name}</div>
                    <div className={s.listSub}>{number(r.stock)} pares, vende {Number(r.avgSalesPerDay30).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} por dia</div>
                    <div style={{ height: 8, borderRadius: 4, background: 'var(--a-sunken)', marginTop: 6, overflow: 'hidden' }} aria-hidden="true">
                      <div style={{ width: `${Math.max(3, Math.min(100, (days / 60) * 100))}%`, height: '100%', background: color[t], borderRadius: '0 4px 4px 0' }} />
                    </div>
                  </div>
                  <div className={s.listEnd}>
                    <Badge tone={t}>{days <= 0 ? 'acabou' : `${number(days)} ${days === 1 ? 'dia' : 'dias'}`}</Badge>
                  </div>
                </Link>
              )
            })}
          </div>
        </Panel>
      ) : (
        <Panel><EmptyState art={<ChartSketch />} title="Ainda sem vendas para prever">Com vendas nos últimos 30 dias, a previsão mostra quantos dias cada produto dura.</EmptyState></Panel>
      )}
      {still.length > 0 && <p className={`${s.small} ${s.muted}`}>{number(still.length)} {still.length === 1 ? 'produto não vendeu' : 'produtos não venderam'} nos últimos 30 dias.</p>}
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
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!edit.name.trim()) { toast.error('Dê um nome ao fornecedor.'); return }
    setSaving(true)
    const payload = { ...edit, name: edit.name.trim(), lead_days: parseInt(edit.lead_days, 10) || 0, active: !!edit.active }
    delete payload.id
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
      <div><Button variant="primary" icon={<FiPlus />} onClick={() => setEdit({ ...EMPTY_SUP })}>Novo fornecedor</Button></div>
      <ErrorNote error={sup.error} onRetry={sup.reload} />
      <Panel flush>
        {sup.loading && !sup.data ? <div style={{ padding: 18 }}><Skeleton lines={4} height={30} /></div> : (
          <DataTable
            rows={sup.data || []}
            onRowClick={r => setEdit({ ...EMPTY_SUP, ...r, lead_days: String(r.lead_days ?? ''), active: !!r.active })}
            columns={[
              { key: 'name', header: 'Fornecedor', primary: true, render: r => <strong>{r.name}</strong> },
              { key: 'contact', header: 'Contato', render: r => [r.contact_name, r.phone].filter(Boolean).join(', ') },
              { key: 'email', header: 'E-mail', render: r => r.email || '' },
              { key: 'lead', header: 'Prazo', align: 'right', render: r => `${number(r.lead_days)} dias` },
              { key: 'active', header: 'Situação', render: r => (r.active ? <Badge tone="good">Ativo</Badge> : <Badge>Inativo</Badge>) },
              { key: 'act', header: '', render: r => <Button size="small" variant="ghost" icon={<FiTrash2 />} aria-label={`Desativar ${r.name}`} onClick={() => remove(r)} disabled={!r.active} /> },
            ]}
            empty={<EmptyState art={<Tag />} title="Nenhum fornecedor">Guarde aqui o contato e o prazo de quem repõe os pares.</EmptyState>}
          />
        )}
      </Panel>
      <Dialog
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? 'Editar fornecedor' : 'Novo fornecedor'}
        footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button><Button variant="primary" onClick={save} loading={saving}>Salvar</Button></>}
      >
        {edit && (
          <div className={s.formGrid}>
            <TextField label="Nome" value={edit.name} onChange={set('name')} data-autofocus maxLength={255} />
            <div className={s.formRow}>
              <TextField label="Pessoa de contato" value={edit.contact_name || ''} onChange={set('contact_name')} />
              <TextField label="Telefone" type="tel" value={edit.phone || ''} onChange={set('phone')} />
            </div>
            <div className={s.formRow}>
              <TextField label="E-mail" type="email" value={edit.email || ''} onChange={set('email')} />
              <TextField label="Prazo de entrega" suffix="dias" inputMode="numeric" value={edit.lead_days} onChange={set('lead_days')} />
            </div>
            <TextField label="Observações" multiline value={edit.notes || ''} onChange={set('notes')} />
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
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState([])
  const [busy, setBusy] = useState('')
  const [result, setResult] = useState(null)
  const [drag, setDrag] = useState(false)

  const pick = (f) => {
    if (!f) return
    if (!/\.csv$/i.test(f.name)) { toast.error('Escolha um arquivo .csv'); return }
    if (f.size > 2 * 1024 * 1024) { toast.error('A planilha passa de 2 MB. Divida em partes.'); return }
    setFile(f); setResult(null)
    const reader = new FileReader()
    reader.onload = () => setPreview(String(reader.result || '').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean).slice(0, 6).map(l => l.split(/[;,]/)))
    reader.readAsText(f)
  }

  const importFile = async () => {
    setBusy('import')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const { data } = await api.post('/stock/import-csv', fd)
      setResult({ imported: Number(data?.imported ?? data?.count ?? 0), errors: data?.errors || [] })
      toast.good('Planilha importada.')
    } catch (err) { toast.error(err.message) } finally { setBusy('') }
  }

  const exportAll = async () => {
    setBusy('export')
    try { await downloadFile('/stock/export-csv', undefined, `estoque-${new Date().toISOString().slice(0, 10)}.csv`) } catch (err) { toast.error(err.message) } finally { setBusy('') }
  }

  const model = () => csvDownload('modelo-estoque.csv', ['product_id', 'size', 'stock'], [['1', '40', '12'], ['1', '41', '8'], ['2', '38', '0']])

  return (
    <div className={s.half}>
      <Panel title="Importar planilha">
        <p className={s.sectionHint}>Colunas: <strong>product_id</strong>, <strong>size</strong> e <strong>stock</strong>. O número substitui o estoque do tamanho. O jeito mais fácil é baixar a planilha atual, editar e importar de volta.</p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]) }}
          style={{
            width: '100%', minHeight: 130, borderRadius: 12, cursor: 'pointer', color: 'var(--a-text-2)',
            border: `1.5px dashed ${drag ? 'var(--a-accent)' : 'var(--a-line-strong)'}`, background: drag ? 'var(--a-accent-wash)' : 'transparent',
            display: 'grid', placeItems: 'center', gap: 6, padding: 16, fontSize: 14.5,
          }}
        >
          <FiUploadCloud style={{ fontSize: 26 }} aria-hidden="true" />
          {file ? file.name : 'Toque para escolher o .csv (ou arraste até aqui)'}
        </button>
        <input ref={inputRef} type="file" accept=".csv,text/csv" hidden onChange={e => { pick(e.target.files?.[0]); e.target.value = '' }} />
        {preview.length > 0 && (
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i}>{row.map((c, j) => i === 0
                    ? <th key={j} style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--a-muted)', borderBottom: '1px solid var(--a-line)' }}>{c}</th>
                    : <td key={j} style={{ padding: '6px 8px', borderBottom: '1px solid var(--a-line)' }}>{c}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
          <Button variant="primary" icon={<FiUploadCloud />} onClick={importFile} loading={busy === 'import'} disabled={!file}>Importar</Button>
          {file && <Button variant="ghost" onClick={() => { setFile(null); setPreview([]); setResult(null) }}>Trocar arquivo</Button>}
          <Button variant="ghost" icon={<FiFileText />} onClick={model}>Baixar modelo</Button>
        </div>
        {result && (
          <div style={{ marginTop: 14 }}>
            <Badge tone="good">{number(result.imported)} linhas importadas</Badge>
            {result.errors.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <p className={s.strong} style={{ margin: '0 0 6px' }}>{number(result.errors.length)} linhas com problema:</p>
                <div className={s.list}>
                  {result.errors.slice(0, 50).map((e, i) => (
                    <div key={i} className={s.listItem} style={{ padding: '6px 0' }}>
                      <span className={`${s.small} ${s.muted}`} style={{ width: 70 }}>Linha {e.line ?? e.row ?? '?'}</span>
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
        <Button icon={<FiDownload />} onClick={exportAll} loading={busy === 'export'}>Baixar estoque completo</Button>
      </Panel>
    </div>
  )
}
