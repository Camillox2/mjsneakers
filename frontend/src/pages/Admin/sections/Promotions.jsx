import { useEffect, useMemo, useState } from 'react'
import { FiPercent, FiTrash2, FiX, FiExternalLink, FiEdit2 } from 'react-icons/fi'
import api, { asPage } from '../lib/api'
import { useDebounced, useResource } from '../lib/hooks'
import { money, number, plural, finalPrice, toLocalInput, dateTime } from '../lib/format'
import { getImageUrl } from '../../../utils/imageHelper'
import {
  PageHeader, Panel, Button, SearchField, Segmented, DataTable, Pagination, ErrorNote, Skeleton, EmptyState,
  Dialog, TextField, Badge, useConfirm, useToast,
} from '../ui'
import { Tag } from '../art/Art'
import { parseDecimal, decimalInput } from './formInput'
import s from './sections.module.css'
import p from './products.module.css'
import x from './Promotions.module.css'

// Promoções = desconto do próprio produto (discount_percentage), com janela
// opcional promo_start/promo_end. A loja já calcula o preço com essas regras:
// carrinho, pedido e e-mails cobram o mesmo valor que a vitrine mostra.

const MAX_PAGES = 10
const discountOf = (r) => Math.min(Math.max(Number(r?.discount_percentage) || 0, 0), 90)

function promoState(r) {
  const now = new Date()
  if (!discountOf(r)) return null
  if (!r.active) return { label: 'Fora da loja', tone: 'neutral' }
  if (r.promo_end && new Date(r.promo_end) < now) return { label: 'Encerrada', tone: 'critical' }
  if (r.promo_start && new Date(r.promo_start) > now) return { label: 'Agendada', tone: 'info' }
  return { label: 'Valendo', tone: 'good' }
}

// Todos os produtos com desconto. Com a API nova vem filtrado (promo=1); a
// antiga ignora o filtro, então a lista é filtrada aqui também.
async function loadPromos(search) {
  const base = { promo: 1, status: 'all', limit: 100, search: search || undefined }
  const first = asPage((await api.get('/products/admin', { params: { ...base, page: 1 } })).data, 1)
  let items = first.items
  if (first.pages > 1) {
    const rest = await Promise.all(
      Array.from({ length: Math.min(first.pages, MAX_PAGES) - 1 }, (_, i) =>
        api.get('/products/admin', { params: { ...base, page: i + 2 } }).then(r => asPage(r.data).items)),
    )
    items = items.concat(...rest)
  }
  return items.filter(r => discountOf(r) > 0).sort((a, b) => discountOf(b) - discountOf(a) || b.id - a.id)
}

const removePayload = { discount_percentage: 0, promo_start: null, promo_end: null }

