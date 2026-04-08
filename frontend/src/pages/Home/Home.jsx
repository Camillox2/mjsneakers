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
import cardStyles from '../../components/ProductCard/ProductCard.module.css'
import styles from './Home.module.css'

export default function Home() {
  const [products, setProducts] = useState([])
  const [brands, setBrands] = useState([])
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
  }, [])

  useEffect(() => {
    loadProducts()
  }, [activeBrand])

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
      const params = activeBrand ? { brand_id: activeBrand } : {}
      const { data } = await api.get('/products', { params })
      setProducts(data)
    } catch (error) {
      console.error('Error loading products:', error)
    } finally {
      setLoading(false)
    }
  }

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

      {/* Filtros por Marca */}
      <BrandFilter
        brands={brands}
        activeBrand={activeBrand}
        onSelect={setActiveBrand}
      />

      {/* Produtos */}
      <h2 className={styles.sectionTitle}>
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
