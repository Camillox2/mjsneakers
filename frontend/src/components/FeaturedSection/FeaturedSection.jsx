import { useState, useEffect } from 'react'
import { motion, MotionConfig } from 'framer-motion'
import { getImageUrl } from '../../utils/imageHelper'
import styles from './FeaturedSection.module.css'
import { cachedGet, TTL } from '../../services/cache'

const EASE = [0.22, 1, 0.36, 1]

export default function FeaturedSection({ onProductClick }) {
  const [featured, setFeatured] = useState([])

  useEffect(() => {
    cachedGet('/products/featured', { ttl: TTL.item })
      .then((data) => setFeatured(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  if (featured.length === 0) return null

  const formatPrice = (p) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p)

  return (
    <MotionConfig reducedMotion="user">
      <section className={styles.section} aria-labelledby="destaque-titulo">
        <h2 id="destaque-titulo" className={styles.title}>Em destaque</h2>
        <ul className={styles.grid}>
          {featured.map((p, i) => {
            const discount = Math.min(Math.max(Number(p.discount_percentage || 0), 0), 90)
            const finalPrice = discount > 0 ? Number(p.price) * (1 - discount / 100) : Number(p.price)
            const contain = p.fit === 'contain'

            return (
              <motion.li
                key={p.id}
                className={styles.item}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '0px 0px -8% 0px' }}
                transition={{ duration: 0.55, delay: (i % 4) * 0.06, ease: EASE }}
              >
                <button
                  type="button"
                  className={`${styles.card} ${p.stock === 0 ? styles.soldOut : ''}`}
                  style={{ '--glow': p.glow || '#cdd1d8' }}
                  onClick={() => onProductClick && onProductClick(p)}
                >
                  <span className={`${styles.stage} ${contain ? styles.stageContain : ''}`}>
                    <img className={styles.image} src={getImageUrl(p.image_url, p.name)} alt="" loading="lazy" decoding="async" />
                    <span className={styles.badges}>
                      {discount > 0 && <span className={styles.badgeOff}>-{Math.round(discount)}%</span>}
                      {p.stock === 0 && <span className={styles.badgeOut}>Esgotado</span>}
                      {p.stock <= 3 && p.stock > 0 && <span className={styles.badgeLow}>Últimos {p.stock}</span>}
                    </span>
                  </span>
                  <span className={styles.info}>
                    {p.brand_name && <span className={styles.brand}>{p.brand_name}</span>}
                    <span className={styles.name}>{p.name}</span>
                    <span className={styles.priceRow}>
                      <span className={styles.price}>{formatPrice(finalPrice)}</span>
                      {discount > 0 && <span className={styles.oldPrice}>{formatPrice(p.price)}</span>}
                    </span>
                  </span>
                </button>
              </motion.li>
            )
          })}
        </ul>
      </section>
    </MotionConfig>
  )
}