export default function Promotions() {
  const toast = useToast()
  const confirm = useConfirm()
  const [tab, setTab] = useState('on')
  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim(), 350)
  const [page, setPage] = useState(1)
  const [edit, setEdit] = useState(null) // { products: [...] }
  const [selected, setSelected] = useState([])
  const [busy, setBusy] = useState('')

  const promos = useResource(() => loadPromos(tab === 'on' ? q : ''), [tab === 'on' ? q : '', tab])
  const all = useResource(
    () => (tab === 'all'
      ? api.get('/products/admin', { params: { search: q || undefined, status: 'all', page, limit: 24 } }).then(r => asPage(r.data, page))
      : Promise.resolve(null)),
    [tab, q, page],
  )

  useEffect(() => { setPage(1) }, [q, tab])
  useEffect(() => { setSelected([]) }, [q, tab, page])

  const reload = () => { promos.reload(); if (tab === 'all') all.reload() }

  const promoRows = promos.data || []
  const live = promoRows.filter(r => promoState(r)?.label === 'Valendo')
  const maxOff = live.length ? Math.max(...live.map(discountOf)) : 0

  const removeOne = async (r) => {
    const ok = await confirm({
      title: `Tirar "${r.name}" da promoção?`,
      message: `O preço volta para ${money(r.price)} na loja na hora. Dá para colocar de novo quando quiser.`,
      confirmLabel: 'Tirar da promoção',
      tone: 'danger',
    })
    if (!ok) return
    setBusy(`rm-${r.id}`)
    try {
      await api.put(`/products/${r.id}`, removePayload)
      toast.good(`"${r.name}" saiu da promoção. Preço de volta para ${money(r.price)}.`)
      reload()
    } catch (err) { toast.error(err.message) } finally { setBusy('') }
  }

  const removeMany = async () => {
    const rows = promoRows.filter(r => selected.includes(r.id))
    if (!rows.length) return
    const ok = await confirm({
      title: `Tirar ${plural(rows.length, 'produto', 'produtos')} da promoção?`,
      message: 'Os preços voltam para o valor cheio na loja na hora.',
      confirmLabel: 'Tirar da promoção',
      tone: 'danger',
    })
    if (!ok) return
    setBusy('bulk-rm')
    let done = 0
    let failed = 0
    for (const r of rows) {
      try { await api.put(`/products/${r.id}`, removePayload); done += 1 } catch { failed += 1 }
    }
    setBusy('')
    setSelected([])
    if (done) toast.good(`${plural(done, 'produto saiu', 'produtos saíram')} da promoção.`)
    if (failed) toast.error(`${plural(failed, 'produto não foi alterado', 'produtos não foram alterados')}. Tente de novo.`)
    reload()
  }

  const productCell = (r) => (
    <div className={p.prod}>
      <img className={s.thumb} src={getImageUrl(r.image_url, r.name)} alt="" loading="lazy" />
      <div className={p.prodText}>
        <div className={p.prodName}>{r.name}</div>
        <div className={p.prodMeta}>{[r.brand_name, r.category_name].filter(Boolean).join(', ') || 'Sem marca'}</div>
      </div>
    </div>
  )

  const priceCell = (r) => {
    const d = discountOf(r)
    return (
      <span className={p.price}>
        <span className={p.priceNow}>{money(finalPrice(r.price, d))}</span>
        {d > 0 && <span className={p.priceWas}>{money(r.price)}</span>}
      </span>
    )
  }

  const periodText = (r) => {
    if (!r.promo_start && !r.promo_end) return 'Sem prazo'
    if (r.promo_start && r.promo_end) return `${dateTime(r.promo_start)} até ${dateTime(r.promo_end)}`
    if (r.promo_end) return `Até ${dateTime(r.promo_end)}`
    return `A partir de ${dateTime(r.promo_start)}`
  }

  const promoColumns = [
    { key: 'name', header: 'Produto', primary: true, render: productCell },
    { key: 'off', header: 'Desconto', render: r => <span className={x.off}>-{number(discountOf(r))}%</span> },
    { key: 'price', header: 'Preço', align: 'right', render: priceCell },
    { key: 'period', header: 'Período', render: r => <span className={x.period}>{periodText(r)}</span> },
    { key: 'st', header: 'Situação', render: r => { const st = promoState(r); return st ? <Badge tone={st.tone}>{st.label}</Badge> : null } },
    {
      key: 'acts', header: 'Ações',
      render: r => (
        <div className={x.acts}>
          <Button size="small" icon={<FiEdit2 />} onClick={() => setEdit({ products: [r] })}>Editar</Button>
          <Button size="small" variant="ghost" icon={<FiTrash2 />} loading={busy === `rm-${r.id}`} disabled={!!busy && busy !== `rm-${r.id}`} onClick={() => removeOne(r)}>Tirar</Button>
        </div>
      ),
    },
  ]

  const allColumns = [
    { key: 'name', header: 'Produto', primary: true, render: productCell },
    { key: 'price', header: 'Preço', align: 'right', render: priceCell },
    {
      key: 'promo', header: 'Promoção',
      render: r => {
        const st = promoState(r)
        return st ? <span className={s.badges}><Badge tone={st.tone}>{st.label}</Badge><span className={x.off}>-{number(discountOf(r))}%</span></span> : <span className={s.muted}>Sem promoção</span>
      },
    },
    {
      key: 'acts', header: 'Ações',
      render: r => (
        <div className={x.acts}>
          {discountOf(r) > 0
            ? <Button size="small" icon={<FiEdit2 />} onClick={() => setEdit({ products: [r] })}>Editar promoção</Button>
            : <Button size="small" variant="primary" icon={<FiPercent />} onClick={() => setEdit({ products: [r] })}>Colocar em promoção</Button>}
        </div>
      ),
    },
  ]

  const allRows = all.data?.items || []
  const rowsForTab = tab === 'on' ? promoRows : allRows
  const selectedRows = rowsForTab.filter(r => selected.includes(r.id))

  return (
    <div>
      <PageHeader
        title="Promoções"
        description="Coloque produtos em oferta com desconto em % ou preço promocional, com data para acabar se quiser. A loja mostra o preço antigo riscado e a fileira Promoções na página inicial."
        actions={<a className={x.storeLink} href="/promocoes" target="_blank" rel="noreferrer"><FiExternalLink aria-hidden="true" /> Ver na loja</a>}
      />

      <div className={x.kpis}>
        <div className={x.kpi}><span className={x.kpiLabel}>Valendo agora</span><strong className={x.kpiValue}>{promos.data ? number(live.length) : '–'}</strong></div>
        <div className={x.kpi}><span className={x.kpiLabel}>Maior desconto</span><strong className={x.kpiValue}>{maxOff ? `-${number(maxOff)}%` : '–'}</strong></div>
        <div className={x.kpi}><span className={x.kpiLabel}>Com desconto cadastrado</span><strong className={x.kpiValue}>{promos.data ? number(promoRows.length) : '–'}</strong></div>
      </div>

      <div className={p.filters}>
        <Segmented
          label="Lista"
          options={[{ value: 'on', label: 'Em promoção', count: promos.data ? promoRows.length : undefined }, { value: 'all', label: 'Escolher produtos' }]}
          value={tab}
          onChange={setTab}
        />
        <div className={x.searchRow}>
          <SearchField value={search} onChange={setSearch} placeholder="Nome, marca, tag ou código" />
        </div>
      </div>

      {selected.length > 0 && (
        <div className={s.bulk} role="region" aria-label="Ações com os selecionados">
          <strong className={p.bulkCount}>{selected.length} {selected.length === 1 ? 'selecionado' : 'selecionados'}</strong>
          <Button size="small" variant="primary" icon={<FiPercent />} disabled={!!busy} onClick={() => setEdit({ products: selectedRows })}>
            {tab === 'on' ? 'Mudar desconto' : 'Aplicar desconto'}
          </Button>
          {tab === 'on' && <Button size="small" variant="danger" icon={<FiTrash2 />} loading={busy === 'bulk-rm'} disabled={!!busy} onClick={removeMany}>Tirar da promoção</Button>}
          <span className={p.spacer} />
          <Button size="small" variant="ghost" icon={<FiX />} disabled={!!busy} onClick={() => setSelected([])}>Limpar seleção</Button>
        </div>
      )}

      {tab === 'on' ? (
        <>
          <ErrorNote error={promos.error} onRetry={promos.reload} />
          <Panel flush>
            {promos.loading && !promos.data ? <div className={s.pad}><Skeleton lines={5} height={44} /></div> : (
              <DataTable
                columns={promoColumns}
                rows={promoRows}
                selectable
                selected={selected}
                onSelect={setSelected}
                onRowClick={r => setEdit({ products: [r] })}
                dim={promos.loading}
                empty={
                  <EmptyState
                    art={<Tag />}
                    title={q ? 'Nenhuma promoção com essa busca' : 'Nenhum produto em promoção'}
                    action={<Button variant="primary" icon={<FiPercent />} onClick={() => setTab('all')}>Escolher produtos</Button>}
                  >
                    {q ? 'Tente outra busca ou escolha produtos na outra aba.' : 'Escolha os pares e defina o desconto. Eles aparecem na fileira Promoções da página inicial.'}
                  </EmptyState>
                }
              />
            )}
          </Panel>
        </>
      ) : (
        <>
          <ErrorNote error={all.error} onRetry={all.reload} />
          <Panel flush>
            {all.loading && !all.data ? <div className={s.pad}><Skeleton lines={6} height={44} /></div> : (
              <DataTable
                columns={allColumns}
                rows={allRows}
                selectable
                selected={selected}
                onSelect={setSelected}
                onRowClick={r => setEdit({ products: [r] })}
                dim={all.loading}
                empty={<EmptyState art={<Tag />} title="Nenhum produto encontrado">Tente outra busca.</EmptyState>}
              />
            )}
          </Panel>
          <Pagination page={page} pages={all.data?.pages} onChange={setPage} />
          {all.data && <p className={p.count}>{plural(all.data.total, 'produto', 'produtos')}</p>}
        </>
      )}

      <PromoDialog
        products={edit?.products || null}
        onClose={() => setEdit(null)}
        onSaved={() => { setEdit(null); setSelected([]); reload() }}
      />
    </div>
  )
}

