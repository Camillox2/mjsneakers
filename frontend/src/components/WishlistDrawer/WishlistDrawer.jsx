import { motion, AnimatePresence } from 'framer-motion'
import { FiHeart, FiX, FiTrash2, FiShoppingBag } from 'react-icons/fi'
import { getImageUrl } from '../../utils/imageHelper'
import styles from './WishlistDrawer.module.css'

export default function WishlistDrawer({ isOpen, onClose, items, onRemove, onAddToCart, onProductClick }) {
  const formatPrice = (p) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p)

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className={styles.overlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className={styles.drawer}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            <div className={styles.header}>
              <div className={styles.headerLeft}>
                <FiHeart />
                <h2>Favoritos</h2>
                <span className={styles.count}>{items.length}</span>
              </div>
              <button className={styles.closeBtn} onClick={onClose}><FiX /></button>
            </div>

            {items.length === 0 ? (
              <div className={styles.empty}>
                <FiHeart size={40} />
                <p>Sua lista de favoritos está vazia</p>
                <span>Clique no coração dos produtos para adicioná-los aqui</span>
              </div>
            ) : (
              <div className={styles.list}>
                {items.map(item => {
                  const discount = Math.min(Math.max(Number(item.discount_percentage || 0), 0), 90)
                  const finalPrice = discount > 0 ? Number(item.price) * (1 - discount / 100) : Number(item.price)

                  return (
                    <div key={item.id} className={styles.item}>
                      <img
                        className={styles.image}
                        src={getImageUrl(item.image_url, item.name)}
                        alt={item.name}
                        onClick={() => { onProductClick && onProductClick(item); onClose() }}
                      />
                      <div className={styles.info}>
                        <span className={styles.brand}>{item.brand_name}</span>
                        <span className={styles.name} onClick={() => { onProductClick && onProductClick(item); onClose() }}>
                          {item.name}
                        </span>
                        <div className={styles.priceRow}>
                          {discount > 0 && <span className={styles.oldPrice}>{formatPrice(item.price)}</span>}
                          <span className={styles.price}>{formatPrice(finalPrice)}</span>
                        </div>
                        {item.stock === 0 && <span className={styles.outOfStock}>Esgotado</span>}
                      </div>
                      <div className={styles.actions}>
                        {item.stock > 0 && (
                          <button
                            className={styles.cartBtn}
                            onClick={() => onAddToCart && onAddToCart(item)}
                            title="Adicionar ao carrinho"
                          >
                            <FiShoppingBag />
                          </button>
                        )}
                        <button
                          className={styles.removeBtn}
                          onClick={() => onRemove && onRemove(item.id)}
                          title="Remover dos favoritos"
                        >
                          <FiTrash2 />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
