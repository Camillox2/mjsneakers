import { useContext, useRef } from 'react'
import { motion, useMotionValue, useTransform, useSpring } from 'framer-motion'
import { FiPlus, FiHeart, FiStar, FiShare2 } from 'react-icons/fi'
import CountdownTimer from '../CountdownTimer/CountdownTimer'
import { CartContext, WishlistContext } from '../../App'
import { getImageUrl } from '../../utils/imageHelper'
import { useToast } from '../Toast/Toast'
import styles from './ProductCard.module.css'

export default function ProductCard({ product, onClick, index }) {
  const { addToCart } = useContext(CartContext)
  const { wishlist, toggleWishlist } = useContext(WishlistContext)
  const addToast = useToast()
  const cardRef = useRef(null)

  const isWished = wishlist?.some(w => w.id === product.id)
  const stock = Number(product.stock || 0)

  const x = useMotionValue(0)
  const y = useMotionValue(0)

  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [8, -8]), { stiffness: 300, damping: 30 })
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-8, 8]), { stiffness: 300, damping: 30 })

  const handleMouseMove = (e) => {
    if (!cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    const px = (e.clientX - rect.left) / rect.width - 0.5
    const py = (e.clientY - rect.top) / rect.height - 0.5
    x.set(px)
    y.set(py)
  }

  const handleMouseLeave = () => {
    x.set(0)
    y.set(0)
  }

  const handleAdd = (e) => {
    e.stopPropagation()
    if (stock === 0) return
    const sizes = product.sizes ? product.sizes.split(',') : ['42']
    addToCart({ ...product, price: finalPrice }, sizes[0])
    if (stock <= 3) {
      addToast(`${product.name} adicionado! Apenas ${stock} unidades restantes.`, 'warning')
    } else {
      addToast(`${product.name} adicionado ao carrinho!`, 'success')
    }
  }

  const handleWishlist = (e) => {
    e.stopPropagation()
    toggleWishlist(product)
  }

  const handleShare = (e) => {
    e.stopPropagation()
    const url = `${window.location.origin}/produto/${product.id}`
    if (navigator.share) {
      navigator.share({ title: product.name, url }).catch(() => {})
    } else {
      navigator.clipboard?.writeText(url).then(() => addToast('Link copiado!', 'success'))
    }
  }

  const formatPrice = (price) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(price)
  }

  const imageUrl = getImageUrl(product.image_url, product.name)
  const rawDiscount = Number(product.discount_percentage || 0)
  const discount = Math.min(Math.max(rawDiscount, 0), 90)
  const discountActive = discount > 0
  const finalPrice = discountActive ? Number(product.price) * (1 - discount / 100) : Number(product.price)
  const discountLabel = Math.round(discount)

  const avgRating = product.avg_rating ? Number(product.avg_rating) : null
  const reviewCount = product.review_count ? Number(product.review_count) : 0
  const promoEnd = product.promo_end ? new Date(product.promo_end) : null
  const promoActive = promoEnd && promoEnd > new Date() && discountActive

  return (
    <motion.div
      className={styles.cardWrapper}
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.06 }}
    >
      <motion.div
        ref={cardRef}
        className={styles.card}
        style={{ rotateX, rotateY, transformPerspective: 800 }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={() => onClick(product)}
        whileTap={{ scale: 0.98 }}
      >
        <div className={styles.hoverOverlay} />
        <div className={styles.imageContainer}>
          {discountActive && <div className={styles.discountBadge}>-{discountLabel}%</div>}
          {stock === 0 && <div className={styles.outOfStockBadge}>Esgotado</div>}
          {stock > 0 && stock <= 3 && <div className={styles.lowStockBadge}>Últimas {stock}!</div>}
          <button
            className={`${styles.wishBtn} ${isWished ? styles.wished : ''}`}
            onClick={handleWishlist}
            title={isWished ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
          >
            <FiHeart />
          </button>
          <button className={styles.shareBtn} onClick={handleShare} title="Compartilhar">
            <FiShare2 />
          </button>
          <img
            className={styles.productImage}
            src={imageUrl}
            alt={product.name}
            loading="lazy"
          />
        </div>
        <div className={styles.overlay}>
          <span className={styles.productBrand}>{product.brand_name}</span>
          <span className={styles.productName}>{product.name}</span>
          {avgRating !== null && (
            <div className={styles.ratingRow}>
              <FiStar className={styles.starIcon} />
              <span className={styles.ratingVal}>{avgRating.toFixed(1)}</span>
              {reviewCount > 0 && <span className={styles.reviewCount}>({reviewCount})</span>}
            </div>
          )}
          {promoActive && <CountdownTimer endDate={promoEnd} compact />}
          <div className={styles.priceRow}>
            <div className={styles.priceGroup}>
              {discountActive && <span className={styles.oldPrice}>{formatPrice(product.price)}</span>}
              <span className={styles.price}>{formatPrice(finalPrice)}</span>
            </div>
            <motion.button
              className={`${styles.addBtn} ${stock === 0 ? styles.addBtnDisabled : ''}`}
              onClick={handleAdd}
              whileHover={stock > 0 ? { scale: 1.15 } : {}}
              whileTap={stock > 0 ? { scale: 0.9 } : {}}
              disabled={stock === 0}
            >
              <FiPlus />
            </motion.button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
