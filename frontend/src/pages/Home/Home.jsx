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
import { FiChevronDown, FiX, FiSliders } from 'react-icons/fi'
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

  return (
    <main>
      <BannerCarousel />
      <div className={styles.hero}>
        <div className={styles.heroBg} />
        <motion.div className={styles.heroContent} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
          <h1 className={styles.heroTitle}>MJ<span>Sneakers</span></h1>
          <p className={styles.heroSub}>Os melhores tênis do mercado</p>
        </motion.div>
      </div>

      {promo.enabled && promo.text && (
        <motion.div className={styles.promoStrip} initial={{ opacity: 0, y: -14 }} animate={{ opacity: 1, y: 0 }}>
          <div className={styles.promoInfo}>
            <span className={styles.promoTag}>{promo.tag}</span>
            <p className={styles.promoText}>{promo.text}</p>
          </div>
          {promo.buttonText && (
            <a href={promoLink} className={styles.promoButton} target={promoExternal ? '_blank' : undefined} rel={promoExternal ? 'noreferrer' : undefined}>
              {promo.buttonText}
            </a>
          )}
        </motion.div>
      )}

      <BrandFilter brands={brands} activeBrand={activeBrand} onSelect={(id) => setActiveBrand(id)} />

      {categories.length > 0 && (
        <div className={styles.categoryRow}>
          <button className={`${styles.catChip} ${!activeCategory ? styles.catChipActive : ''}`} onClick={() => setActiveCategory(null)}>Todas</button>
          {categories.map(c => (
            <button key={c.id} className={`${styles.catChip} ${activeCategory === c.id ? styles.catChipActive : ''}`} onClick={() => setActiveCategory(c.id)}>
              {c.name}
            </button>
          ))}
        </div>
      )}

      <FeaturedSection onProductClick={setSelectedProduct} />

      <div className={styles.filterBar} id="catalogo">
        <h2 className={styles.sectionTitle}>
          {activeBrand ? brands.find(b => b.id === activeBrand)?.name || 'Produtos' : 'Todos os Tênis'}
        </h2>
        <div className={styles.filterActions}>
          {hasActiveFilters && (
            <button className={styles.clearBtn} onClick={clearFilters}>
              <FiX /> Limpar filtros
            </button>
          )}
          <button className={styles.filterToggle} onClick={() => setFiltersOpen(o => !o)}>
            <FiSliders /> Filtros <FiChevronDown className={filtersOpen ? styles.chevronUp : ''} />
          </button>
          <select className={styles.sortSelect} value={sort} onChange={e => setSort(e.target.value)}>
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      <AnimatePresence>
        {filtersOpen && (
          <motion.div className={styles.filtersPanel} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}>
            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>Preço</span>
              <div className={styles.priceRange}>
                <input type="number" placeholder="Mín" value={minPrice} onChange={e => setMinPrice(e.target.value)} className={styles.priceInput} />
                <span>—</span>
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
                <motion.p className={cardStyles.noProducts} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  Nenhum produto encontrado
                </motion.p>
              )}
            </AnimatePresence>
          </div>
          <div ref={loaderRef} style={{ height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {loading && hasMore && <span style={{ color: '#666', fontSize: 13 }}>Carregando...</span>}
          </div>
        </>
      )}

      <RecentlyViewed onProductClick={setSelectedProduct} />

      <div className={styles.newsletterStrip}>
        <Newsletter variant="footer" />
      </div>

      <BottomPromoBanner onProductClick={setSelectedProduct} />

      <ProductModal product={selectedProduct} isOpen={!!selectedProduct} onClose={() => setSelectedProduct(null)} />

      <Footer />
    </main>
  )
}
