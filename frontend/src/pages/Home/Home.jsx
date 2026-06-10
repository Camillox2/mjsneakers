import { useState, useEffect, useContext, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import api from '../../services/api'
import { SearchContext } from '../../App'
import BannerCarousel from '../../components/BannerCarousel/BannerCarousel'
import BrandFilter from '../../components/BrandFilter/BrandFilter'
import ProductCard from '../../components/ProductCard/ProductCard'
import ProductModal from '../../components/ProductModal/ProductModal'
import SkeletonGrid from '../../components/Skeleton/Skeleton'
import Footer from '../../components/Footer/Footer'
import FeaturedSection from '../../components/FeaturedSection/FeaturedSection'
import BottomPromoBanner from '../../components/BottomPromoBanner/BottomPromoBanner'
import RecentlyViewed from '../../components/RecentlyViewed/RecentlyViewed'
import Newsletter from '../../components/Newsletter/Newsletter'
import { FiChevronDown, FiX, FiSliders, FiArrowRight, FiTruck, FiShield, FiRefreshCw, FiZap } from 'react-icons/fi'
import cardStyles from '../../components/ProductCard/ProductCard.module.css'
import styles from './Home.module.css'

const SIZES = ['36','37','38','39','40','41','42','43','44','45','46']
const SORT_OPTIONS = [
  { value: '', label: 'Relevância' },
  { value: 'featured', label: 'Destaques' },
  { value: 'newest', label: 'Mais recentes' },
  { value: 'price_asc', label: 'Menor preço' },
  { value: 'price_desc', label: 'Maior preço' },
  { value: 'best_sellers', label: 'Mais vendidos' },
  { value: 'top_rated', label: 'Melhor avaliados' },
]

const TRUST = [
  { icon: FiTruck, title: 'Frete Grátis', sub: 'Acima de R$ 299' },
  { icon: FiShield, title: '100% Original', sub: 'Garantia total' },
  { icon: FiRefreshCw, title: 'Troca Fácil', sub: 'Até 30 dias' },
  { icon: FiZap, title: 'Envio Rápido', sub: 'Em até 24h' },
]

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } },
}
const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
}

