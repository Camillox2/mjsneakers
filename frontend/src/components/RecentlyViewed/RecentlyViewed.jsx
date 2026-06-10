import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { getImageUrl } from '../../utils/imageHelper'
import styles from './RecentlyViewed.module.css'

const STORAGE_KEY = 'mj_recently_viewed'
const MAX_ITEMS = 8

export function addRecentlyViewed(product) {
  try {
    const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    const filtered = existing.filter(p => p.id !== product.id)
    const updated = [{ id: product.id, name: product.name, price: product.price, discount_percentage: product.discount_percentage, image_url: product.image_url, brand_name: product.brand_name }, ...filtered].slice(0, MAX_ITEMS)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  } catch {}
}

export default function RecentlyViewed({ onProductClick }) {
  const [items, setItems] = useState([])

  useEffect(() => {
    try {
      setItems(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'))
    } catch {}
  }, [])

  if (items.length === 0) return null

  const formatPrice = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

  return (
    <section className={styles.section}>
      <h2 className={styles.title}>Vistos recentemente</h2>
      <div className={styles.row}>
        {items.map((p, i) => {
          const disc = Math.min(Math.max(Number(p.discount_percentage || 0), 0), 90)
          const finalPrice = disc > 0 ? Number(p.price) * (1 - disc / 100) : Number(p.price)
          return (
            <motion.div
              key={p.id}
              className={styles.card}
              onClick={() => onProductClick(p)}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              whileHover={{ y: -4 }}
            >
              <div className={styles.imgWrap}>
                {disc > 0 && <span className={styles.badge}>-{Math.round(disc)}%</span>}
                <img src={getImageUrl(p.image_url, p.name)} alt={p.name} className={styles.img} loading="lazy" />
              </div>
              <div className={styles.info}>
                <span className={styles.brand}>{p.brand_name}</span>
                <span className={styles.name}>{p.name}</span>
                <span className={styles.price}>{formatPrice(finalPrice)}</span>
              </div>
            </motion.div>
          )
        })}
      </div>
    </section>
  )
}
