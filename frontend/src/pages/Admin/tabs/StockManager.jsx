import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FiSave, FiBell, FiEdit2, FiTrash2, FiPlus, FiUploadCloud,
  FiDownload, FiTruck, FiCheckCircle, FiTrendingUp, FiFileText,
} from 'react-icons/fi'
import api from '../../../services/api'
import { parseSizes } from '../../../utils/sizes'
import { getImageUrl } from '../../../utils/imageHelper'
import { useToast } from '../../../components/Toast/Toast'
import styles from './StockManager.module.css'

/* ===== Constantes & helpers ===== */
const SUB_TABS = [
  { key: 'overview', label: 'Visão Geral' },
  { key: 'bySize', label: 'Por Tamanho' },
  { key: 'alerts', label: 'Alertas' },
  { key: 'history', label: 'Histórico' },
  { key: 'forecast', label: 'Previsão' },
  { key: 'suppliers', label: 'Fornecedores' },
  { key: 'io', label: 'Importar/Exportar' },
]
const DEFAULT_THRESHOLD = 5
const thresholdOf = (p) => Number(p?.low_stock_threshold ?? p?.threshold ?? DEFAULT_THRESHOLD)
const statusOf = (stock, threshold) => (stock <= 0 ? 'zero' : stock <= threshold ? 'low' : 'ok')
const STATUS_META = {
  ok: { label: 'OK', cls: 'ok' },
  low: { label: 'Baixo', cls: 'low' },
  zero: { label: 'Zerado', cls: 'zero' },
}
const productList = (data) => (Array.isArray(data) ? data : data?.data || [])
const fmtDate = (d) => {
  if (!d) return '—'
  const date = new Date(d)
  return isNaN(date) ? String(d) : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.ok
  return <span className={`${styles.stockBadge} ${styles[m.cls]}`}>{m.label}</span>
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/* Busca de produto reutilizável (input + dropdown) */
function ProductPicker({ products, value, onChange, placeholder = 'Buscar produto...', allowAll = false }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const selected = products.find(p => p.id === value)

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return products.filter(p => !q || (p.name || '').toLowerCase().includes(q)).slice(0, 30)
  }, [products, query])

  return (
    <div className={styles.dropdown} ref={ref}>
      <input
        className={styles.searchInput}
        placeholder={placeholder}
        value={open ? query : (selected ? selected.name : query)}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
      />
      {open && (
        <div className={styles.dropdownList}>
          {allowAll && (
            <div className={styles.dropdownItem} onClick={() => { onChange(null); setOpen(false); setQuery('') }}>
              Todos os produtos
            </div>
          )}
          {filtered.length === 0 && <div className={styles.dropdownItem}>Nenhum produto</div>}
          {filtered.map(p => (
            <div key={p.id} className={styles.dropdownItem}
              onClick={() => { onChange(p.id); setOpen(false); setQuery('') }}>
              {p.name}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ============================================================
   COMPONENTE PRINCIPAL
   ============================================================ */
export default function StockManager() {
  const [sub, setSub] = useState('overview')
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [preselect, setPreselect] = useState(null)

  const loadProducts = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/products', { params: { limit: 200 } })
      setProducts(productList(data))
    } catch {
      setProducts([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadProducts() }, [loadProducts])

  const goAdjust = (id) => { setPreselect(id); setSub('bySize') }
  const goSupplier = () => setSub('suppliers')

  return (
    <motion.div className={styles.container} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className={styles.subTabs}>
        {SUB_TABS.map(t => (
          <button key={t.key}
            className={`${styles.subTab} ${sub === t.key ? styles.active : ''}`}
            onClick={() => setSub(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {sub === 'overview' && <OverviewTab products={products} loading={loading} />}
      {sub === 'bySize' && (
        <BySizeTab products={products} preselect={preselect}
          onConsumePreselect={() => setPreselect(null)} onSaved={loadProducts} />
      )}
      {sub === 'alerts' && <AlertsTab products={products} onAdjust={goAdjust} onSupplier={goSupplier} />}
      {sub === 'history' && <HistoryTab products={products} />}
      {sub === 'forecast' && <ForecastTab products={products} />}
      {sub === 'suppliers' && <SuppliersTab />}
      {sub === 'io' && <ImportExportTab onImported={loadProducts} />}
    </motion.div>
  )
}

/* ============================================================
   VISÃO GERAL
   ============================================================ */
function OverviewTab({ products, loading }) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const PER = 20

  const summary = useMemo(() => {
    let healthy = 0, low = 0, zero = 0
    products.forEach(p => {
      const st = statusOf(Number(p.stock || 0), thresholdOf(p))
      if (st === 'ok') healthy++
      else if (st === 'low') low++
      else zero++
    })
    return { total: products.length, healthy, low, zero }
  }, [products])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return products.filter(p => !q || (p.name || '').toLowerCase().includes(q))
  }, [products, search])

  useEffect(() => { setPage(1) }, [search])
  const pages = Math.max(1, Math.ceil(filtered.length / PER))
  const pageItems = filtered.slice((page - 1) * PER, page * PER)

  if (loading) {
    return <div>{[...Array(5)].map((_, i) => <div key={i} className={styles.skeletonCard} />)}</div>
  }

  const cards = [
    { label: 'Produtos ativos', value: summary.total, cls: '' },
    { label: 'Estoque saudável', value: summary.healthy, cls: 'success' },
    { label: 'Estoque baixo', value: summary.low, cls: 'warning' },
    { label: 'Sem estoque', value: summary.zero, cls: 'danger' },
  ]

  return (
    <>
      <div className={styles.summaryCards}>
        {cards.map(c => (
          <div key={c.label} className={`${styles.summaryCard} ${c.cls ? styles[c.cls] : ''}`}>
            <div className={styles.value}>{c.value}</div>
            <div className={styles.label}>{c.label}</div>
          </div>
        ))}
      </div>

      <div className={styles.toolbar}>
        <input className={styles.searchInput} placeholder="Buscar produto por nome..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Produto</th><th>Marca</th><th>Estoque</th><th>Status</th><th>Alerta &le;</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.length === 0 && (
              <tr><td colSpan={5} className={styles.muted} style={{ textAlign: 'center', padding: 32 }}>Nenhum produto encontrado</td></tr>
            )}
            {pageItems.map(p => {
              const stock = Number(p.stock || 0)
              const threshold = thresholdOf(p)
              return (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td className={styles.muted}>{p.brand_name || '—'}</td>
                  <td className={styles.num}>{stock}</td>
                  <td><StatusBadge status={statusOf(stock, threshold)} /></td>
                  <td className={styles.num}>{threshold}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className={styles.pagination}>
          <button className={styles.pageBtn} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</button>
          <span className={styles.pageInfo}>{page} / {pages}</span>
          <button className={styles.pageBtn} disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Próxima</button>
        </div>
      )}
    </>
  )
}

/* ============================================================
   POR TAMANHO
   ============================================================ */
function BySizeTab({ products, preselect, onConsumePreselect, onSaved }) {
  const addToast = useToast()
  const [selectedId, setSelectedId] = useState(preselect || null)
  const [rows, setRows] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [alertOpen, setAlertOpen] = useState(false)

  useEffect(() => {
    if (preselect) { setSelectedId(preselect); onConsumePreselect() }
  }, [preselect]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedProduct = products.find(p => p.id === selectedId)

  useEffect(() => {
    if (!selectedId) { setRows(null); return }
    let alive = true
    setLoading(true)
    const fallbackStr = products.find(p => p.id === selectedId)?.sizes
    api.get(`/stock/product/${selectedId}/sizes`)
      .then(({ data }) => {
        if (!alive) return
        const list = Array.isArray(data) ? data : data?.sizes || []
        setRows(list.map(s => ({ size: String(s.size), stock: Number(s.stock ?? 0), reserved: Number(s.reserved ?? 0) })))
      })
      .catch(() => {
        if (!alive) return
        setRows(parseSizes(fallbackStr).map(size => ({ size: String(size), stock: 0, reserved: 0 })))
      })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  const setStock = (i, val) =>
    setRows(rs => rs.map((r, idx) => (idx === i ? { ...r, stock: Math.max(0, parseInt(val) || 0) } : r)))

  const save = async () => {
    if (!rows) return
    setSaving(true)
    try {
      await api.put(`/stock/product/${selectedId}/sizes`, { sizes: rows.map(r => ({ size: r.size, stock: r.stock })) })
      addToast('Estoque por tamanho atualizado!', 'success')
      onSaved && onSaved()
    } catch {
      addToast('Não foi possível salvar o estoque.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const badgeFor = (stock) => (stock === 0 ? 'zero' : stock < 5 ? 'low' : 'ok')

  return (
    <>
      <p className={styles.sectionDesc}>Selecione um produto para editar o estoque por tamanho.</p>
      <ProductPicker products={products} value={selectedId} onChange={setSelectedId} />

      {!selectedId && <p className={styles.muted}>Nenhum produto selecionado.</p>}

      {selectedId && loading && (
        <div className={styles.sizeGrid}>
          {[...Array(6)].map((_, i) => <div key={i} className={styles.skeletonCard} style={{ height: 80 }} />)}
        </div>
      )}

      {selectedId && !loading && rows && (
        <>
          <div className={styles.sizeGrid}>
            {rows.map((r, i) => (
              <div key={r.size} className={styles.sizeItem}>
                <span className={styles.sizeLabel}>{r.size}</span>
                <input
                  type="number" min="0"
                  className={`${styles.sizeInput} ${badgeFor(r.stock) === 'low' ? styles.low : ''} ${badgeFor(r.stock) === 'zero' ? styles.zero : ''}`}
                  value={r.stock}
                  onChange={e => setStock(i, e.target.value)}
                />
                <span className={`${styles.stockBadge} ${styles[badgeFor(r.stock)]}`}>
                  {badgeFor(r.stock) === 'ok' ? 'OK' : badgeFor(r.stock) === 'low' ? 'Baixo' : 'Zerado'}
                </span>
                <span className={styles.reservedHint}>Reservados agora: {r.reserved}</span>
              </div>
            ))}
            {rows.length === 0 && <p className={styles.muted}>Este produto não tem tamanhos cadastrados.</p>}
          </div>

          <div className={styles.toolbar}>
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={save} disabled={saving}>
              <FiSave /> {saving ? 'Salvando...' : 'Salvar alterações'}
            </button>
            <button className={styles.btn} onClick={() => setAlertOpen(true)}>
              <FiBell /> Configurar alerta
            </button>
          </div>
        </>
      )}

      <AnimatePresence>
        {alertOpen && (
          <ThresholdModal product={selectedProduct} onClose={() => setAlertOpen(false)} />
        )}
      </AnimatePresence>
    </>
  )
}

function ThresholdModal({ product, onClose }) {
  const addToast = useToast()
  const [threshold, setThreshold] = useState(thresholdOf(product))
  const [email, setEmail] = useState(product?.alert_email || '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await api.put(`/stock/threshold/${product.id}`, { threshold: Number(threshold), email: email.trim() })
      addToast('Alerta configurado!', 'success')
      onClose()
    } catch {
      addToast('Não foi possível salvar o alerta.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div className={styles.modalOverlay} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className={styles.modal} initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }} onClick={e => e.stopPropagation()}>
        <div className={styles.modalTitle}>Configurar alerta — {product?.name}</div>
        <div className={styles.field}>
          <label>Avisar quando estoque &le;</label>
          <input type="number" min="0" className={styles.input} value={threshold} onChange={e => setThreshold(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label>Email de notificação</label>
          <input type="email" className={styles.input} placeholder="alerta@loja.com" value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <div className={styles.modalActions}>
          <button className={styles.btn} onClick={onClose}>Cancelar</button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={save} disabled={saving}>
            <FiSave /> {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

/* ============================================================
   ALERTAS
   ============================================================ */
function AlertsTab({ products, onAdjust, onSupplier }) {
  const [alerts, setAlerts] = useState(null)

  useEffect(() => {
    let alive = true
    api.get('/stock/low-stock')
      .then(({ data }) => { if (alive) setAlerts(productList(data)) })
      .catch(() => {
        if (!alive) return
        setAlerts(products.filter(p => statusOf(Number(p.stock || 0), thresholdOf(p)) !== 'ok'))
      })
    return () => { alive = false }
  }, [products])

  if (alerts === null) return <div>{[...Array(3)].map((_, i) => <div key={i} className={styles.skeletonCard} />)}</div>

  if (!alerts.length) {
    return (
      <div className={styles.empty}>
        <span className={styles.emoji}><FiCheckCircle /></span>
        <p>Todos os estoques estão saudáveis!</p>
      </div>
    )
  }

  return (
    <div className={styles.alertGrid}>
      {alerts.map(p => {
        const stock = Number(p.stock || 0)
        const danger = stock === 0
        return (
          <div key={p.id} className={`${styles.alertCard} ${danger ? styles.danger : styles.warning}`}>
            <img className={styles.alertImg} src={getImageUrl(p.image_url, p.name)} alt={p.name} />
            <div className={styles.alertInfo}>
              <span className={styles.alertName}>{p.name}</span>
              <span className={styles.alertBrand}>{p.brand_name || '—'}</span>
              <div className={styles.alertStock}>
                Estoque: <strong>{stock}</strong> unidades · alerta &le; {thresholdOf(p)}
              </div>
            </div>
            <div className={styles.alertActions}>
              <button className={`${styles.btn} ${styles.btnSm}`} onClick={() => onAdjust(p.id)}>
                <FiEdit2 /> Ajustar estoque
              </button>
              <button className={`${styles.btn} ${styles.btnSm}`} onClick={onSupplier}>
                <FiTruck /> Ver fornecedor
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ============================================================
   HISTÓRICO
   ============================================================ */
const HISTORY_TYPES = [
  { value: '', label: 'Todos' },
  { value: 'sale', label: 'Venda' },
  { value: 'adjustment', label: 'Ajuste' },
  { value: 'import', label: 'Importação' },
  { value: 'return', label: 'Devolução' },
]
const TYPE_LABEL = { sale: 'Venda', adjustment: 'Ajuste', import: 'Importação', return: 'Devolução' }

function HistoryTab({ products }) {
  const [productId, setProductId] = useState(null)
  const [type, setType] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const PER = 20

  useEffect(() => {
    let alive = true
    setLoading(true)
    const url = productId ? `/stock/product/${productId}/history` : '/stock/history'
    api.get(url, { params: type ? { type } : {} })
      .then(({ data }) => { if (alive) setRows(productList(data)) })
      .catch(() => { if (alive) setRows([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [productId, type])

  const filtered = useMemo(
    () => (type ? rows.filter(r => (r.type || '') === type) : rows),
    [rows, type]
  )
  useEffect(() => { setPage(1) }, [productId, type])
  const pages = Math.max(1, Math.ceil(filtered.length / PER))
  const pageItems = filtered.slice((page - 1) * PER, page * PER)

  const exportCsv = () => {
    const header = ['data', 'produto', 'tamanho', 'tipo', 'variacao', 'saldo_antes', 'saldo_depois', 'responsavel']
    const lines = filtered.map(r => [
      fmtDate(r.created_at || r.date),
      r.product_name || r.product || '',
      r.size || '',
      TYPE_LABEL[r.type] || r.type || '',
      r.change ?? r.delta ?? '',
      r.balance_before ?? r.before ?? '',
      r.balance_after ?? r.after ?? '',
      r.user || r.responsible || r.created_by || '',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    const csv = [header.join(','), ...lines].join('\n')
    triggerDownload(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), 'historico-estoque.csv')
  }

  return (
    <>
      <div className={styles.toolbar}>
        <div style={{ flex: '1 1 260px' }}>
          <ProductPicker products={products} value={productId} onChange={setProductId} placeholder="Todos os produtos" allowAll />
        </div>
        <select className={styles.searchInput} style={{ flex: '0 0 160px' }} value={type} onChange={e => setType(e.target.value)}>
          {HISTORY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <div className={styles.spacer} />
        <button className={styles.btn} onClick={exportCsv} disabled={!filtered.length}>
          <FiDownload /> Exportar CSV
        </button>
      </div>

      {loading ? (
        <div>{[...Array(4)].map((_, i) => <div key={i} className={styles.skeletonCard} style={{ height: 48 }} />)}</div>
      ) : filtered.length === 0 ? (
        <div className={styles.empty}><span className={styles.emoji}><FiFileText /></span><p>Nenhuma movimentação registrada.</p></div>
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Data/Hora</th><th>Produto</th><th>Tam.</th><th>Tipo</th>
                  <th>Variação</th><th>Antes</th><th>Depois</th><th>Responsável</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((r, i) => {
                  const change = Number(r.change ?? r.delta ?? 0)
                  const t = r.type
                  return (
                    <tr key={r.id || i}>
                      <td className={styles.muted}>{fmtDate(r.created_at || r.date)}</td>
                      <td>{r.product_name || r.product || '—'}</td>
                      <td className={styles.num}>{r.size || '—'}</td>
                      <td><span className={`${styles.stockBadge} ${t === 'sale' ? styles.low : t === 'return' || t === 'import' ? styles.ok : styles.zero}`}>{TYPE_LABEL[t] || t || '—'}</span></td>
                      <td className={change >= 0 ? styles.pos : styles.neg}>{change >= 0 ? `+${change}` : change}</td>
                      <td className={styles.num}>{r.balance_before ?? r.before ?? '—'}</td>
                      <td className={styles.num}>{r.balance_after ?? r.after ?? '—'}</td>
                      <td className={styles.muted}>{r.user || r.responsible || r.created_by || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className={styles.pagination}>
              <button className={styles.pageBtn} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</button>
              <span className={styles.pageInfo}>{page} / {pages}</span>
              <button className={styles.pageBtn} disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Próxima</button>
            </div>
          )}
        </>
      )}
    </>
  )
}

/* ============================================================
   PREVISÃO
   ============================================================ */
function ForecastTab({ products }) {
  const [items, setItems] = useState(null)

  useEffect(() => {
    let alive = true
    const normalize = (arr) => (Array.isArray(arr) ? arr : arr?.data || []).map(f => ({
      id: f.id ?? f.product_id,
      name: f.name || f.product_name,
      brand_name: f.brand_name,
      avgDaily: Number(f.avg_daily_sales ?? f.daily_avg ?? f.avg_per_day ?? 0),
      stock: Number(f.current_stock ?? f.stock ?? 0),
      days: f.days_remaining ?? f.estimated_days ?? f.days ?? null,
    }))

    api.get('/stock/forecast')
      .then(({ data }) => { if (alive) setItems(normalize(data)) })
      .catch(async () => {
        // Fallback: consulta por produto (limita para não floodar a API).
        try {
          const subset = products.slice(0, 40)
          const res = await Promise.all(subset.map(p =>
            api.get(`/stock/forecast/${p.id}`)
              .then(r => ({ ...r.data, id: p.id, name: p.name, brand_name: p.brand_name }))
              .catch(() => null)
          ))
          if (alive) setItems(normalize(res.filter(Boolean)))
        } catch {
          if (alive) setItems([])
        }
      })
    return () => { alive = false }
  }, [products])

  if (items === null) return <div>{[...Array(3)].map((_, i) => <div key={i} className={styles.skeletonCard} style={{ height: 150 }} />)}</div>

  const withDays = items
    .filter(i => i.days != null && i.days !== Infinity)
    .sort((a, b) => Number(a.days) - Number(b.days))

  if (!withDays.length) {
    return (
      <div className={styles.empty}>
        <span className={styles.emoji}><FiTrendingUp /></span>
        <p>Sem dados de previsão de vendas ainda.</p>
      </div>
    )
  }

  const barColor = (d) => (d > 30 ? 'green' : d >= 10 ? 'yellow' : 'red')

  return (
    <div className={styles.forecastGrid}>
      {withDays.map(f => {
        const days = Number(f.days)
        const pct = Math.max(4, Math.min(100, (days / 60) * 100))
        return (
          <div key={f.id} className={styles.forecastCard}>
            <div className={styles.forecastName}>{f.name}</div>
            <div className={styles.forecastBrand}>{f.brand_name || '—'}</div>
            <div className={styles.forecastStat}>Média de vendas: <strong>{f.avgDaily.toFixed(1)}</strong> unid/dia (últimos 30d)</div>
            <div className={styles.forecastStat}>Estoque atual: <strong>{f.stock}</strong> unidades</div>
            <div className={styles.forecastDays}>{days} dias</div>
            <div className={styles.forecastDaysLabel}>Duração estimada</div>
            <div className={styles.forecastTrack}>
              <div className={`${styles.forecastBar} ${styles[barColor(days)]}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ============================================================
   FORNECEDORES
   ============================================================ */
const EMPTY_SUPPLIER = { name: '', contact_name: '', email: '', phone: '', lead_time_days: '', notes: '', active: true }

function SuppliersTab() {
  const addToast = useToast()
  const [suppliers, setSuppliers] = useState(null)
  const [modal, setModal] = useState(null) // null | {form, editingId}

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/suppliers')
      setSuppliers(productList(data))
    } catch {
      setSuppliers([])
    }
  }, [])
  useEffect(() => { load() }, [load])

  const remove = async (id) => {
    if (!window.confirm('Excluir este fornecedor?')) return
    try {
      await api.delete(`/suppliers/${id}`)
      addToast('Fornecedor excluído.', 'success')
      load()
    } catch {
      addToast('Não foi possível excluir.', 'error')
    }
  }

  const save = async (form, editingId) => {
    const payload = { ...form, lead_time_days: Number(form.lead_time_days) || 0 }
    try {
      if (editingId) await api.put(`/suppliers/${editingId}`, payload)
      else await api.post('/suppliers', payload)
      addToast('Fornecedor salvo!', 'success')
      setModal(null)
      load()
    } catch {
      addToast('Não foi possível salvar o fornecedor.', 'error')
    }
  }

  if (suppliers === null) return <div>{[...Array(3)].map((_, i) => <div key={i} className={styles.skeletonCard} style={{ height: 48 }} />)}</div>

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.spacer} />
        <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setModal({ form: { ...EMPTY_SUPPLIER }, editingId: null })}>
          <FiPlus /> Novo Fornecedor
        </button>
      </div>

      {suppliers.length === 0 ? (
        <div className={styles.empty}><span className={styles.emoji}><FiTruck /></span><p>Nenhum fornecedor cadastrado.</p></div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>Nome</th><th>Contato</th><th>Email</th><th>Telefone</th><th>Prazo</th><th>Ativo</th><th></th></tr>
            </thead>
            <tbody>
              {suppliers.map(s => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td className={styles.muted}>{s.contact_name || '—'}</td>
                  <td className={styles.muted}>{s.email || '—'}</td>
                  <td className={styles.muted}>{s.phone || '—'}</td>
                  <td className={styles.num}>{s.lead_time_days != null ? `${s.lead_time_days} dias` : '—'}</td>
                  <td><span className={`${styles.stockBadge} ${s.active ? styles.ok : styles.zero}`}>{s.active ? 'Ativo' : 'Inativo'}</span></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className={styles.btnIcon} onClick={() => setModal({ form: { ...EMPTY_SUPPLIER, ...s, active: !!s.active }, editingId: s.id })} title="Editar"><FiEdit2 /></button>{' '}
                    <button className={`${styles.btnIcon} ${styles.btnDanger}`} onClick={() => remove(s.id)} title="Excluir"><FiTrash2 /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AnimatePresence>
        {modal && <SupplierModal initial={modal.form} editingId={modal.editingId} onClose={() => setModal(null)} onSave={save} />}
      </AnimatePresence>
    </>
  )
}

function SupplierModal({ initial, editingId, onClose, onSave }) {
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const submit = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    await onSave(form, editingId)
    setSaving(false)
  }

  return (
    <motion.div className={styles.modalOverlay} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className={styles.modal} initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }} onClick={e => e.stopPropagation()}>
        <div className={styles.modalTitle}>{editingId ? 'Editar' : 'Novo'} Fornecedor</div>
        <div className={styles.field}><label>Nome *</label><input className={styles.input} value={form.name} onChange={set('name')} /></div>
        <div className={styles.field}><label>Nome do contato</label><input className={styles.input} value={form.contact_name} onChange={set('contact_name')} /></div>
        <div className={styles.field}><label>Email</label><input type="email" className={styles.input} value={form.email} onChange={set('email')} /></div>
        <div className={styles.field}><label>Telefone</label><input className={styles.input} value={form.phone} onChange={set('phone')} /></div>
        <div className={styles.field}><label>Prazo de entrega (dias)</label><input type="number" min="0" className={styles.input} value={form.lead_time_days} onChange={set('lead_time_days')} /></div>
        <div className={styles.field}><label>Observações</label><textarea className={styles.textarea} value={form.notes} onChange={set('notes')} /></div>
        <div className={styles.field}>
          <label>Status</label>
          <div className={styles.switchRow}>
            <button type="button" className={`${styles.switch} ${form.active ? styles.on : ''}`} onClick={() => setForm(f => ({ ...f, active: !f.active }))}>
              <span className={styles.switchKnob} />
            </button>
            <span>{form.active ? 'Ativo' : 'Inativo'}</span>
          </div>
        </div>
        <div className={styles.modalActions}>
          <button className={styles.btn} onClick={onClose}>Cancelar</button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={submit} disabled={saving || !form.name.trim()}>
            <FiSave /> {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

/* ============================================================
   IMPORTAR / EXPORTAR
   ============================================================ */
function ImportExportTab({ onImported }) {
  const addToast = useToast()
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState([])
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)
  const [exporting, setExporting] = useState(false)
  const inputRef = useRef(null)

  const handleFile = (f) => {
    if (!f) return
    if (!f.name.toLowerCase().endsWith('.csv')) {
      addToast('Selecione um arquivo .csv', 'error')
      return
    }
    setFile(f)
    setResult(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = String(e.target.result || '')
      const lines = text.split(/\r?\n/).filter(Boolean).slice(0, 6) // header + 5
      setPreview(lines.map(l => l.split(',')))
    }
    reader.readAsText(f)
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files?.[0])
  }

  const doImport = async () => {
    if (!file) return
    setImporting(true)
    setResult(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const { data } = await api.post('/stock/import-csv', fd)
      setResult({ ok: true, imported: data.imported ?? data.count ?? 0, errors: data.errors || [] })
      addToast('Importação concluída!', 'success')
      onImported && onImported()
    } catch (err) {
      setResult({ ok: false, message: err?.response?.data?.error || 'Falha na importação. Verifique o arquivo e o backend.' })
    } finally {
      setImporting(false)
    }
  }

  const downloadModel = () => {
    const sample = [
      'produto_id,nome,tamanho,estoque',
      '1,Tênis Exemplo A,40,12',
      '1,Tênis Exemplo A,41,8',
      '2,Tênis Exemplo B,42,0',
    ].join('\n')
    triggerDownload(new Blob(['﻿' + sample], { type: 'text/csv;charset=utf-8' }), 'modelo-estoque.csv')
  }

  const exportAll = async () => {
    setExporting(true)
    try {
      const res = await api.get('/stock/export-csv', { responseType: 'blob' })
      triggerDownload(new Blob([res.data], { type: 'text/csv;charset=utf-8' }), 'estoque-completo.csv')
    } catch {
      addToast('Não foi possível exportar (verifique o backend).', 'error')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className={styles.ioGrid}>
      {/* IMPORTAR */}
      <div className={styles.ioCard}>
        <div className={styles.ioTitle}><FiUploadCloud /> Importar CSV</div>
        <div
          className={`${styles.dropzone} ${dragging ? styles.dragging : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <div className={styles.icon}><FiUploadCloud /></div>
          <div>{file ? file.name : 'Arraste o CSV aqui ou clique para selecionar'}</div>
          <div className={styles.dzHint}>Apenas arquivos .csv</div>
          <input ref={inputRef} type="file" accept=".csv" hidden onChange={e => handleFile(e.target.files?.[0])} />
        </div>

        {preview.length > 0 && (
          <div className={styles.tableWrap} style={{ marginTop: 16 }}>
            <table className={styles.table}>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i}>{row.map((cell, j) => (i === 0 ? <th key={j}>{cell}</th> : <td key={j}>{cell}</td>))}</tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {file && (
          <div className={styles.toolbar} style={{ marginTop: 16 }}>
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={doImport} disabled={importing}>
              <FiUploadCloud /> {importing ? 'Importando...' : 'Importar'}
            </button>
            <button className={styles.btn} onClick={() => { setFile(null); setPreview([]); setResult(null) }}>Limpar</button>
          </div>
        )}

        {result?.ok && (
          <div className={styles.resultOk}>{result.imported} linhas importadas com sucesso</div>
        )}
        {result?.ok && result.errors?.length > 0 && (
          <div className={styles.resultErr}>
            <strong>{result.errors.length} erro(s):</strong>
            <table className={styles.table} style={{ marginTop: 8 }}>
              <thead><tr><th>Linha</th><th>Erro</th></tr></thead>
              <tbody>
                {result.errors.map((e, i) => (
                  <tr key={i}><td className={styles.num}>{e.line ?? e.row ?? i + 1}</td><td>{e.message || e.error || String(e)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {result && !result.ok && <div className={styles.resultErr}>{result.message}</div>}

        <button className={styles.linkBtn} onClick={downloadModel}>Baixar CSV modelo</button>
      </div>

      {/* EXPORTAR */}
      <div className={styles.ioCard}>
        <div className={styles.ioTitle}><FiDownload /> Exportar CSV</div>
        <p className={styles.sectionDesc}>Baixe a planilha completa de estoque (todos os produtos e tamanhos).</p>
        <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={exportAll} disabled={exporting}>
          <FiDownload /> {exporting ? 'Gerando...' : 'Exportar Estoque Completo'}
        </button>
      </div>
    </div>
  )
}
