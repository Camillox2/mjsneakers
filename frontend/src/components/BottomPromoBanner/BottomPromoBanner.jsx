import { useState, useEffect } from 'react'
import { motion, MotionConfig } from 'framer-motion'
import { getImageUrl } from '../../utils/imageHelper'
import { scrollToEl } from '../../lib/motion'
import styles from './BottomPromoBanner.module.css'
import { cachedGet, TTL } from '../../services/cache'

const EASE = [0.22, 1, 0.36, 1]
// âncoras antigas do admin apontavam para #catalogo; a vitrine hoje é #loja
const ANCHOR_ALIAS = { catalogo: 'loja' }

export default function BottomPromoBanner({ onProductClick }) {
  const [settings, setSettings] = useState({})
  const [products, setProducts] = useState([])

  useEffect(() => {
    cachedGet('/settings', { ttl: TTL.config, persist: true }).then((data) => {
      setSettings(data || {})
      if (data.bottom_banner_product_ids) {
        try {
          const ids = JSON.parse(data.bottom_banner_product_ids)
          if (ids.length > 0) {
            cachedGet('/products', { ttl: TTL.list }).then((prodData) => {
              const list = Array.isArray(prodData?.data) ? prodData.data : Array.isArray(prodData) ? prodData : []
              const prods = list.filter(p => ids.includes(p.id))
              setProducts(prods.slice(0, 6))
            }).catch(() => {})
          }
        } catch {}
      }
    }).catch(() => {})
  }, [])

  if (settings.bottom_banner_enabled !== 'true') return null

  const title = settings.bottom_banner_title || 'Promoção especial'
  const subtitle = settings.bottom_banner_subtitle || ''
  const bgImage = settings.bottom_banner_image
  const bgColor = settings.bottom_banner_bg_color || undefined
  const btnText = settings.bottom_banner_button_text || 'Ver ofertas'
  const btnLink = settings.bottom_banner_button_link || '#loja'

  // link interno (#algo): rola até a seção pelo Lenis em vez de pular
  const onButtonClick = (e) => {
    if (!btnLink.startsWith('#')) return
    const id = btnLink.slice(1)
    const el = document.getElementById(ANCHOR_ALIAS[id] || id)
    if (!el) return
    e.preventDefault()
    scrollToEl(el)
  }

  const formatPrice = (p) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p)

  return (
    <MotionConfig reducedMotion="user">
      <section className={styles.section} aria-label={title}>
        <motion.div
          className={styles.banner}
          style={{
            backgroundImage: bgImage ? `url(${getImageUrl(bgImage, 'promo')})` : undefined,
            backgroundColor: bgColor
          }}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: EASE }}
        >
          <div className={styles.bannerOverlay}>
            <h2 className={styles.bannerTitle}>{title}</h2>
            {subtitle && <p className={styles.bannerSubtitle}>{subtitle}</p>}
            {btnText && (
              <a href={btnLink} className={`pz-btn ${styles.bannerBtn}`} onClick={onButtonClick}>{btnText}</a>
            )}
          </div>
        </motion.div>

        {products.length > 0 && (
          <ul className={styles.productsGrid}>
            {products.map((p, i) => {
              const discount = Math.min(Math.max(Number(p.discount_percentage || 0), 0), 90)
              const finalPrice = discount > 0 ? Number(p.price) * (1 - discount / 100) : Number(p.price)
              const contain = p.fit === 'contain'
              return (
                <motion.li
                  key={p.id}
                  className={styles.item}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: Math.min(i, 5) * 0.05, ease: EASE }}
                >
                  <button
                    type="button"
                    className={styles.productCard}
                    style={{ '--glow': p.glow || '#cdd1d8' }}
                    onClick={() => onProductClick && onProductClick(p)}
                  >
                    <span className={`${styles.productStage} ${contain ? styles.productStageContain : ''}`}>
                      <img className={styles.productImg} src={getImageUrl(p.image_url, p.name)} alt="" loading="lazy" decoding="async" />
                      {discount > 0 && <span className={styles.discountBadge}>-{Math.round(discount)}%</span>}
                    </span>
                    <span className={styles.productInfo}>
                      {p.brand_name && <span className={styles.productBrand}>{p.brand_name}</span>}
                      <span className={styles.productName}>{p.name}</span>
                      <span className={styles.priceRow}>
                        <span className={styles.productPrice}>{formatPrice(finalPrice)}</span>
                        {discount > 0 && <span className={styles.oldPrice}>{formatPrice(p.price)}</span>}
                      </span>
                    </span>
                  </button>
                </motion.li>
              )
            })}
          </ul>
        )}
      </section>
    </MotionConfig>
  )
}
