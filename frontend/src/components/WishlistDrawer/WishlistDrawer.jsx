import { useEffect, useRef } from 'react'
import { motion, AnimatePresence, MotionConfig } from 'framer-motion'
import { FiHeart, FiX, FiTrash2, FiShoppingBag } from 'react-icons/fi'
import { getImageUrl } from '../../utils/imageHelper'
import { lockScroll } from '../../lib/motion'
import styles from './WishlistDrawer.module.css'

const EASE = [0.22, 1, 0.36, 1]

export default function WishlistDrawer({ isOpen, onClose, items, onRemove, onAddToCart, onProductClick }) {
  const formatPrice = (p) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p)

  // onClose chega como função nova a cada render do App; a ref evita
  // destravar e travar a rolagem de novo a cada render.
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  // Esc fecha; a página atrás fica parada enquanto a gaveta está aberta
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e) => { if (e.key === 'Escape') closeRef.current?.() }
    window.addEventListener('keydown', onKey)
    lockScroll(true)
    return () => {
      window.removeEventListener('keydown', onKey)
      lockScroll(false)
    }
  }, [isOpen])

  const open = (item) => {
    onProductClick && onProductClick(item)
    onClose()
  }

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              className={styles.overlay}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: EASE }}
              onClick={onClose}
            />
            <motion.aside
              className={styles.drawer}
              role="dialog"
              aria-modal="true"
              aria-labelledby="favoritos-titulo"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.45, ease: EASE }}
            >
              <div className={styles.header}>
                <div className={styles.headerLeft}>
                  <h2 id="favoritos-titulo">Favoritos</h2>
                  {items.length > 0 && <span className={styles.count}>{items.length}</span>}
                </div>
                <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Fechar favoritos">
                  <FiX aria-hidden="true" />
                </button>
              </div>

              {items.length === 0 ? (
                <div className={styles.empty}>
                  <span className={styles.emptyIcon} aria-hidden="true"><FiHeart /></span>
                  <p>Nenhum favorito ainda</p>
                  <span>Toque no coração de um tênis para guardar ele aqui.</span>
                  <button type="button" className="pz-btn-ghost" onClick={onClose}>Ver a loja</button>
                </div>
              ) : (
                <ul className={styles.list} data-lenis-prevent>
                  {items.map(item => {
                    const discount = Math.min(Math.max(Number(item.discount_percentage || 0), 0), 90)
                    const finalPrice = discount > 0 ? Number(item.price) * (1 - discount / 100) : Number(item.price)
                    const contain = item.fit === 'contain'

                    return (
                      <li key={item.id} className={styles.item}>
                        <button
                          type="button"
                          className={`${styles.thumb} ${contain ? styles.thumbContain : ''}`}
                          style={{ '--glow': item.glow || '#cdd1d8' }}
                          onClick={() => open(item)}
                          tabIndex={-1}
                          aria-hidden="true"
                        >
                          <img className={styles.image} src={getImageUrl(item.image_url, item.name)} alt="" loading="lazy" />
                        </button>
                        <div className={styles.info}>
                          {item.brand_name && <span className={styles.brand}>{item.brand_name}</span>}
                          <button type="button" className={styles.name} onClick={() => open(item)}>
                            {item.name}
                          </button>
                          <div className={styles.priceRow}>
                            <span className={styles.price}>{formatPrice(finalPrice)}</span>
                            {discount > 0 && <span className={styles.oldPrice}>{formatPrice(item.price)}</span>}
                          </div>
                          {item.stock === 0 && <span className={styles.outOfStock}>Esgotado</span>}
                        </div>
                        <div className={styles.actions}>
                          {item.stock > 0 && (
                            <button
                              type="button"
                              className={`${styles.iconBtn} ${styles.cartBtn}`}
                              onClick={() => onAddToCart && onAddToCart(item)}
                              aria-label={`Colocar ${item.name} na sacola`}
                            >
                              <FiShoppingBag aria-hidden="true" />
                            </button>
                          )}
                          <button
                            type="button"
                            className={`${styles.iconBtn} ${styles.removeBtn}`}
                            onClick={() => onRemove && onRemove(item.id)}
                            aria-label={`Tirar ${item.name} dos favoritos`}
                          >
                            <FiTrash2 aria-hidden="true" />
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </MotionConfig>
  )
}
