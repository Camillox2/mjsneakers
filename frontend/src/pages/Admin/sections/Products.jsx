import { useEffect, useRef, useState } from 'react'
import { Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Reorder } from 'framer-motion'
import { FiPlus, FiEdit2, FiCopy, FiTrash2, FiX, FiChevronLeft, FiChevronRight, FiImage, FiAlertTriangle, FiStar } from 'react-icons/fi'
import api, { asList, asPage, uploadImage } from '../lib/api'
import { useDebounced, useResource, useUnsavedGuard } from '../lib/hooks'
import { money, number, plural, finalPrice, toLocalInput } from '../lib/format'
import { getImageUrl } from '../../../utils/imageHelper'
import { parseSizes } from '../../../utils/sizes'
import {
  PageHeader, Panel, Button, SearchField, Segmented, Select, DataTable, Pagination, ErrorNote, Skeleton, EmptyState,
  Dialog, TextField, SelectField, Switch, Badge, SizeRun, SizeRunEditor, RunLegend, useConfirm, useToast,
} from '../ui'
import { ShoeBox } from '../art/Art'
import { ORIGINS, formatNcm } from './SettingsFiscal'
import { parseDecimal, decimalInput, imageProblem, IMAGE_ACCEPT } from './formInput'
import s from './sections.module.css'
import p from './products.module.css'

export default function Products() {
  return (
    <>
      <ProductList />
      <Routes>
        <Route path="novo" element={<ProductEditor />} />
        <Route path=":id" element={<ProductEditor />} />
      </Routes>
    </>
  )
}

const STOCK_FILTERS = [
  { value: '', label: 'Todo estoque' },
  { value: 'out', label: 'Esgotados' },
  { value: 'low', label: 'Acabando' },
  { value: 'ok', label: 'Com estoque' },
]

const SORTS = [
  { value: 'recent', label: 'Mais recentes' },
  { value: 'name', label: 'Nome' },
  { value: 'price', label: 'Preço' },
  { value: 'stock', label: 'Menos estoque' },
]

// O aviso de cada ação em massa usa o mesmo verbo do botão.
const BULK_DONE = {
  activate: 'Colocados na loja',
  deactivate: 'Tirados da loja',
  feature: 'Em destaque',
  unfeature: 'Tirados do destaque',
}