export default function Home() {
  const [products, setProducts] = useState([])
  const [brands, setBrands] = useState([])
  const [categories, setCategories] = useState([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [promo, setPromo] = useState({ enabled: false, tag: '', text: '', buttonText: '', buttonLink: '' })
  const [activeBrand, setActiveBrand] = useState(null)
  const [activeCategory, setActiveCategory] = useState(null)
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sort, setSort] = useState('')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [activeSize, setActiveSize] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const loaderRef = useRef(null)
  const { searchProduct, setSearchProduct } = useContext(SearchContext)

  useEffect(() => {
    if (searchProduct) { setSelectedProduct(searchProduct); setSearchProduct(null) }
  }, [searchProduct, setSearchProduct])

  useEffect(() => {
    loadBrands(); loadCategories(); loadPromo()
  }, [])

  useEffect(() => {
    setProducts([]); setPage(1); setHasMore(true)
  }, [activeBrand, activeCategory, sort, minPrice, maxPrice, activeSize])

  useEffect(() => {
    loadProducts(page, page === 1)
  }, [page, activeBrand, activeCategory, sort, minPrice, maxPrice, activeSize])

  useEffect(() => {
    const el = loaderRef.current
    if (!el) return
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !loading) setPage(p => p + 1)
    }, { threshold: 0.1 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, loading])

  const loadBrands = async () => {
    try { const { data } = await api.get('/brands'); setBrands(data) } catch {}
  }
  const loadCategories = async () => {
    try { const { data } = await api.get('/categories'); setCategories(data) } catch {}
  }
  const loadProducts = async (currentPage, reset = false) => {
    try {
      setLoading(true)
      const params = { page: currentPage, limit: 20 }
      if (activeBrand) params.brand_id = activeBrand
      if (activeCategory) params.category_id = activeCategory
      if (sort) params.sort = sort
      if (minPrice) params.min_price = minPrice
      if (maxPrice) params.max_price = maxPrice
      if (activeSize) params.size = activeSize
      const { data } = await api.get('/products', { params })
      const items = data.data || data
      const pages = data.pages || 1
      setProducts(prev => reset ? (Array.isArray(items) ? items : []) : [...prev, ...(Array.isArray(items) ? items : [])])
      setTotalPages(pages)
      setHasMore(currentPage < pages)
    } catch {} finally { setLoading(false) }
  }
  const loadPromo = async () => {
    try {
      const { data } = await api.get('/settings')
      setPromo({
        enabled: data.home_promo_enabled === 'true',
        tag: data.home_promo_tag || 'Oferta Especial',
        text: data.home_promo_text || '',
        buttonText: data.home_promo_button_text || '',
        buttonLink: data.home_promo_button_link || '',
      })
    } catch { setPromo(prev => ({ ...prev, enabled: false })) }
  }
  const clearFilters = () => {
    setActiveBrand(null); setActiveCategory(null); setSort('')
    setMinPrice(''); setMaxPrice(''); setActiveSize('')
  }
  const hasActiveFilters = activeBrand || activeCategory || sort || minPrice || maxPrice || activeSize
  const promoLink = promo.buttonLink || '#catalogo'
  const promoExternal = promoLink.startsWith('http')
  const catalogTitle = activeBrand ? brands.find(b => b.id === activeBrand)?.name || 'Produtos' : 'Todos os Tênis'

  const renderCatChip = (id, label) => {
    const isActive = activeCategory === id
    return (
      <button
        key={id ?? 'all'}
        className={`${styles.catChip} ${isActive ? styles.catChipActive : ''}`}
        onClick={() => setActiveCategory(id)}
      >
        {isActive && (
          <motion.span
            layoutId="catPill"
            className={styles.catPill}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          />
        )}
        <span className={styles.catLabel}>{label}</span>
      </button>
    )
  }

  return (
    <main>
      <BannerCarousel />

      {/* ===== HERO ===== */}
      <section className={styles.hero}>
        <div className={styles.heroAurora} aria-hidden="true" />
        <div className={styles.heroGrid} aria-hidden="true" />
        <span className={`${styles.orb} ${styles.orb1}`} aria-hidden="true" />
        <span className={`${styles.orb} ${styles.orb2}`} aria-hidden="true" />
        <span className={`${styles.orb} ${styles.orb3}`} aria-hidden="true" />

        <motion.div className={styles.heroContent} variants={stagger} initial="hidden" animate="show">
          <motion.span className={styles.heroBadge} variants={fadeUp}>
            <span className={styles.heroBadgeDot} /> Coleção 2026 · 100% Originais
          </motion.span>
          <motion.h1 className={styles.heroTitle} variants={fadeUp}>
            MJ<span className={styles.accent}>Sneakers</span>
          </motion.h1>
          <motion.p className={styles.heroSub} variants={fadeUp}>
            Os melhores tênis do mercado
          </motion.p>
          <motion.div className={styles.heroCtas} variants={fadeUp}>
            <motion.a href="#catalogo" className={styles.heroCtaPrimary} whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}>
              Explorar Catálogo <FiArrowRight />
            </motion.a>
          </motion.div>
        </motion.div>

        <a href="#catalogo" className={styles.scrollCue} aria-label="Rolar para o catálogo">
          <span className={styles.scrollMouse}><span className={styles.scrollWheel} /></span>
        </a>
      </section>

      {/* ===== TRUST STRIP ===== */}
      <motion.div
        className={styles.trustStrip}
        variants={stagger}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.3 }}
      >
        {TRUST.map(({ icon: Icon, title, sub }) => (
          <motion.div key={title} className={styles.trustItem} variants={fadeUp}>
            <span className={styles.trustIcon}><Icon /></span>
            <div className={styles.trustText}>
              <span className={styles.trustTitle}>{title}</span>
              <span className={styles.trustSub}>{sub}</span>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {promo.enabled && promo.text && (
        <motion.div
          className={styles.promoStrip}
          initial={{ opacity: 0, y: -14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <div className={styles.promoInfo}>
            <span className={styles.promoTag}>{promo.tag}</span>
            <p className={styles.promoText}>{promo.text}</p>
          </div>
          {promo.buttonText && (
            <a href={promoLink} className={styles.promoButton} target={promoExternal ? '_blank' : undefined} rel={promoExternal ? 'noreferrer' : undefined}>
              {promo.buttonText} <FiArrowRight />
            </a>
          )}
        </motion.div>
      )}

      <BrandFilter brands={brands} activeBrand={activeBrand} onSelect={(id) => setActiveBrand(id)} />

      {categories.length > 0 && (
        <div className={styles.categoryRow}>
          {renderCatChip(null, 'Todas')}
          {categories.map(c => renderCatChip(c.id, c.name))}
        </div>
      )}

      <FeaturedSection onProductClick={setSelectedProduct} />

      {/* ===== CATALOG ===== */}
      <section className={styles.catalog} id="catalogo">
        <motion.div
          className={styles.catalogHeader}
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.4 }}
        >
          <div className={styles.titleWrap}>
            <span className={styles.titleBar} />
            <h2 className={styles.sectionTitle}>{catalogTitle}</h2>
            {!loading && products.length > 0 && (
              <motion.span
                key={products.length}
                className={styles.countPill}
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 24 }}
              >
                {products.length}
              </motion.span>
            )}
          </div>
          <div className={styles.filterActions}>
            <AnimatePresence>
              {hasActiveFilters && (
                <motion.button
                  className={styles.clearBtn}
                  onClick={clearFilters}
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                >
                  <FiX /> Limpar
                </motion.button>
              )}
            </AnimatePresence>
            <button className={`${styles.filterToggle} ${filtersOpen ? styles.filterToggleActive : ''}`} onClick={() => setFiltersOpen(o => !o)}>
              <FiSliders /> Filtros <FiChevronDown className={filtersOpen ? styles.chevronUp : ''} />
            </button>
            <div className={styles.selectWrap}>
              <select className={styles.sortSelect} value={sort} onChange={e => setSort(e.target.value)}>
                {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <FiChevronDown className={styles.selectChevron} />
            </div>
          </div>
        </motion.div>

        <AnimatePresence>
          {filtersOpen && (
            <motion.div className={styles.filtersPanel} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}>
              <div className={styles.filtersInner}>
                <div className={styles.filterGroup}>
                  <span className={styles.filterLabel}>Preço</span>
                  <div className={styles.priceRange}>
                    <input type="number" placeholder="Mín" value={minPrice} onChange={e => setMinPrice(e.target.value)} className={styles.priceInput} />
                    <span className={styles.priceDash}>—</span>
                    <input type="number" placeholder="Máx" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} className={styles.priceInput} />
                  </div>
                </div>
                <div className={styles.filterGroup}>
                  <span className={styles.filterLabel}>Tamanho</span>
                  <div className={styles.sizeRow}>
                    {SIZES.map(s => (
                      <button key={s} className={`${styles.sizeChip} ${activeSize === s ? styles.sizeChipActive : ''}`} onClick={() => setActiveSize(activeSize === s ? '' : s)}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {loading && page === 1 ? (
          <SkeletonGrid count={8} />
        ) : (
          <>
            <div className={cardStyles.grid}>
              <AnimatePresence mode="popLayout">
                {products.length > 0 ? (
                  products.map((product, index) => (
                    <ProductCard key={`${product.id}-${index}`} product={product} index={index % 20} onClick={setSelectedProduct} />
                  ))
                ) : (
                  <motion.div className={styles.empty} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                    <FiX className={styles.emptyIcon} />
                    <p className={styles.emptyTitle}>Nenhum produto encontrado</p>
                    <p className={styles.emptySub}>Tente ajustar os filtros ou limpar a busca.</p>
                    {hasActiveFilters && (
                      <button className={styles.clearBtn} onClick={clearFilters}><FiX /> Limpar filtros</button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div ref={loaderRef} className={styles.loader}>
              {loading && hasMore && <span className={styles.spinner} aria-label="Carregando" />}
            </div>
          </>
        )}
      </section>

      <RecentlyViewed onProductClick={setSelectedProduct} />

      <div className={styles.newsletterStrip}>
        <div className={styles.newsletterGlow} aria-hidden="true" />
        <Newsletter variant="footer" />
      </div>

      <BottomPromoBanner onProductClick={setSelectedProduct} />

      <ProductModal product={selectedProduct} isOpen={!!selectedProduct} onClose={() => setSelectedProduct(null)} />

      <Footer />
    </main>
  )
}
