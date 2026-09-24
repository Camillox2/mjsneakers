import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { FiStar } from 'react-icons/fi'
import { GRID_SAMPLES } from '../../data/drops'
import { getImageUrl } from '../../utils/imageHelper'
import styles from './RelatedProducts.module.css'
import { cachedGet, TTL } from '../../services/cache'

const EASE = [0.22, 1, 0.36, 1]
const formatPrice = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

// Exemplar de amostra não existe no backend: os "relacionados" são as
// outras amostras, sem chamar a API.
const isSampleId = (id) => String(id ?? '').startsWith('amostra-')

export default function RelatedProducts({ productId, onProductClick }) {
  const [products, setProducts] = useState([])

  useEffect(() => {
    if (!productId) return
    if (isSampleId(productId)) {
      setProducts(GRID_SAMPLES.filter(p => p.id !== productId))
      return
    }
    let alive = true
    cachedGet(`/products/${productId}/related`, { ttl: TTL.item })
      .then(data => { if (alive) setProducts(Array.isArray(data) ? data : []) })
      .catch(() => { if (alive) setProducts([]) })
    return () => { alive = false }
  }, [productId])

  if (products.length === 0) return null

  return (
    <section className={styles.section} aria-labelledby="relacionados-titulo">
      <h2 id="relacionados-titulo" className={styles.title}>
        {isSampleId(productId) ? 'Outras amostras' : 'Você também pode gostar'}
      </h2>
      <ul className={styles.row}>
        {products.map((p, i) => {
          const disc = Math.min(Math.max(Number(p.discount_percentage || 0), 0), 90)
          const finalPrice = disc > 0 ? Number(p.price) * (1 - disc / 100) : Number(p.price)
          const rating = Number(p.avg_rating) > 0 ? Number(p.avg_rating).toFixed(1) : null
          const contain = p.fit === 'contain'
          return (
            <motion.li
              key={p.id}
              className={styles.item}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: Math.min(i, 5) * 0.05, ease: EASE }}
            >
              <button
                type="button"
                className={styles.card}
                style={{ '--glow': p.glow || '#cdd1d8' }}
                onClick={() => onProductClick(p)}
              >
                <span className={`${styles.imgWrap} ${contain ? styles.imgContain : ''}`}>
                  {disc > 0 && <span className={styles.badge}>-{Math.round(disc)}%</span>}
                  <img src={getImageUrl(p.image_url, p.name)} alt="" className={styles.img} loading="lazy" decoding="async" />
                </span>
                <span className={styles.info}>
                  {p.brand_name && <span className={styles.brand}>{p.brand_name}</span>}
                  <span className={styles.name}>{p.name}</span>
                  <span className={styles.bottom}>
                    <span className={styles.price}>{formatPrice(finalPrice)}</span>
                    {rating && (
                      <span className={styles.rating}>
                        <FiStar className={styles.star} aria-hidden="true" />
                        <span className="pz-visually-hidden">Nota </span>
                        {rating}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            </motion.li>
          )
        })}
      </ul>
    </section>
  )
}