/* ---------- colocar / editar promoção ---------- */

function PromoDialog({ products, onClose, onSaved }) {
  const toast = useToast()
  const confirm = useConfirm()
  const open = !!products?.length
  const single = products?.length === 1 ? products[0] : null
  const [mode, setMode] = useState('percent')
  const [pct, setPct] = useState('')
  const [promoPrice, setPromoPrice] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [saving, setSaving] = useState('')

  useEffect(() => {
    if (!open) return
    const first = products[0]
    const d = discountOf(first)
    setMode('percent')
    setPct(d > 0 ? decimalInput(d) : '')
    setPromoPrice(d > 0 && single ? decimalInput(finalPrice(first.price, d)) : '')
    setStart(single ? toLocalInput(first.promo_start) : '')
    setEnd(single ? toLocalInput(first.promo_end) : '')
    setSaving('')
  }, [products]) // eslint-disable-line react-hooks/exhaustive-deps

  const basePrice = Number(single?.price) || 0
  // no modo preço, o desconto sai da conta preço promocional / preço cheio
  const computed = useMemo(() => {
    if (mode === 'price' && single) {
      const target = parseDecimal(promoPrice)
      if (!(target > 0) || !(basePrice > 0)) return { pct: NaN, error: promoPrice.trim() ? 'Informe um preço maior que zero.' : 'Informe o preço promocional.' }
      if (target >= basePrice) return { pct: NaN, error: `Tem que ser menor que o preço cheio (${money(basePrice)}).` }
      const value = Math.round((1 - target / basePrice) * 10000) / 100
      if (value > 90) return { pct: NaN, error: `O desconto vai até 90%: o menor preço possível é ${money(finalPrice(basePrice, 90))}.` }
      if (value < 0.01) return { pct: NaN, error: 'Diferença pequena demais.' }
      return { pct: value, error: '' }
    }
    const value = parseDecimal(pct)
    if (!pct.trim()) return { pct: NaN, error: 'Informe o desconto.' }
    if (!(value > 0 && value <= 90)) return { pct: NaN, error: 'O desconto vai de 0,01% a 90%.' }
    return { pct: Math.round(value * 100) / 100, error: '' }
  }, [mode, pct, promoPrice, basePrice, single])

  const dateError = start && end && end <= start ? 'O fim tem que vir depois do início.' : ''
  const endPast = end && new Date(end) < new Date() ? 'Essa data já passou: a promoção não vai aparecer na loja.' : ''
  const invalid = !!computed.error || !!dateError
  const hadPromo = (products || []).some(r => discountOf(r) > 0)

  const save = async () => {
    if (invalid || saving) return
    setSaving('save')
    const payload = { discount_percentage: computed.pct, promo_start: start || null, promo_end: end || null }
    let done = 0
    let lastError = null
    for (const r of products) {
      try { await api.put(`/products/${r.id}`, payload); done += 1 } catch (err) { lastError = err }
    }
    setSaving('')
    if (done && single) toast.good(`"${single.name}" em promoção: ${money(finalPrice(single.price, computed.pct))} (-${number(computed.pct)}%).`)
    else if (done) toast.good(`Desconto de ${number(computed.pct)}% aplicado a ${plural(done, 'produto', 'produtos')}.`)
    if (lastError) toast.error(done ? `${plural(products.length - done, 'produto não foi alterado', 'produtos não foram alterados')}: ${lastError.message}` : lastError.message)
    if (done) onSaved()
  }

  const remove = async () => {
    const ok = await confirm({
      title: single ? `Tirar "${single.name}" da promoção?` : `Tirar ${plural(products.length, 'produto', 'produtos')} da promoção?`,
      message: 'O preço volta para o valor cheio na loja na hora.',
      confirmLabel: 'Tirar da promoção',
      tone: 'danger',
    })
    if (!ok) return
    setSaving('remove')
    let done = 0
    let lastError = null
    for (const r of products) {
      try { await api.put(`/products/${r.id}`, removePayload); done += 1 } catch (err) { lastError = err }
    }
    setSaving('')
    if (done) toast.good(single ? `"${single.name}" saiu da promoção.` : `${plural(done, 'produto saiu', 'produtos saíram')} da promoção.`)
    if (lastError) toast.error(lastError.message)
    if (done) onSaved()
  }

  const onEnter = (e) => { if (e.key === 'Enter') { e.preventDefault(); save() } }
  const previewPct = Number.isFinite(computed.pct) ? computed.pct : 0

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={single ? (discountOf(single) > 0 ? 'Editar promoção' : 'Colocar em promoção') : `Promoção em ${plural(products?.length || 0, 'produto', 'produtos')}`}
      description={single ? single.name : 'O mesmo desconto vale para todos os selecionados.'}
      footer={<>
        {hadPromo && <Button variant="danger" icon={<FiTrash2 />} loading={saving === 'remove'} disabled={!!saving} onClick={remove}>Tirar da promoção</Button>}
        <Button variant="ghost" onClick={onClose} disabled={!!saving}>Cancelar</Button>
        <Button variant="primary" onClick={save} loading={saving === 'save'} disabled={invalid || (!!saving && saving !== 'save')}>Salvar promoção</Button>
      </>}
    >
      {open && (
        <div className={s.formGrid}>
          {single && (
            <div className={s.fieldGroup}>
              <span className={s.label} aria-hidden="true">Como definir</span>
              <Segmented label="Como definir" value={mode} onChange={setMode} options={[{ value: 'percent', label: '% de desconto' }, { value: 'price', label: 'Preço promocional' }]} />
            </div>
          )}
          {mode === 'price' && single ? (
            <TextField label="Preço promocional" prefix="R$" inputMode="decimal" enterKeyHint="done" value={promoPrice} onChange={e => setPromoPrice(e.target.value)} onKeyDown={onEnter} error={promoPrice.trim() ? computed.error || undefined : undefined} hint={`Preço cheio: ${money(basePrice)}`} data-autofocus />
          ) : (
            <TextField label="Desconto" suffix="%" inputMode="decimal" enterKeyHint="done" value={pct} onChange={e => setPct(e.target.value)} onKeyDown={onEnter} error={pct.trim() ? computed.error || undefined : undefined} hint="De 0,01 a 90%" data-autofocus />
          )}
          <div className={x.quick} role="group" aria-label="Descontos rápidos">
            {[10, 15, 20, 30, 40, 50].map(v => (
              <button key={v} type="button" className={`${x.quickBtn} ${mode === 'percent' && parseDecimal(pct) === v ? x.quickOn : ''}`} onClick={() => { setMode('percent'); setPct(String(v)) }}>
                -{v}%
              </button>
            ))}
          </div>

          {single ? (
            <div className={p.pricePreview}>
              <span className={s.muted}>Na loja:</span>
              <span className={p.pricePreviewNow}>{money(finalPrice(basePrice, previewPct))}</span>
              {previewPct > 0 && <span className={p.priceWas}>{money(basePrice)}</span>}
              {previewPct > 0 && <Badge tone="good">-{number(previewPct)}%</Badge>}
            </div>
          ) : (
            <ul className={x.many}>
              {products.slice(0, 6).map(r => (
                <li key={r.id}>
                  <span className={x.manyName}>{r.name}</span>
                  <span className={x.manyPrice}>{money(finalPrice(r.price, previewPct))}</span>
                </li>
              ))}
              {products.length > 6 && <li className={s.muted}>e mais {number(products.length - 6)}</li>}
            </ul>
          )}

          <div className={s.formRow}>
            <TextField label="Começa (opcional)" type="datetime-local" value={start} onChange={e => setStart(e.target.value)} hint="Vazio: vale desde já." />
            <TextField label="Termina (opcional)" type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} error={dateError || undefined} hint={endPast || 'Vazio: sem data para acabar. Com data, a loja mostra o relógio.'} />
          </div>
        </div>
      )}
    </Dialog>
  )
}