function ProductList() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const [search, setSearch] = useState(params.get('busca') || '')
  const q = useDebounced(search.trim(), 350)
  const status = params.get('status') || 'active'
  const brand = params.get('marca') || ''
  const category = params.get('categoria') || ''
  const stock = params.get('estoque') || ''
  const sort = params.get('ordem') || 'recent'
  const page = Number(params.get('pagina') || 1)
  const [selected, setSelected] = useState([])
  const [bulkBusy, setBulkBusy] = useState('')
  const [priceEdit, setPriceEdit] = useState(null)
  // ids com troca de "na loja" em andamento, e o produto sendo copiado
  const [switching, setSwitching] = useState([])
  const [copying, setCopying] = useState(null)

  const setParam = (patch) => {
    const next = new URLSearchParams(params)
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)))
    if (!('pagina' in patch)) next.delete('pagina')
    setParams(next, { replace: true })
  }
  useEffect(() => { if (q !== (params.get('busca') || '')) setParam({ busca: q }) }, [q]) // eslint-disable-line react-hooks/exhaustive-deps

  const brands = useResource(() => api.get('/brands').then(r => asList(r.data)), [])
  const categories = useResource(() => api.get('/categories').then(r => asList(r.data)), [])
  const list = useResource(
    () => api.get('/products/admin', { params: { search: q || undefined, status, brand_id: brand || undefined, category_id: category || undefined, stock: stock || undefined, sort, page, limit: 24 } })
      .then(r => asPage(r.data, page)),
    [q, status, brand, category, stock, sort, page]
  )

  // recarrega a lista quando o editor fecha (voltou para /admin/produtos)
  const location = useLocation()
  const onList = /\/admin\/produtos\/?$/.test(location.pathname)
  const wasOnList = useRef(onList)
  useEffect(() => {
    if (onList && !wasOnList.current) list.reload()
    wasOnList.current = onList
  }, [onList]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setSelected([]) }, [q, status, brand, category, stock, sort, page])

  // apagou o último da página: volta uma página em vez de mostrar a lista vazia
  useEffect(() => {
    if (list.data && !list.data.items.length && page > 1) setParam({ pagina: String(page - 1) })
  }, [list.data]) // eslint-disable-line react-hooks/exhaustive-deps

  const rows = list.data?.items || []
  const open = (r) => navigate(`/admin/produtos/${r.id}${location.search}`, { state: { fromList: true } })
  const create = () => navigate('/admin/produtos/novo', { state: { fromList: true } })

  const toggleActive = async (r) => {
    if (switching.includes(r.id)) return
    setSwitching(ids => [...ids, r.id])
    try {
      await api.patch(`/products/${r.id}/active`, { active: !r.active })
      list.mutate(d => ({ ...d, items: d.items.map(x => (x.id === r.id ? { ...x, active: !r.active } : x)) }))
      toast.good(r.active ? `"${r.name}" saiu da loja.` : `"${r.name}" voltou para a loja.`)
    } catch (err) { toast.error(err.message) } finally { setSwitching(ids => ids.filter(x => x !== r.id)) }
  }

  // um clique, uma cópia: o botão trava até o servidor responder
  const duplicate = async (r) => {
    if (copying) return
    setCopying(r.id)
    try {
      const { data } = await api.post(`/products/${r.id}/clone`)
      toast.good('Cópia criada, ainda fora da loja. Ajuste e ative quando quiser.')
      if (data?.id) navigate(`/admin/produtos/${data.id}`, { state: { fromList: true } })
      else list.reload()
    } catch (err) { toast.error(err.message) } finally { setCopying(null) }
  }

  const remove = async (r) => {
    const ok = await confirm({
      title: `Excluir "${r.name}"?`,
      message: 'Se o produto já teve pedido ou avaliação, ele só sai da loja (o histórico de vendas fica). Se nunca vendeu, é apagado de vez.',
      confirmLabel: 'Excluir',
      tone: 'danger',
    })
    if (!ok) return
    try {
      const { data } = await api.delete(`/products/${r.id}`)
      toast.good(Number(data?.deleted) > 0 ? 'Produto apagado.' : 'O produto tinha vendas: foi só tirado da loja.')
      list.reload()
    } catch (err) { toast.error(err.message) }
  }

  const bulk = async (action) => {
    if (bulkBusy) return
    const n = selected.length
    if (action === 'delete') {
      const ok = await confirm({
        title: `Excluir ${plural(n, 'produto', 'produtos')}?`,
        message: 'Os que já tiveram pedido ou avaliação só saem da loja. Os outros são apagados de vez.',
        confirmLabel: 'Excluir',
        tone: 'danger',
      })
      if (!ok) return
    }
    setBulkBusy(action)
    try {
      const { data } = await api.post('/products/bulk', { action, ids: selected })
      if (action === 'delete') {
        const gone = Number(data?.deleted) || 0
        const kept = Number(data?.deactivated) || 0
        toast.good([
          gone && `Apagados: ${plural(gone, 'produto', 'produtos')}.`,
          kept && `Tirados da loja por já terem vendas: ${plural(kept, 'produto', 'produtos')}.`,
        ].filter(Boolean).join(' ') || 'Nada para excluir.')
      } else {
        toast.good(`${BULK_DONE[action]}: ${plural(n, 'produto', 'produtos')}.`)
      }
      setSelected([])
      list.reload()
    } catch (err) { toast.error(err.message) } finally { setBulkBusy('') }
  }

  const productCell = (r) => (
    <div className={p.prod}>
      <img className={s.thumb} src={getImageUrl(r.image_url, r.name)} alt="" loading="lazy" />
      <div className={p.prodText}>
        <div className={p.prodName}>{r.name}</div>
        <div className={p.prodMeta}>{[r.brand_name, r.category_name].filter(Boolean).join(', ') || 'Sem marca'}{r.featured ? ', em destaque' : ''}</div>
      </div>
    </div>
  )

  const columns = [
    { key: 'name', header: 'Produto', primary: true, render: productCell },
    {
      key: 'price', header: 'Preço', align: 'right',
      render: r => {
        const d = Number(r.discount_percentage) || 0
        const now = money(finalPrice(r.price, d))
        return (
          <button type="button" className={p.priceBtn} onClick={() => setPriceEdit(r)} aria-label={`Mudar o preço de ${r.name}, hoje ${now}`}>
            <span className={p.price}>
              <span className={p.priceNow}>{now}</span>
              {d > 0 && <span className={p.priceWas}>{money(r.price)} ({number(d)}% off)</span>}
            </span>
          </button>
        )
      },
    },
    // no celular a grade vai inteira no topo do cartão (cardTop)
    { key: 'grade', header: 'Grade', hideOnCard: true, render: r => <div className={p.runCell}><SizeRun sizes={r.size_stock} compact animate={false} /></div> },
    { key: 'stock', header: 'Pares', align: 'right', render: r => <strong>{number(r.total_stock ?? r.stock)}</strong> },
    {
      key: 'active', header: 'Na loja',
      render: r => (
        <Switch checked={r.active} disabled={switching.includes(r.id)} onChange={() => toggleActive(r)} label={`Mostrar ${r.name} na loja`} hideLabel />
      ),
    },
    {
      key: 'acts', header: 'Ações',
      render: r => (
        <div className={p.rowActions}>
          <Button variant="ghost" size="small" icon={<FiEdit2 />} aria-label={`Editar ${r.name}`} onClick={() => open(r)} />
          <Button variant="ghost" size="small" icon={<FiCopy />} aria-label={`Duplicar ${r.name}`} loading={copying === r.id} disabled={!!copying && copying !== r.id} onClick={() => duplicate(r)} />
          <Button variant="ghost" size="small" icon={<FiTrash2 />} aria-label={`Excluir ${r.name}`} onClick={() => remove(r)} />
        </div>
      ),
    },
  ]

  const filtered = q || brand || category || stock || status !== 'active'
  const clearFilters = () => { setSearch(''); setParams(new URLSearchParams(), { replace: true }) }

  return (
    <div>
      <PageHeader
        title="Produtos"
        description="Toque no preço para mudar na hora. A grade mostra os pares de cada tamanho."
        actions={<Button variant="primary" icon={<FiPlus />} onClick={create}>Novo produto</Button>}
      />

      <div className={p.filters}>
        <Segmented
          label="Situação"
          options={[{ value: 'active', label: 'Na loja' }, { value: 'inactive', label: 'Fora da loja' }, { value: 'all', label: 'Todos' }]}
          value={status}
          onChange={v => setParam({ status: v === 'active' ? '' : v })}
        />
        <div className={p.filterRow}>
          <SearchField value={search} onChange={setSearch} placeholder="Nome, marca, tag ou código" />
          <Select className={p.filterSelect} aria-label="Marca" placeholder="Todas as marcas" value={brand} onChange={e => setParam({ marca: e.target.value })} options={(brands.data || []).map(b => ({ value: String(b.id), label: b.name }))} />
          <Select className={p.filterSelect} aria-label="Categoria" placeholder="Todas as categorias" value={category} onChange={e => setParam({ categoria: e.target.value })} options={(categories.data || []).map(c => ({ value: String(c.id), label: c.name }))} />
          <Select className={p.filterSelect} aria-label="Estoque" value={stock} onChange={e => setParam({ estoque: e.target.value })} options={STOCK_FILTERS} />
          <Select className={p.filterSelect} aria-label="Ordem" value={sort} onChange={e => setParam({ ordem: e.target.value === 'recent' ? '' : e.target.value })} options={SORTS} />
          {filtered && <Button variant="ghost" icon={<FiX />} onClick={clearFilters}>Limpar filtros</Button>}
        </div>
      </div>

      {selected.length > 0 && (
        <div className={s.bulk} role="region" aria-label="Ações com os selecionados">
          <strong className={p.bulkCount}>{selected.length} {selected.length === 1 ? 'selecionado' : 'selecionados'}</strong>
          <Button size="small" loading={bulkBusy === 'activate'} disabled={!!bulkBusy} onClick={() => bulk('activate')}>Colocar na loja</Button>
          <Button size="small" loading={bulkBusy === 'deactivate'} disabled={!!bulkBusy} onClick={() => bulk('deactivate')}>Tirar da loja</Button>
          <Button size="small" icon={<FiStar />} loading={bulkBusy === 'feature'} disabled={!!bulkBusy} onClick={() => bulk('feature')}>Destacar</Button>
          <Button size="small" loading={bulkBusy === 'unfeature'} disabled={!!bulkBusy} onClick={() => bulk('unfeature')}>Tirar destaque</Button>
          <Button size="small" variant="danger" icon={<FiTrash2 />} loading={bulkBusy === 'delete'} disabled={!!bulkBusy} onClick={() => bulk('delete')}>Excluir</Button>
          <span className={p.spacer} />
          <Button size="small" variant="ghost" icon={<FiX />} disabled={!!bulkBusy} onClick={() => setSelected([])}>Limpar seleção</Button>
        </div>
      )}

      <ErrorNote error={list.error} onRetry={list.reload} />

      <Panel flush>
        <div className={p.legend}><RunLegend /></div>
        {list.loading && !list.data ? (
          <div className={p.pad}><Skeleton lines={6} height={44} /></div>
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            selectable
            selected={selected}
            onSelect={setSelected}
            onRowClick={open}
            dim={list.loading}
            cardTop={r => (
              <div className={p.cardTop}>
                {productCell(r)}
                <SizeRun sizes={r.size_stock} animate={false} />
              </div>
            )}
            empty={
              <EmptyState
                art={<ShoeBox />}
                title={filtered ? 'Nenhum produto com esses filtros' : 'A prateleira está vazia'}
                action={filtered
                  ? <Button icon={<FiX />} onClick={clearFilters}>Limpar filtros</Button>
                  : <Button variant="primary" icon={<FiPlus />} onClick={create}>Cadastrar o primeiro</Button>}
              >
                {filtered ? 'Tente limpar a busca ou trocar os filtros.' : 'Cadastre um produto com fotos, preço e a grade de tamanhos.'}
              </EmptyState>
            }
          />
        )}
      </Panel>
      <Pagination page={page} pages={list.data?.pages} onChange={pg => setParam({ pagina: String(pg) })} />
      {list.data && <p className={p.count}>{plural(list.data.total, 'produto', 'produtos')}</p>}

      <PriceDialog product={priceEdit} onClose={() => setPriceEdit(null)} onSaved={(id, patch) => { list.mutate(d => ({ ...d, items: d.items.map(x => (x.id === id ? { ...x, ...patch } : x)) })); setPriceEdit(null) }} />
    </div>
  )
}

