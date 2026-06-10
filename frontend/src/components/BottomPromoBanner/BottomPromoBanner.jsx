import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import api from '../../services/api'
import { getImageUrl } from '../../utils/imageHelper'
import styles from './BottomPromoBanner.module.css'

export default function BottomPromoBanner({ onProductClick }) {
  const [settings, setSettings] = useState({})
  const [products, setProducts] = useState([])

  useEffect(() => {
    api.get('/settings').then(({ data }) => {
      setSettings(data)
      if (data.bottom_banner_product_ids) {
        try {
          const ids = JSON.parse(data.bottom_banner_product_ids)
          if (ids.length > 0) {
            api.get('/products').then(({ data: prodData }) => {
              const prods = (prodData.data || prodData).filter(p => ids.includes(p.id))
              setProducts(prods.slice(0, 6))
            }).catch(() => {})
          }
        } catch {}
      }
    }).catch(() => {})
  }, [])

  if (settings.bottom_banner_enabled !== 'true') return null

  const title = settings.bottom_banner_title || 'Promoção Especial'
  const subtitle = settings.bottom_banner_subtitle || ''
  const bgImage = settings.bottom_banner_image
  const bgColor = settings.bottom_banner_bg_color || '#1a1a1a'
  const btnText = settings.bottom_banner_button_text || 'Ver ofertas'
  const btnLink = settings.bottom_banner_button_link || '#catalogo'

  const formatPrice = (p) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p)

  return (
    <section className={styles.section}>
      <motion.div
        className={styles.banner}
        style={{
          backgroundImage: bgImage ? `url(${getImageUrl(bgImage, 'promo')})` : undefined,
          backgroundColor: bgColor
        }}
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
      >
        <div className={styles.bannerOverlay}>
          <h2 className={styles.bannerTitle}>{title}</h2>
          {subtitle && <p className={styles.bannerSubtitle}>{subtitle}</p>}
          {btnText && (
            <a href={btnLink} className={styles.bannerBtn}>{btnText}</a>
          )}
        </div>
      </motion.div>

      {products.length > 0 && (
        <div className={styles.productsGrid}>
          {products.map((p, i) => {
            const discount = Math.min(Math.max(Number(p.discount_percentage || 0), 0), 90)
            const finalPrice = discount > 0 ? Number(p.price) * (1 - discount / 100) : Number(p.price)
            return (
              <motion.div
                key={p.id}
                className={styles.productCard}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                onClick={() => onProductClick && onProductClick(p)}
              >
                <img className={styles.productImg} src={getImageUrl(p.image_url, p.name)} alt={p.name} loading="lazy" />
                <div className={styles.productInfo}>
                  <span className={styles.productBrand}>{p.brand_name}</span>
                  <span className={styles.productName}>{p.name}</span>
                  {discount > 0 && <span className={styles.oldPrice}>{formatPrice(p.price)}</span>}
                  <span className={styles.productPrice}>{formatPrice(finalPrice)}</span>
                </div>
                {discount > 0 && <div className={styles.discountBadge}>-{Math.round(discount)}%</div>}
              </motion.div>
            )
          })}
        </div>
      )}
    </section>
  )
}
