import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import axios from 'axios'
import { FiStar } from 'react-icons/fi'
import { getImageUrl } from '../../utils/imageHelper'
import styles from './RelatedProducts.module.css'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3305/api'

export default function RelatedProducts({ productId, onProductClick }) {
  const [products, setProducts] = useState([])

  useEffect(() => {
    if (!productId) return
    axios.get(`${API}/products/${productId}/related`)
      .then(r => setProducts(r.data || []))
      .catch(() => setProducts([]))
  }, [productId])

  if (products.length === 0) return null

  const formatPrice = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

  return (
    <section className={styles.section}>
      <h3 className={styles.title}>Você também pode gostar</h3>
      <div className={styles.row}>
        {products.map((p, i) => {
          const disc = Math.min(Math.max(Number(p.discount_percentage || 0), 0), 90)
          const finalPrice = disc > 0 ? Number(p.price) * (1 - disc / 100) : Number(p.price)
          const rating = p.avg_rating ? Number(p.avg_rating).toFixed(1) : null
          return (
            <motion.div
              key={p.id}
              className={styles.card}
              onClick={() => onProductClick(p)}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
              whileHover={{ y: -4 }}
            >
              <div className={styles.imgWrap}>
                {disc > 0 && <span className={styles.badge}>-{Math.round(disc)}%</span>}
                <img src={getImageUrl(p.image_url, p.name)} alt={p.name} className={styles.img} loading="lazy" />
              </div>
              <div className={styles.info}>
                <span className={styles.brand}>{p.brand_name}</span>
                <span className={styles.name}>{p.name}</span>
                <div className={styles.bottom}>
                  <span className={styles.price}>{formatPrice(finalPrice)}</span>
                  {rating && (
                    <span className={styles.rating}>
                      <FiStar className={styles.star} />
                      {rating}
                    </span>
                  )}
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>
    </section>
  )
}