function PriceDialog({ product, onClose, onSaved }) {
  const toast = useToast()
  const [price, setPrice] = useState('')
  const [discount, setDiscount] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (product) { setPrice(decimalInput(product.price)); setDiscount(decimalInput(Number(product.discount_percentage) || 0)) }
  }, [product])

  const priceNum = parseDecimal(price)
  const discNum = discount.trim() === '' ? 0 : parseDecimal(discount)
  const priceError = !(priceNum > 0) ? 'Informe um preço maior que zero.' : priceNum > 10000000 ? 'Preço alto demais. Confira os zeros.' : ''
  const discError = !(discNum >= 0 && discNum <= 90) ? 'O desconto vai de 0 a 90%.' : ''

  const save = async () => {
    if (priceError || discError || saving) return
    setSaving(true)
    try {
      await api.put(`/products/${product.id}/inline`, { price: priceNum, discount_percentage: discNum })
      toast.good('Preço salvo. A loja já mostra o novo valor.')
      onSaved(product.id, { price: priceNum, discount_percentage: discNum })
    } catch (err) { toast.error(err.message) } finally { setSaving(false) }
  }
  const onEnter = (e) => { if (e.key === 'Enter') { e.preventDefault(); save() } }

  return (
    <Dialog
      open={!!product}
      onClose={onClose}
      size="s"
      title="Preço e desconto"
      description={product?.name}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={save} loading={saving} disabled={!!(priceError || discError)}>Salvar preço</Button></>}
    >
      <div className={s.formGrid}>
        <div className={s.formRow}>
          <TextField label="Preço cheio" prefix="R$" inputMode="decimal" enterKeyHint="done" value={price} onChange={e => setPrice(e.target.value)} onKeyDown={onEnter} error={priceError || undefined} data-autofocus />
          <TextField label="Desconto" suffix="%" inputMode="decimal" enterKeyHint="done" value={discount} onChange={e => setDiscount(e.target.value)} onKeyDown={onEnter} error={discError || undefined} />
        </div>
        <div className={p.pricePreview}>
          <span className={s.muted}>Na loja:</span>
          <span className={p.pricePreviewNow}>{money(finalPrice(priceNum || 0, discNum || 0))}</span>
          {discNum > 0 && priceNum > 0 && <span className={p.priceWas}>{money(priceNum)}</span>}
        </div>
      </div>
    </Dialog>
  )
}

