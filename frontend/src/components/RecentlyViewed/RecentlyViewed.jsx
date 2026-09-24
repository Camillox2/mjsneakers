import { useEffect, useState } from 'react'
import { getImageUrl } from '../../utils/imageHelper'
import styles from './RecentlyViewed.module.css'

const STORAGE_KEY = 'mj_recently_viewed'
const MAX_ITEMS = 8

// Guarda um resumo do produto (sem as fotos extras, que podem ser base64
// grandes). fit/glow/spin/sample deixam o card e a janela do produto iguais
// aos da vitrine quando a pessoa volta por aqui.
export function addRecentlyViewed(product) {
  if (!product?.id) return
  try {
    const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    const filtered = existing.filter(p => p.id !== product.id)
    const snapshot = {
      id: product.id,
      name: product.name,
      price: product.price,
      discount_percentage: product.discount_percentage,
      image_url: product.image_url,
      brand_name: product.brand_name,
      sizes: product.sizes,
      stock: product.stock,
      sample: product.sample || undefined,
      fit: product.fit,
      glow: product.glow,
      spin: product.spin,
    }
    const updated = [snapshot, ...filtered].slice(0, MAX_ITEMS)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  } catch {}
}

export default function RecentlyViewed({ onProductClick }) {
  const [items, setItems] = useState([])

  useEffect(() => {
    try {
      const list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
      setItems(Array.isArray(list) ? list : [])
    } catch {}
  }, [])

  if (items.length === 0) return null

  const formatPrice = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

  return (
    <section className={styles.section} aria-labelledby="vistos-titulo">
      <h2 id="vistos-titulo" className={styles.title}>Vistos recentemente</h2>
      <ul className={styles.row}>
        {items.map((p) => {
          const disc = Math.min(Math.max(Number(p.discount_percentage || 0), 0), 90)
          const finalPrice = disc > 0 ? Number(p.price) * (1 - disc / 100) : Number(p.price)
          const contain = p.fit === 'contain'
          return (
            <li key={p.id} className={styles.item}>
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
                  <span className={styles.price}>{formatPrice(finalPrice)}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
