import { useState, useContext, useRef, useCallback, useEffect } from 'react'
import { AnimatePresence, motion, useMotionValue, useTransform, useSpring } from 'framer-motion'
import { FiX, FiShoppingCart, FiStar, FiSend } from 'react-icons/fi'
import { CartContext } from '../../App'
import { getImageUrl } from '../../utils/imageHelper'
import { useToast } from '../Toast/Toast'
import api from '../../services/api'
import styles from './ProductModal.module.css'

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.3, ease: 'easeOut' } },
  exit: { opacity: 0, transition: { duration: 0.2, ease: 'easeIn' } }
}

const modalVariants = {
  hidden: { opacity: 0, scale: 0.92, y: 30 },
  visible: {
    opacity: 1, scale: 1, y: 0,
    transition: { type: 'spring', damping: 30, stiffness: 350, mass: 0.8 }
  },
  exit: {
    opacity: 0, scale: 0.95, y: 20,
    transition: { duration: 0.2, ease: 'easeIn' }
  }
}

export default function ProductModal({ product, isOpen, onClose }) {
  const [selectedSize, setSelectedSize] = useState(null)
  const [activeImg, setActiveImg] = useState(0)
  const [reviews, setReviews] = useState([])
  const [showReviewForm, setShowReviewForm] = useState(false)
  const [reviewForm, setReviewForm] = useState({ customer_name: '', customer_email: '', rating: 5, comment: '' })
  const [reviewMsg, setReviewMsg] = useState('')
  const { addToCart, setCartOpen } = useContext(CartContext)
  const addToast = useToast()
  const imgRef = useRef(null)

  const mx = useMotionValue(0)
  const my = useMotionValue(0)
  const imgRotateX = useSpring(useTransform(my, [-0.5, 0.5], [12, -12]), { stiffness: 200, damping: 25 })
  const imgRotateY = useSpring(useTransform(mx, [-0.5, 0.5], [-12, 12]), { stiffness: 200, damping: 25 })

  const handleImgMouseMove = useCallback((e) => {
    if (!imgRef.current) return
    const rect = imgRef.current.getBoundingClientRect()
    mx.set((e.clientX - rect.left) / rect.width - 0.5)
    my.set((e.clientY - rect.top) / rect.height - 0.5)
  }, [mx, my])

  const handleImgMouseLeave = useCallback(() => {
    mx.set(0)
    my.set(0)
  }, [mx, my])

  useEffect(() => {
    if (product?.id) {
      setActiveImg(0)
      setSelectedSize(null)
      setShowReviewForm(false)
      setReviewMsg('')
      api.get(`/reviews/product/${product.id}`).then(({ data }) => setReviews(data)).catch(() => setReviews([]))
    }
  }, [product?.id])

  if (!product) return null

  const images = [product.image_url, product.image_url_2, product.image_url_3, product.image_url_4].filter(Boolean)
  const sizes = product.sizes ? product.sizes.split(',').map(s => s.trim()) : []
  const rawDiscount = Number(product.discount_percentage || 0)
  const discount = Math.min(Math.max(rawDiscount, 0), 90)
  const discountActive = discount > 0
  const finalPrice = discountActive ? Number(product.price) * (1 - discount / 100) : Number(product.price)

  const formatPrice = (price) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price)
  const stock = Number(product.stock || 0)

  const handleAddToCart = () => {
    if (stock === 0) return
    const size = selectedSize || sizes[0] || '42'
    addToCart({ ...product, price: finalPrice }, size)
    if (stock <= 3) {
      addToast(`${product.name} adicionado! Apenas ${stock} unidades restantes.`, 'warning')
    } else {
      addToast(`${product.name} adicionado ao carrinho!`, 'success')
    }
    onClose()
    setTimeout(() => setCartOpen(true), 300)
  }

  const handleSubmitReview = async () => {
    if (!reviewForm.customer_name || !reviewForm.rating) return
    try {
      await api.post('/reviews', { ...reviewForm, product_id: product.id })
      setReviewMsg('Avaliação enviada! Aguardando aprovação.')
      setShowReviewForm(false)
      setReviewForm({ customer_name: '', customer_email: '', rating: 5, comment: '' })
    } catch {
      setReviewMsg('Erro ao enviar avaliação.')
    }
  }

  const avgRating = reviews.length > 0 ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : null
  const currentImage = getImageUrl(images[activeImg], product.name)

  return (
    <AnimatePresence mode="wait">
      {isOpen && (
        <motion.div className={styles.overlay} variants={overlayVariants} initial="hidden" animate="visible" exit="exit" onClick={onClose}>
          <motion.div className={styles.modal} variants={modalVariants} initial="hidden" animate="visible" exit="exit" onClick={e => e.stopPropagation()}>
            <div className={styles.imageSection}>
              <button className={styles.closeBtn} onClick={onClose}><FiX /></button>
              <div className={styles.mainImageWrap} ref={imgRef} onMouseMove={handleImgMouseMove} onMouseLeave={handleImgMouseLeave}>
                <AnimatePresence mode="wait">
                  <motion.img key={activeImg} className={styles.productImg} src={currentImage} alt={product.name}
                    style={{ rotateX: imgRotateX, rotateY: imgRotateY }}
                    initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.3 }} draggable={false} />
                </AnimatePresence>
              </div>
              {images.length > 1 && (
                <div className={styles.thumbStrip}>
                  {images.map((img, i) => (
                    <motion.div key={i} className={`${styles.thumb} ${activeImg === i ? styles.activeThumb : ''}`}
                      onClick={() => setActiveImg(i)} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
                      <img src={getImageUrl(img, product.name)} alt={`${product.name} ${i + 1}`} />
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            <div className={styles.infoSection}>
              <motion.span className={styles.brand} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }}>{product.brand_name}</motion.span>
              <motion.h2 className={styles.name} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>{product.name}</motion.h2>
              {discountActive && <span className={styles.discountPill}>-{Math.round(discount)}% OFF</span>}
              
              {avgRating && (
                <motion.div className={styles.ratingRow} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.22 }}>
                  <span className={styles.ratingStars}>{'★'.repeat(Math.round(avgRating))}</span>
                  <span className={styles.ratingValue}>{avgRating}</span>
                  <span className={styles.ratingCount}>({reviews.length} avaliações)</span>
                </motion.div>
              )}

              <motion.div className={styles.priceRow} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 }}>
                {discountActive && <span className={styles.priceOld}>{formatPrice(product.price)}</span>}
                <span className={styles.price}>{formatPrice(finalPrice)}</span>
              </motion.div>

              {stock <= 3 && stock > 0 && (
                <motion.span className={styles.lowStockLabel} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.27 }}>
                  ⚠ Últimas {stock} unidades!
                </motion.span>
              )}
              {stock === 0 && (
                <motion.span className={styles.outStockLabel} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.27 }}>
                  Produto esgotado
                </motion.span>
              )}

              <motion.p className={styles.description} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>{product.description}</motion.p>

              {sizes.length > 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}>
                  <span className={styles.sizesLabel}>Tamanho</span>
                  <div className={styles.sizes}>
                    {sizes.map((size, i) => (
                      <motion.button key={size} className={`${styles.sizeBtn} ${selectedSize === size ? styles.active : ''}`}
                        onClick={() => setSelectedSize(size)} whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.95 }}
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 + i * 0.03 }}>
                        {size}
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              )}

              <motion.button className={styles.addToCartBtn} onClick={handleAddToCart}
                whileHover={stock > 0 ? { scale: 1.02 } : {}} whileTap={stock > 0 ? { scale: 0.97 } : {}}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                disabled={stock === 0} style={stock === 0 ? { opacity: 0.4, cursor: 'default' } : {}}>
                <FiShoppingCart /> {stock === 0 ? 'Indisponível' : 'Adicionar ao Carrinho'}
              </motion.button>

              {/* Reviews Section */}
              <motion.div className={styles.reviewsSection} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }}>
                <div className={styles.reviewsHeader}>
                  <span className={styles.reviewsTitle}><FiStar /> Avaliações</span>
                  <button className={styles.reviewToggleBtn} onClick={() => setShowReviewForm(!showReviewForm)}>
                    {showReviewForm ? 'Cancelar' : 'Avaliar'}
                  </button>
                </div>

                {reviewMsg && <p className={styles.reviewMsg}>{reviewMsg}</p>}

                <AnimatePresence>
                  {showReviewForm && (
                    <motion.div className={styles.reviewForm} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                      <input className={styles.reviewInput} placeholder="Seu nome *" value={reviewForm.customer_name}
                        onChange={e => setReviewForm(p => ({ ...p, customer_name: e.target.value }))} />
                      <input className={styles.reviewInput} placeholder="Seu email" type="email" value={reviewForm.customer_email}
                        onChange={e => setReviewForm(p => ({ ...p, customer_email: e.target.value }))} />
                      <div className={styles.reviewStarsInput}>
                        {[1, 2, 3, 4, 5].map(n => (
                          <span key={n} className={`${styles.starBtn} ${reviewForm.rating >= n ? styles.starActive : ''}`}
                            onClick={() => setReviewForm(p => ({ ...p, rating: n }))}>★</span>
                        ))}
                      </div>
                      <textarea className={styles.reviewTextarea} placeholder="Seu comentário..." value={reviewForm.comment}
                        onChange={e => setReviewForm(p => ({ ...p, comment: e.target.value }))} />
                      <button className={styles.reviewSubmitBtn} onClick={handleSubmitReview}><FiSend /> Enviar</button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {reviews.length > 0 && (
                  <div className={styles.reviewsList}>
                    {reviews.slice(0, 5).map(r => (
                      <div key={r.id} className={styles.reviewItem}>
                        <div className={styles.reviewItemHeader}>
                          <span className={styles.reviewerName}>{r.customer_name}</span>
                          <span className={styles.reviewItemStars}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                        </div>
                        {r.comment && <p className={styles.reviewComment}>{r.comment}</p>}
                      </div>
                    ))}
                  </div>
                )}
                {reviews.length === 0 && !showReviewForm && <p className={styles.noReviews}>Nenhuma avaliação ainda. Seja o primeiro!</p>}
              </motion.div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