/* ================= Editor ================= */

const EMPTY = {
  name: '', description: '', price: '', discount_percentage: '0', brand_id: '', category_id: '',
  active: true, featured: false, feature_order: '0', meta_title: '', meta_description: '', tags: '',
  promo_start: '', promo_end: '', weight_g: '', height_cm: '', width_cm: '', length_cm: '',
  ncm: '', origin: '', gtin: '',
}

let photoSeq = 0
const photoOf = (url) => ({ id: `p${++photoSeq}`, url, preview: getImageUrl(url, 'foto') })

// Dígito verificador do código de barras (GTIN-8, 12, 13 e 14), a mesma conta do servidor.
function validGtin(code) {
  const digits = code.split('').map(Number)
  const check = digits.pop()
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10 === check
}

// Campo numérico opcional: vazio vai como null (o servidor usa o padrão).
const optionalNumber = (value, integer) => {
  if (value === '' || value == null) return null
  const n = parseDecimal(value)
  if (!Number.isFinite(n)) return null
  return integer ? Math.round(n) : n
}
const outOfRange = (value, max) => value !== '' && value != null && !(parseDecimal(value) >= 0 && parseDecimal(value) <= max)

function ProductEditor() {
  const { id } = useParams()
  const isNew = !id
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const confirm = useConfirm()
  const fileRef = useRef(null)
  const busy = useRef(false)
  // prévias locais das fotos novas, liberadas quando o editor fecha
  const blobs = useRef([])

  const brands = useResource(() => api.get('/brands').then(r => asList(r.data)), [])
  const categories = useResource(() => api.get('/categories').then(r => asList(r.data)), [])
  const product = useResource(() => (isNew ? Promise.resolve(null) : api.get(`/products/admin/${id}`).then(r => r.data)), [id])

  const [form, setForm] = useState(EMPTY)
  const [photos, setPhotos] = useState([])
  const [run, setRun] = useState([])
  const [alert, setAlert] = useState({ threshold: '5', email: '' })
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})
  useUnsavedGuard(dirty)

  useEffect(() => {
    const d = product.data
    if (isNew) {
      setForm(EMPTY); setPhotos([]); setRun([]); setDirty(false)
      return
    }
    if (!d) return
    setForm({
      name: d.name || '', description: d.description || '', price: decimalInput(d.price),
      discount_percentage: decimalInput(Number(d.discount_percentage) || 0), brand_id: d.brand_id ? String(d.brand_id) : '',
      category_id: d.category_id ? String(d.category_id) : '', active: !!d.active, featured: !!d.featured,
      feature_order: String(d.feature_order ?? 0), meta_title: d.meta_title || '', meta_description: d.meta_description || '',
      tags: d.tags || '', promo_start: toLocalInput(d.promo_start), promo_end: toLocalInput(d.promo_end),
      weight_g: d.weight_g ?? '', height_cm: decimalInput(d.height_cm), width_cm: decimalInput(d.width_cm), length_cm: decimalInput(d.length_cm),
      ncm: d.ncm ? formatNcm(d.ncm) : '', origin: d.origin != null ? String(d.origin) : '', gtin: d.gtin || '',
    })
    const imgs = d.images || [d.image_url, d.image_url_2, d.image_url_3, d.image_url_4].filter(Boolean)
    setPhotos(imgs.map(photoOf))
    setRun(d.size_stock?.length ? d.size_stock.map(x => ({ size: String(x.size), stock: Number(x.stock) || 0, reserved: Number(x.reserved) || 0 }))
      : parseSizes(d.sizes).map(size => ({ size, stock: 0 })))
    setAlert({ threshold: String(d.low_stock_threshold ?? 5), email: d.notify_email || '' })
    setErrors({})
    setDirty(false)
  }, [product.data, isNew])

  useEffect(() => {
    const list = blobs.current
    return () => list.forEach(url => URL.revokeObjectURL(url))
  }, [])

  const set = (k) => (e) => { const v = e?.target ? e.target.value : e; setForm(f => ({ ...f, [k]: v })); setDirty(true) }
  const setRunDirty = (v) => { setRun(v); setDirty(true) }
  const setPhotosDirty = (v) => { setPhotos(v); setDirty(true) }

  const addFiles = (files) => {
    const all = Array.from(files || [])
    if (!all.length) return
    const problem = all.map(imageProblem).find(Boolean)
    const good = all.filter(f => !imageProblem(f))
    const room = Math.max(0, 4 - photos.length)
    if (problem) toast.error(problem)
    else if (good.length > room) toast.info(`Cabem 4 fotos por produto: ${plural(good.length - room, 'ficou de fora', 'ficaram de fora')}.`)
    const take = good.slice(0, room)
    if (!take.length) return
    const added = take.map(file => {
      const preview = URL.createObjectURL(file)
      blobs.current.push(preview)
      return { id: `p${++photoSeq}`, file, preview }
    })
    setPhotosDirty([...photos, ...added])
  }

  const move = (i, dir) => {
    const j = i + dir
    if (j < 0 || j >= photos.length) return
    const copy = [...photos]
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
    setPhotosDirty(copy)
  }

  const priceNum = parseDecimal(form.price)
  const discNum = String(form.discount_percentage).trim() === '' ? 0 : parseDecimal(form.discount_percentage)

  const validate = () => {
    const e = {}
    if (!form.name.trim()) e.name = 'Dê um nome ao produto.'
    if (!(priceNum > 0)) e.price = 'Informe um preço maior que zero.'
    else if (priceNum > 10000000) e.price = 'Preço alto demais. Confira os zeros.'
    if (!(discNum >= 0 && discNum <= 90)) e.discount = 'O desconto vai de 0 a 90%.'
    if (form.promo_start && form.promo_end && form.promo_end <= form.promo_start) e.promo = 'O fim da promoção tem que vir depois do início.'
    const th = Number(alert.threshold)
    if (!isNew && !(Number.isInteger(th) && th >= 1 && th <= 9999)) e.threshold = 'Use um número inteiro de 1 a 9999.'
    if (alert.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(alert.email.trim())) e.email = 'E-mail inválido.'
    if (form.featured && !/^-?\d{1,6}$/.test(String(form.feature_order).trim() || '0')) e.featureOrder = 'Use um número inteiro.'
    if (form.ncm && form.ncm.replace(/\D/g, '').length !== 8) e.ncm = 'O NCM tem 8 números.'
    const gtin = form.gtin.replace(/\D/g, '')
    if (gtin && ![8, 12, 13, 14].includes(gtin.length)) e.gtin = 'O código de barras tem 8, 12, 13 ou 14 números.'
    else if (gtin && !validGtin(gtin)) e.gtin = 'O último número não confere. Copie de novo da etiqueta da caixa.'
    if (outOfRange(form.weight_g, 100000) || ['height_cm', 'width_cm', 'length_cm'].some(k => outOfRange(form[k], 9999))) {
      e.measures = 'Use números: peso até 100.000 g e medidas até 9.999 cm.'
    }
    setErrors(e)
    return !Object.keys(e).length
  }

  const close = () => (location.state?.fromList ? navigate(-1) : navigate('/admin/produtos'))

  const canClose = async () => {
    if (!dirty) return true
    return confirm({ title: 'Descartar as alterações?', message: 'O que você mudou neste produto ainda não foi salvo.', confirmLabel: 'Descartar', cancelLabel: 'Continuar editando', tone: 'danger' })
  }

  const save = async () => {
    if (busy.current) return
    if (!validate()) { toast.error('Confira os campos marcados.'); return }
    busy.current = true
    setSaving(true)
    try {
      // Cada foto nova sobe uma vez só: se algo falhar depois, a próxima
      // tentativa aproveita as que já subiram.
      const list = [...photos]
      for (let i = 0; i < list.length; i++) {
        if (!list[i].file) continue
        list[i] = { ...list[i], file: null, url: await uploadImage(list[i].file, 'products') }
        setPhotos([...list])
      }
      const urls = list.map(ph => ph.url)
      const payload = {
        name: form.name.trim(),
        description: form.description,
        price: priceNum,
        discount_percentage: discNum,
        brand_id: form.brand_id ? Number(form.brand_id) : null,
        category_id: form.category_id ? Number(form.category_id) : null,
        active: form.active,
        featured: form.featured,
        feature_order: parseInt(form.feature_order, 10) || 0,
        meta_title: form.meta_title,
        meta_description: form.meta_description,
        tags: form.tags,
        promo_start: form.promo_start || null,
        promo_end: form.promo_end || null,
        weight_g: optionalNumber(form.weight_g, true),
        height_cm: optionalNumber(form.height_cm),
        width_cm: optionalNumber(form.width_cm),
        length_cm: optionalNumber(form.length_cm),
        ncm: form.ncm ? form.ncm.replace(/\D/g, '') : null,
        origin: form.origin === '' ? null : form.origin,
        gtin: form.gtin ? form.gtin.replace(/\D/g, '') : null,
        image_url: urls[0] || null,
        image_url_2: urls[1] || null,
        image_url_3: urls[2] || null,
        image_url_4: urls[3] || null,
        sizes: run.map(x => x.size).join(','),
        size_stock: run.map(x => ({ size: String(x.size), stock: Number(x.stock) || 0 })),
      }
      let savedId = id
      if (isNew) {
        const { data } = await api.post('/products', payload)
        savedId = data?.id
      } else {
        await api.put(`/products/${id}`, payload)
        try {
          await api.put(`/stock/threshold/${id}`, { threshold: Number(alert.threshold), notify_email: alert.email.trim() || null })
        } catch (err) {
          throw new Error(`O produto foi salvo, mas o aviso de estoque não: ${err.message}`)
        }
      }
      setDirty(false)
      toast.good(isNew ? 'Produto cadastrado.' : 'Produto salvo.')
      if (isNew && savedId) navigate(`/admin/produtos/${savedId}`, { replace: true, state: location.state })
      else product.reload()
    } catch (err) {
      toast.error(err.message)
    } finally {
      busy.current = false
      setSaving(false)
    }
  }

  const removeProduct = async () => {
    const d = product.data
    const ok = await confirm({
      title: d?.can_delete ? `Apagar "${d.name}"?` : `Tirar "${d?.name}" da loja?`,
      message: d?.can_delete
        ? 'Ele nunca teve pedido nem avaliação, então some de vez.'
        : `Ele tem ${plural(d?.orders_count, 'pedido', 'pedidos')} no histórico: fica guardado, só sai da loja.`,
      confirmLabel: d?.can_delete ? 'Apagar' : 'Tirar da loja',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await api.delete(`/products/${id}`)
      toast.good(d?.can_delete ? 'Produto apagado.' : 'Produto tirado da loja.')
      setDirty(false)
      navigate('/admin/produtos', { replace: true })
    } catch (err) { toast.error(err.message) }
  }

  const loading = !isNew && !product.data && !product.error
  const total = run.reduce((n, x) => n + (Number(x.stock) || 0), 0)

  return (
    <Dialog
      open
      routed
      size="l"
      onClose={close}
      canClose={canClose}
      title={isNew ? 'Novo produto' : form.name || 'Produto'}
      description={isNew ? 'Fotos, preço e a grade de tamanhos.' : product.data ? `${plural(total, 'par', 'pares')} em estoque${product.data.orders_count ? `, ${plural(product.data.orders_count, 'venda', 'vendas')}` : ''}` : ''}
      footer={
        <>
          {!isNew && product.data && <Button variant="danger" icon={<FiTrash2 />} onClick={removeProduct}>{product.data.can_delete ? 'Apagar' : 'Tirar da loja'}</Button>}
          <span className={p.spacer} />
          <Button variant="ghost" onClick={async () => { if (await canClose()) { setDirty(false); close() } }}>Cancelar</Button>
          <Button variant="primary" onClick={save} loading={saving} disabled={loading}>{isNew ? 'Cadastrar produto' : 'Salvar'}</Button>
        </>
      }
    >
      <ErrorNote error={product.error} onRetry={product.reload} />
      {loading ? <Skeleton lines={10} height={22} /> : (
        <div className={p.editor}>
          <section className={p.part}>
            <div className={p.partHead}>
              <h3 className={p.partTitle}>Fotos</h3>
              <p className={p.partHint}>Até 4, em JPG, PNG ou WebP de até 10 MB. A primeira é a capa; arraste para mudar a ordem.</p>
            </div>
            <Reorder.Group as="ul" axis="x" values={photos} onReorder={setPhotosDirty} className={p.photos}>
              {photos.map((ph, i) => (
                <Reorder.Item as="li" key={ph.id} value={ph} className={p.photo} whileDrag={{ scale: 1.05, zIndex: 3 }}>
                  <img src={ph.preview} alt={`Foto ${i + 1}`} />
                  {i === 0 && <span className={p.photoCover}>Capa</span>}
                  <span className={p.photoTools} onPointerDown={e => e.stopPropagation()}>
                    {i > 0 && <button type="button" className={`${p.photoBtn} ${p.photoMove}`} onClick={() => move(i, -1)} aria-label={`Mover foto ${i + 1} para a esquerda`}><FiChevronLeft /></button>}
                    {i < photos.length - 1 && <button type="button" className={`${p.photoBtn} ${p.photoMove}`} onClick={() => move(i, 1)} aria-label={`Mover foto ${i + 1} para a direita`}><FiChevronRight /></button>}
                    <button type="button" className={p.photoBtn} onClick={() => setPhotosDirty(photos.filter(x => x.id !== ph.id))} aria-label={`Tirar foto ${i + 1}`}><FiX /></button>
                  </span>
                </Reorder.Item>
              ))}
              {photos.length < 4 && (
                <li>
                  <button type="button" className={p.photoAdd} onClick={() => fileRef.current?.click()}>
                    <FiImage aria-hidden="true" />
                    Adicionar foto
                  </button>
                </li>
              )}
            </Reorder.Group>
            <input ref={fileRef} type="file" accept={IMAGE_ACCEPT} multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
          </section>

          <section className={p.part}>
            <h3 className={p.partTitle}>Informações</h3>
            <TextField label="Nome" value={form.name} onChange={set('name')} error={errors.name} maxLength={255} placeholder="Ex.: Air Jordan 1 Low Bred" data-autofocus={isNew || undefined} />
            <div className={s.formRow}>
              <SelectField label="Marca" placeholder="Sem marca" value={form.brand_id} onChange={set('brand_id')} options={(brands.data || []).map(b => ({ value: String(b.id), label: b.name }))} />
              <SelectField label="Categoria" placeholder="Sem categoria" value={form.category_id} onChange={set('category_id')} options={(categories.data || []).map(c => ({ value: String(c.id), label: c.name }))} />
            </div>
            <TextField label="Descrição" multiline value={form.description} onChange={set('description')} maxLength={20000} placeholder="Material, cor, detalhes que o cliente quer saber" />
          </section>

          <section className={p.part}>
            <h3 className={p.partTitle}>Preço</h3>
            <div className={s.formRow}>
              <TextField label="Preço cheio" prefix="R$" inputMode="decimal" value={form.price} onChange={set('price')} error={errors.price} placeholder="0,00" />
              <TextField label="Desconto" suffix="%" inputMode="decimal" value={form.discount_percentage} onChange={set('discount_percentage')} error={errors.discount} />
            </div>
            <div className={s.formRow}>
              <TextField label="Promoção começa" type="datetime-local" value={form.promo_start} onChange={set('promo_start')} hint="Vazio: o desconto vale desde já." />
              <TextField label="Promoção termina" type="datetime-local" value={form.promo_end} onChange={set('promo_end')} error={errors.promo} hint="Vazio: sem data para acabar." />
            </div>
            <div className={p.pricePreview}>
              <span className={s.muted}>Na loja:</span>
              <span className={p.pricePreviewNow}>{money(finalPrice(priceNum || 0, discNum || 0))}</span>
              {discNum > 0 && priceNum > 0 && <span className={p.priceWas}>{money(priceNum)}</span>}
              {discNum > 0 && <Badge tone="info">{number(discNum)}% off</Badge>}
            </div>
          </section>

          <section className={p.part}>
            <div className={p.partHead}>
              <h3 className={p.partTitle}>Grade e estoque</h3>
              <p className={p.partHint}>{plural(total, 'par', 'pares')} no total</p>
            </div>
            {!run.length && (
              <p className={p.warn}><FiAlertTriangle aria-hidden="true" />Sem tamanhos, o produto aparece na loja mas ninguém consegue comprar. Monte a grade abaixo.</p>
            )}
            <SizeRunEditor value={run} onChange={setRunDirty} />
            {!isNew && (
              <div className={s.formRow}>
                <TextField label="Avisar quando o total ficar em" suffix="pares" inputMode="numeric" value={alert.threshold} onChange={e => { setAlert(a => ({ ...a, threshold: e.target.value })); setDirty(true) }} error={errors.threshold} hint="Entra na lista Acabando do Estoque." />
                <TextField label="E-mail do aviso" type="email" value={alert.email} onChange={e => { setAlert(a => ({ ...a, email: e.target.value })); setDirty(true) }} error={errors.email} placeholder="Opcional" />
              </div>
            )}
          </section>

          <section className={p.part}>
            <h3 className={p.partTitle}>Na loja</h3>
            <Switch checked={form.active} onChange={set('active')} label="Mostrar na loja" description="Desligado, o produto some da vitrine mas continua aqui." />
            <Switch checked={form.featured} onChange={set('featured')} label="Destaque" description="Aparece primeiro na vitrine." />
            {form.featured && <TextField className={p.narrow} label="Posição no destaque" inputMode="numeric" value={form.feature_order} onChange={set('feature_order')} error={errors.featureOrder} hint="Menor aparece antes." />}
          </section>

          <details className={p.more}>
            <summary>Busca do Google e redes</summary>
            <div className={p.moreBody}>
              <TextField label="Título na busca" value={form.meta_title} onChange={set('meta_title')} maxLength={255} hint={`${form.meta_title.length} de 60 recomendados`} />
              <TextField label="Descrição na busca" multiline value={form.meta_description} onChange={set('meta_description')} maxLength={2000} hint={`${form.meta_description.length} de 155 recomendados`} />
              <TextField label="Palavras-chave" value={form.tags} onChange={set('tags')} maxLength={500} placeholder="jordan, retrô, vermelho" hint="Separe por vírgula. A busca da loja também usa." />
            </div>
          </details>

          <details className={p.more} open={!!(errors.ncm || errors.gtin) || undefined}>
            <summary>Dados fiscais (nota fiscal)</summary>
            <div className={p.moreBody}>
              <div className={s.formRow}>
                <TextField label="NCM" inputMode="numeric" value={form.ncm} onChange={e => { setForm(f => ({ ...f, ncm: formatNcm(e.target.value) })); setDirty(true) }} placeholder="Vazio: usa o padrão" error={errors.ncm} />
                <SelectField label="Origem" placeholder="Usar o padrão" value={form.origin} onChange={set('origin')} options={ORIGINS} />
                <TextField label="Código de barras (GTIN)" inputMode="numeric" value={form.gtin} onChange={e => { setForm(f => ({ ...f, gtin: e.target.value.replace(/\D/g, '').slice(0, 14) })); setDirty(true) }} placeholder="Opcional" error={errors.gtin} />
              </div>
              <p className={p.partHint}>Sem NCM próprio, a nota usa o NCM padrão das Configurações. Confirme o NCM do tênis com o contador.</p>
            </div>
          </details>

          <details className={p.more} open={!!errors.measures || undefined}>
            <summary>Peso e medidas da caixa (frete)</summary>
            <div className={p.moreBody}>
              <div className={s.formRow}>
                <TextField label="Peso" suffix="g" inputMode="numeric" value={form.weight_g} onChange={set('weight_g')} placeholder="300" />
                <TextField label="Altura" suffix="cm" inputMode="decimal" value={form.height_cm} onChange={set('height_cm')} placeholder="12" />
                <TextField label="Largura" suffix="cm" inputMode="decimal" value={form.width_cm} onChange={set('width_cm')} placeholder="20" />
                <TextField label="Comprimento" suffix="cm" inputMode="decimal" value={form.length_cm} onChange={set('length_cm')} placeholder="33" />
              </div>
              {errors.measures
                ? <p className={p.fieldError} role="alert"><FiAlertTriangle aria-hidden="true" />{errors.measures}</p>
                : <p className={p.partHint}>Sem peso, o frete por peso usa 300 g.</p>}
            </div>
          </details>
        </div>
      )}
    </Dialog>
  )
}
