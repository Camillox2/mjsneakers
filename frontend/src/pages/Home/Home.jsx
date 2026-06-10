import { useState, useEffect, useContext } from 'react'
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
import cardStyles from '../../components/ProductCard/ProductCard.module.css'
import styles from './Home.module.css'

export default function Home() {
  const [products, setProducts] = useState([])
  const [brands, setBrands] = useState([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [promo, setPromo] = useState({
    enabled: false,
    tag: '',
    text: '',
    buttonText: '',
    buttonLink: '',
  })
  const [activeBrand, setActiveBrand] = useState(null)
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [loading, setLoading] = useState(true)
  const { searchProduct, setSearchProduct } = useContext(SearchContext)

  useEffect(() => {
    if (searchProduct) {
      setSelectedProduct(searchProduct)
      setSearchProduct(null)
    }
  }, [searchProduct, setSearchProduct])

  useEffect(() => {
    loadBrands()
    loadProducts()
    loadPromo()
  }, [])

  useEffect(() => {
    loadProducts()
  }, [activeBrand, page])

  const loadBrands = async () => {
    try {
      const { data } = await api.get('/brands')
      setBrands(data)
    } catch (error) {
      console.error('Error loading brands:', error)
    }
  }

  const loadProducts = async () => {
    try {
      setLoading(true)
      const params = { page, limit: 20 }
      if (activeBrand) params.brand_id = activeBrand
      const { data } = await api.get('/products', { params })
      const items = data.data || data
      setProducts(Array.isArray(items) ? items : [])
      if (data.pages) setTotalPages(data.pages)
    } catch (error) {
      console.error('Error loading products:', error)
    } finally {
      setLoading(false)
    }
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
    } catch {
      setPromo(prev => ({ ...prev, enabled: false }))
    }
  }

  const promoLink = promo.buttonLink || '#catalogo'
  const promoExternal = promoLink.startsWith('http')

  return (
    <main>
      {/* Banner Carousel */}
      <BannerCarousel />

      {/* Hero */}
      <div className={styles.hero}>
        <div className={styles.heroBg} />
        <motion.div
          className={styles.heroContent}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
        >
          <h1 className={styles.heroTitle}>
            MJ<span>Sneakers</span>
          </h1>
          <p className={styles.heroSub}>Os melhores tênis do mercado</p>
        </motion.div>
      </div>

      {promo.enabled && promo.text && (
        <motion.div
          className={styles.promoStrip}
          initial={{ opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className={styles.promoInfo}>
            <span className={styles.promoTag}>{promo.tag}</span>
            <p className={styles.promoText}>{promo.text}</p>
          </div>
          {promo.buttonText && (
            <a
              href={promoLink}
              className={styles.promoButton}
              target={promoExternal ? '_blank' : undefined}
              rel={promoExternal ? 'noreferrer' : undefined}
            >
              {promo.buttonText}
            </a>
          )}
        </motion.div>
      )}

      {/* Filtros por Marca */}
      <BrandFilter
        brands={brands}
        activeBrand={activeBrand}
        onSelect={(id) => { setActiveBrand(id); setPage(1) }}
      />

      {/* Destaques */}
      <FeaturedSection onProductClick={setSelectedProduct} />

      {/* Produtos */}
      <h2 className={styles.sectionTitle} id="catalogo">
        {activeBrand
          ? brands.find(b => b.id === activeBrand)?.name || 'Produtos'
          : 'Todos os Tênis'}
      </h2>

      {loading ? (
        <SkeletonGrid count={8} />
      ) : (
        <div className={cardStyles.grid}>
          <AnimatePresence mode="popLayout">
            {products.length > 0 ? (
              products.map((product, index) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  index={index}
                  onClick={setSelectedProduct}
                />
              ))
            ) : (
              <motion.p
                className={cardStyles.noProducts}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                Nenhum produto encontrado
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Paginação */}
      {totalPages > 1 && (
        <div className={styles.pagination}>
          <button className={styles.pageBtn} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</button>
          <span className={styles.pageInfo}>{page} / {totalPages}</span>
          <button className={styles.pageBtn} disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Próxima</button>
        </div>
      )}

      {/* Banner Promocional Rodapé */}
      <BottomPromoBanner onProductClick={setSelectedProduct} />

      {/* Modal do Produto */}
      <ProductModal
        product={selectedProduct}
        isOpen={!!selectedProduct}
        onClose={() => setSelectedProduct(null)}
      />

      {/* Footer */}
      <Footer />
    </main>
  )
}
