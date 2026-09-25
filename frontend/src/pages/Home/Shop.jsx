import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useDragControls } from 'framer-motion'
import { GRID_SAMPLES } from '../../data/drops'
import { sameBrand } from '../../data/brands'
import { parseSizes } from '../../utils/sizes'
import { cachedGet, TTL } from '../../services/cache'
import ProductCard from '../../components/ProductCard/ProductCard'
import SkeletonGrid from '../../components/Skeleton/Skeleton'
import { MQ, useMedia } from '../../lib/breakpoints'
import { useScrollLock } from '../../lib/useScrollLock'
import { useBackToClose } from '../../lib/layers'
import styles from './Shop.module.css'

const EASE = [0.22, 1, 0.36, 1]

const SIZES = ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46']
const SORT_OPTIONS = [
  { value: '', label: 'Relevância' },
  { value: 'newest', label: 'Mais recentes' },
  { value: 'price_asc', label: 'Menor preço' },
  { value: 'price_desc', label: 'Maior preço' },
  { value: 'best_sellers', label: 'Mais vendidos' },
  { value: 'top_rated', label: 'Melhor avaliados' },
  { value: 'featured', label: 'Destaques' },
]
// a cada tantos pares, um card grande quebra a grade (posições 5, 14, 23...)
const isFeatureSlot = (i) => i % 9 === 4

const finalPrice = (p) => {
  const d = Math.min(Math.max(Number(p.discount_percentage || 0), 0), 90)
  return Number(p.price) * (1 - d / 100)
}

// Filtro no próprio navegador, só para as amostras (o backend filtra os reais).
function filterSamples({ brand, size, minPrice, maxPrice, sort }) {
  let list = GRID_SAMPLES.filter((p) => {
    if (brand && !sameBrand(p.brand_name, brand.name)) return false
    if (size && !parseSizes(p.sizes).includes(size)) return false
    if (minPrice && finalPrice(p) < Number(minPrice)) return false
    if (maxPrice && finalPrice(p) > Number(maxPrice)) return false
    return true
  })
  if (sort === 'price_asc') list = [...list].sort((a, b) => finalPrice(a) - finalPrice(b))
  if (sort === 'price_desc') list = [...list].sort((a, b) => finalPrice(b) - finalPrice(a))
  if (sort === 'newest') list = [...list].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
  return list
}

