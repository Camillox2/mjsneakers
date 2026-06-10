import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import api from '../../services/api'
import { getImageUrl } from '../../utils/imageHelper'
import styles from './FeaturedSection.module.css'

export default function FeaturedSection({ onProductClick }) {
  const [featured, setFeatured] = useState([])

  useEffect(() => {
    api.get('/products/featured')
      .then(({ data }) => setFeatured(data))
      .catch(() => {})
  }, [])

  if (featured.length === 0) return null

  const formatPrice = (p) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p)

  return (
    <section className={styles.section}>
      <h2 className={styles.title}>Em Destaque</h2>
      <div className={styles.grid}>
        {featured.map((p, i) => {
          const discount = Math.min(Math.max(Number(p.discount_percentage || 0), 0), 90)
          const finalPrice = discount > 0 ? Number(p.price) * (1 - discount / 100) : Number(p.price)
          const isHero = i < 2

          return (
            <motion.div
              key={p.id}
              className={`${styles.card} ${isHero ? styles.cardHero : ''}`}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              onClick={() => onProductClick && onProductClick(p)}
            >
              <div className={styles.badge}>DESTAQUE</div>
              {discount > 0 && <div className={styles.discountBadge}>-{Math.round(discount)}%</div>}
              <img className={styles.image} src={getImageUrl(p.image_url, p.name)} alt={p.name} loading="lazy" />
              <div className={styles.info}>
                <span className={styles.brand}>{p.brand_name}</span>
                <span className={styles.name}>{p.name}</span>
                <div className={styles.priceRow}>
                  {discount > 0 && <span className={styles.oldPrice}>{formatPrice(p.price)}</span>}
                  <span className={styles.price}>{formatPrice(finalPrice)}</span>
                </div>
                {p.stock <= 3 && p.stock > 0 && <span className={styles.lowStock}>Últimas {p.stock} un.!</span>}
                {p.stock === 0 && <span className={styles.outOfStock}>Esgotado</span>}
              </div>
            </motion.div>
          )
        })}
      </div>
    </section>
  )
}
