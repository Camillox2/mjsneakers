import { useState, useEffect, useContext } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { FiArrowLeft, FiHeart, FiShoppingBag, FiStar, FiZoomIn } from 'react-icons/fi'
import api from '../../services/api'
import { CartContext } from '../../App'
import { getImageUrl } from '../../utils/imageHelper'
import styles from './Product.module.css'

export default function Product({ wishlist, onToggleWishlist }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const { addToCart } = useContext(CartContext)

  const [product, setProduct] = useState(null)
  const [reviews, setReviews] = useState([])
  const [selectedSize, setSelectedSize] = useState('')
  const [zoom, setZoom] = useState(false)
  const [zoomPos, setZoomPos] = useState({ x: 50, y: 50 })
  const [loading, setLoading] = useState(true)

  const [reviewForm, setReviewForm] = useState({ author: '', rating: 5, comment: '' })
  const [reviewLoading, setReviewLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api.get(`/products/${id}`),
      api.get(`/reviews/product/${id}`)
    ]).then(([pRes, rRes]) => {
      setProduct(pRes.data)
      setReviews(Array.isArray(rRes.data) ? rRes.data : [])
      const sizes = pRes.data.sizes ? JSON.parse(pRes.data.sizes) : []
      if (sizes.length) setSelectedSize(sizes[0])
    }).catch(() => {
      navigate('/', { replace: true })
    }).finally(() => setLoading(false))
  }, [id, navigate])

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    setZoomPos({ x, y })
  }

  const handleAddToCart = () => {
    if (!product) return
    addToCart({ ...product, selectedSize, quantity: 1 })
  }

  const handleReviewSubmit = async (e) => {
    e.preventDefault()
    if (!reviewForm.author.trim() || !reviewForm.comment.trim()) return
    setReviewLoading(true)
    try {
      const { data } = await api.post('/reviews', {
        product_id: Number(id),
        author: reviewForm.author.trim(),
        rating: reviewForm.rating,
        comment: reviewForm.comment.trim()
      })
      setReviews(prev => [data, ...prev])
      setReviewForm({ author: '', rating: 5, comment: '' })
    } catch {}
    setReviewLoading(false)
  }

  if (loading) {
    return <div className={styles.loading}>Carregando...</div>
  }

  if (!product) return null

  const discount = Math.min(Math.max(Number(product.discount_percentage || 0), 0), 90)
  const finalPrice = discount > 0 ? Number(product.price) * (1 - discount / 100) : Number(product.price)
  const sizes = product.sizes ? JSON.parse(product.sizes) : []
  const isWished = wishlist?.some(w => w.id === product.id)
  const avgRating = reviews.length > 0 ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) : 0
  const formatPrice = (p) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p)

  return (
    <motion.div className={styles.page} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {/* SEO meta */}
      {product.meta_title && <title>{product.meta_title}</title>}

      <button className={styles.backBtn} onClick={() => navigate(-1)}>
        <FiArrowLeft /> Voltar
      </button>

      <div className={styles.content}>
        {/* Image */}
        <div
          className={`${styles.imageWrap} ${zoom ? styles.zoomed : ''}`}
          onMouseEnter={() => setZoom(true)}
          onMouseLeave={() => setZoom(false)}
          onMouseMove={handleMouseMove}
        >
          {discount > 0 && <div className={styles.discountBadge}>-{Math.round(discount)}%</div>}
          <img
            className={styles.image}
            src={getImageUrl(product.image_url, product.name)}
            alt={product.name}
            style={zoom ? { transformOrigin: `${zoomPos.x}% ${zoomPos.y}%`, transform: 'scale(2)' } : {}}
          />
          <div className={styles.zoomHint}><FiZoomIn /> Passe o mouse para zoom</div>
        </div>

        {/* Details */}
        <div className={styles.details}>
          <span className={styles.brand}>{product.brand_name}</span>
          <h1 className={styles.name}>{product.name}</h1>

          {avgRating > 0 && (
            <div className={styles.ratingRow}>
              {[1, 2, 3, 4, 5].map(s => (
                <FiStar key={s} className={s <= Math.round(avgRating) ? styles.starFilled : styles.star} />
              ))}
              <span>({reviews.length} avaliações)</span>
            </div>
          )}

          <div className={styles.priceBlock}>
            {discount > 0 && <span className={styles.oldPrice}>{formatPrice(product.price)}</span>}
            <span className={styles.price}>{formatPrice(finalPrice)}</span>
            {discount > 0 && <span className={styles.savings}>Economia de {formatPrice(Number(product.price) - finalPrice)}</span>}
          </div>

          {product.stock <= 3 && product.stock > 0 && (
            <span className={styles.lowStock}>⚠ Últimas {product.stock} unidades!</span>
          )}
          {product.stock === 0 && (
            <span className={styles.outOfStock}>Produto esgotado</span>
          )}

          {/* Sizes */}
          {sizes.length > 0 && (
            <div className={styles.sizesSection}>
              <span className={styles.sizeLabel}>Tamanho:</span>
              <div className={styles.sizes}>
                {sizes.map(s => (
                  <button
                    key={s}
                    className={`${styles.sizeBtn} ${selectedSize === s ? styles.sizeActive : ''}`}
                    onClick={() => setSelectedSize(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {product.description && (
            <div className={styles.description}>
              <h3>Descrição</h3>
              <p>{product.description}</p>
            </div>
          )}

          {product.tags && (
            <div className={styles.tags}>
              {product.tags.split(',').map(t => <span key={t} className={styles.tag}>{t.trim()}</span>)}
            </div>
          )}

          <div className={styles.actionButtons}>
            <button
              className={styles.addToCartBtn}
              onClick={handleAddToCart}
              disabled={product.stock === 0}
            >
              <FiShoppingBag /> {product.stock === 0 ? 'Indisponível' : 'Adicionar ao Carrinho'}
            </button>
            <button
              className={`${styles.wishBtn} ${isWished ? styles.wished : ''}`}
              onClick={() => onToggleWishlist && onToggleWishlist(product)}
            >
              <FiHeart />
            </button>
          </div>
        </div>
      </div>

      {/* Reviews */}
      <section className={styles.reviewsSection}>
        <h2>Avaliações ({reviews.length})</h2>

        <form className={styles.reviewForm} onSubmit={handleReviewSubmit}>
          <input
            className={styles.reviewInput}
            value={reviewForm.author}
            onChange={e => setReviewForm(p => ({ ...p, author: e.target.value }))}
            placeholder="Seu nome"
            maxLength={100}
          />
          <div className={styles.starsInput}>
            {[1, 2, 3, 4, 5].map(s => (
              <button
                type="button"
                key={s}
                className={s <= reviewForm.rating ? styles.starBtnFilled : styles.starBtn}
                onClick={() => setReviewForm(p => ({ ...p, rating: s }))}
              >
                <FiStar />
              </button>
            ))}
          </div>
          <textarea
            className={styles.reviewTextarea}
            value={reviewForm.comment}
            onChange={e => setReviewForm(p => ({ ...p, comment: e.target.value }))}
            placeholder="Escreva sua avaliação..."
            rows={3}
            maxLength={500}
          />
          <button className={styles.reviewSubmitBtn} type="submit" disabled={reviewLoading}>
            {reviewLoading ? 'Enviando...' : 'Enviar Avaliação'}
          </button>
        </form>

        <div className={styles.reviewsList}>
          {reviews.map(r => (
            <div key={r.id} className={styles.reviewCard}>
              <div className={styles.reviewHeader}>
                <strong>{r.author}</strong>
                <div className={styles.reviewStars}>
                  {[1, 2, 3, 4, 5].map(s => (
                    <FiStar key={s} className={s <= r.rating ? styles.starFilled : styles.star} />
                  ))}
                </div>
              </div>
              <p>{r.comment}</p>
              <span className={styles.reviewDate}>{new Date(r.created_at).toLocaleDateString('pt-BR')}</span>
            </div>
          ))}
        </div>
      </section>
    </motion.div>
  )
}