export default function Shop({ onProductClick, brands, brand, onBrand, onStatus }) {
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(true)
  const [samples, setSamples] = useState(false)
  const [category, setCategory] = useState(null)
  const [sort, setSort] = useState('')
  const [size, setSize] = useState('')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const loaderRef = useRef(null)
  const lastFilters = useRef(null)
  const catalog = useRef('unknown') // 'unknown' | 'real' | 'samples'

  // No celular a barra fica numa linha só (marcas + botão de filtro) e
  // "Tamanho e preço" abre numa folha que sobe da base, com a ordenação junto.
  const phone = useMedia(MQ.phone)
  const sheetOpen = phone && filtersOpen
  const closeFilters = useCallback(() => setFiltersOpen(false), [])
  const sheetDrag = useDragControls()
  useScrollLock(sheetOpen)
  useBackToClose(sheetOpen, closeFilters)
  useEffect(() => {
    if (!sheetOpen) return undefined
    const onKey = (e) => { if (e.key === 'Escape') closeFilters() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheetOpen, closeFilters])

  const filters = useMemo(
    () => ({ brand, category, sort, size, minPrice, maxPrice }),
    [brand, category, sort, size, minPrice, maxPrice],
  )
  const hasFilters = Boolean(brand || category || sort || size || minPrice || maxPrice)
  const extraFilters = [size, minPrice, maxPrice].filter(Boolean).length

  useEffect(() => {
    cachedGet('/categories', { ttl: TTL.config, persist: true })
      .then((data) => Array.isArray(data) && setCategories(data))
      .catch(() => {})
  }, [])

  useEffect(() => {
    onStatus?.({ samples, count: products.length })
  }, [samples, products.length, onStatus])

  useEffect(() => {
    // filtro novo sempre recomeça da página 1
    if (lastFilters.current && lastFilters.current !== filters && page !== 1) {
      lastFilters.current = filters
      setPage(1)
      return undefined
    }
    lastFilters.current = filters
    let alive = true

    const showSamples = () => {
      setSamples(true)
      setProducts(filterSamples(filters))
      setHasMore(false)
    }

    const load = async () => {
      if (catalog.current === 'samples') {
        showSamples()
        setLoading(false)
        return
      }
      // marca da lista da loja que não existe no backend: não há o que pedir
      if (catalog.current === 'real' && brand && !brand.id) {
        setProducts([])
        setHasMore(false)
        setLoading(false)
        return
      }
      setLoading(true)
      try {
        const params = { page, limit: 20 }
        if (brand?.id) params.brand_id = brand.id
        if (category) params.category_id = category
        if (sort) params.sort = sort
        if (minPrice) params.min_price = minPrice
        if (maxPrice) params.max_price = maxPrice
        if (size) params.size = size
        const data = await cachedGet('/products', { params, ttl: TTL.list })
        const items = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : []
        if (!alive) return
        // só a primeira carga sem filtro decide se a loja já tem catálogo
        if (catalog.current === 'unknown' && page === 1 && !hasFilters) {
          catalog.current = items.length ? 'real' : 'samples'
          if (!items.length) {
            showSamples()
            return
          }
        }
        setSamples(false)
        setProducts((prev) => (page === 1 ? items : [...prev, ...items]))
        setHasMore(page < (data?.pages || 1))
      } catch {
        if (!alive) return
        if (catalog.current === 'unknown' && page === 1) {
          catalog.current = 'samples' // API fora do ar logo de cara
          showSamples()
        }
        setHasMore(false) // falha no meio da rolagem: mantém o que já está na tela
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => {
      alive = false
    }
  }, [page, filters]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = loaderRef.current
    if (!el || samples) return undefined
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) setPage((p) => p + 1)
      },
      { rootMargin: '600px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [hasMore, loading, samples])

  const clear = () => {
    onBrand(null)
    setCategory(null)
    setSort('')
    setSize('')
    setMinPrice('')
    setMaxPrice('')
  }

  const heading = brand ? brand.name : 'Todos os pares'
  const phoneFilters = extraFilters + (sort ? 1 : 0)
  const badgeCount = phone ? phoneFilters : extraFilters
  const doneLabel = loading
    ? 'Buscando os pares…'
    : products.length === 0
      ? 'Ver a vitrine'
      : products.length === 1
        ? 'Ver o par'
        : `Ver os ${products.length}${hasMore ? '+' : ''} pares`

  // tamanho e preço: os mesmos campos na faixa (computador) e na folha
  const filterFields = (
    <>
      <fieldset className={styles.group}>
        <legend>Tamanho</legend>
        <div className={styles.sizes}>
          {SIZES.map((s) => (
            <button
              key={s}
              type="button"
              className={`${styles.size} ${size === s ? styles.sizeOn : ''}`}
              aria-pressed={size === s}
              onClick={() => setSize(size === s ? '' : s)}
            >
              {s}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className={styles.group}>
        <legend>Preço</legend>
        <div className={styles.range}>
          <input type="number" inputMode="numeric" min="0" placeholder="De R$" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} aria-label="Preço mínimo" enterKeyHint="next" />
          <span aria-hidden="true" />
          <input type="number" inputMode="numeric" min="0" placeholder="Até R$" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} aria-label="Preço máximo" enterKeyHint="done" />
        </div>
      </fieldset>
    </>
  )

  return (
    <section className={styles.shop} aria-labelledby="shop-title">
      {/* barra de filtros: gruda embaixo do header enquanto a grade passa */}
      <div className={styles.bar}>
        <div className={styles.barInner}>
          <div className={styles.brands} role="group" aria-label="Marcas">
            <button type="button" className={`${styles.pill} ${!brand ? styles.pillOn : ''}`} aria-pressed={!brand} onClick={() => onBrand(null)}>
              Todas
            </button>
            {brands.map((b) => (
              <button
                key={b.name}
                type="button"
                className={`${styles.pill} ${brand?.name === b.name ? styles.pillOn : ''}`}
                aria-pressed={brand?.name === b.name}
                onClick={() => onBrand(brand?.name === b.name ? null : b)}
              >
                {b.name}
              </button>
            ))}
          </div>

          <div className={styles.tools}>
            <button
              type="button"
              className={`${styles.toggle} ${filtersOpen ? styles.toggleOn : ''}`}
              onClick={() => setFiltersOpen((o) => !o)}
              aria-expanded={filtersOpen}
              aria-controls={phone ? 'shop-filters-sheet' : 'shop-filters'}
              aria-label={phone ? 'Filtros e ordem' : undefined}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
                <circle cx="16" cy="7" r="2" />
                <circle cx="10" cy="17" r="2" />
              </svg>
              <span className={styles.toggleText}>Tamanho e preço</span>
              {badgeCount > 0 && <span className={styles.badge}>{badgeCount}</span>}
            </button>
            <label className={styles.sort}>
              <span className="pz-visually-hidden">Ordenar por</span>
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 10l5 5 5-5" />
              </svg>
            </label>
          </div>
        </div>

        {!phone && (
          <div id="shop-filters" className={`${styles.panel} ${filtersOpen ? styles.panelOpen : ''}`}>
            <div className={styles.panelInner}>
              {filterFields}
              {hasFilters && (
                <button type="button" className={styles.clear} onClick={clear}>
                  Limpar filtros
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* folha de filtros do celular: vai para o <body>, porque o vidro da
          barra prenderia um position: fixed dentro dela */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {sheetOpen && (
              <motion.div
                key="filtros"
                className={styles.sheetOverlay}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: EASE }}
                onClick={closeFilters}
                data-lenis-prevent
              >
                <motion.div
                  id="shop-filters-sheet"
                  className={styles.sheet}
                  role="dialog"
                  aria-modal="true"
                  aria-label="Filtros da vitrine"
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ duration: 0.36, ease: EASE }}
                  onClick={(e) => e.stopPropagation()}
                  drag="y"
                  dragListener={false}
                  dragControls={sheetDrag}
                  dragConstraints={{ top: 0, bottom: 0 }}
                  dragElastic={{ top: 0, bottom: 0.7 }}
                  dragSnapToOrigin
                  onDragEnd={(_, info) => {
                    if (info.offset.y > 90 || info.velocity.y > 600) closeFilters()
                  }}
                >
                  <div className="pz-grab" onPointerDown={(e) => sheetDrag.start(e)} aria-hidden="true" />
                  <div className={styles.sheetHead}>
                    <h3 className={styles.sheetTitle}>Filtros</h3>
                    {hasFilters && (
                      <button type="button" className={styles.sheetClear} onClick={clear}>
                        Limpar
                      </button>
                    )}
                  </div>
                  <div className={styles.sheetBody}>
                    <fieldset className={styles.group}>
                      <legend>Ordenar por</legend>
                      <div className={styles.sizes}>
                        {SORT_OPTIONS.map((o) => (
                          <button
                            key={o.value || 'relevancia'}
                            type="button"
                            className={`${styles.size} ${styles.sortPill} ${sort === o.value ? styles.sizeOn : ''}`}
                            aria-pressed={sort === o.value}
                            onClick={() => setSort(o.value)}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                    {filterFields}
                  </div>
                  <div className={styles.sheetFoot}>
                    <button type="button" className={`pz-btn ${styles.sheetDone}`} onClick={closeFilters}>
                      {doneLabel}
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}

      <div className={styles.body}>
        <header className={styles.head}>
          <h2 id="shop-title" className={styles.title}>
            <span className={styles.titleText}>{heading}</span>
            {!loading && products.length > 0 && (
              <sup className={styles.count} aria-label={`${products.length} pares`}>
                {String(products.length).padStart(2, '0')}
              </sup>
            )}
          </h2>
          {samples && (
            <p className={styles.note}>
              <span className={styles.noteTag}>amostra</span>
              Os pares desta vitrine são exemplares. O catálogo de verdade entra em breve.
            </p>
          )}
        </header>

        {!samples && categories.length > 0 && (
          <div className={styles.cats} role="group" aria-label="Categorias">
            {[{ id: null, name: 'Todas as categorias' }, ...categories].map((c) => (
              <button
                key={c.id ?? 'all'}
                type="button"
                className={`${styles.cat} ${category === c.id ? styles.catOn : ''}`}
                aria-pressed={category === c.id}
                onClick={() => setCategory(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        {loading && page === 1 ? (
          <SkeletonGrid count={8} />
        ) : products.length > 0 ? (
          <div className={styles.grid}>
            {products.map((p, i) => (
              <div key={`${p.id}-${i}`} className={isFeatureSlot(i) ? styles.featureCell : styles.cell}>
                <ProductCard product={p} index={i % 20} onClick={onProductClick} feature={isFeatureSlot(i)} />
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>
            {brand && (samples || !brand.id) ? (
              <>
                <p className={styles.emptyTitle}>Os pares da {brand.name} chegam com o catálogo de verdade.</p>
                <p className={styles.emptySub}>Enquanto isso, veja os exemplares que já estão na vitrine.</p>
                <button type="button" className="pz-btn-ghost" onClick={() => onBrand(null)}>
                  Ver todos os pares
                </button>
              </>
            ) : (
              <>
                <p className={styles.emptyTitle}>Nenhum tênis com esses filtros.</p>
                <p className={styles.emptySub}>Tire um tamanho ou abra a faixa de preço para ver mais pares.</p>
                {hasFilters && (
                  <button type="button" className="pz-btn-ghost" onClick={clear}>
                    Limpar filtros
                  </button>
                )}
              </>
            )}
          </div>
        )}

        <div ref={loaderRef} className={styles.loader} aria-hidden="true">
          {loading && page > 1 && <span className={styles.spinner} />}
        </div>
      </div>
    </section>
  )
}
