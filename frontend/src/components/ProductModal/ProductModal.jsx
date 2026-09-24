import { useState, useContext, useEffect, useRef, useId } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { FiX, FiShoppingBag, FiStar, FiSend, FiInfo } from 'react-icons/fi'
import { CartContext } from '../../App'
import { getImageUrl } from '../../utils/imageHelper'
import { useToast } from '../Toast/Toast'
import SizeSelector from '../SizeSelector/SizeSelector'
import ShippingEstimate from '../ShippingEstimate/ShippingEstimate'
import SpinViewer from '../SpinViewer/SpinViewer'
import { isSample } from '../../data/drops'
import api from '../../services/api'
import { parseSizes } from '../../utils/sizes'
import styles from './ProductModal.module.css'
import { useScrollLock } from '../../lib/useScrollLock'

const EASE = [0.22, 1, 0.36, 1]
const SHEET_QUERY = '(max-width: 860px)'

const isSampleProduct = (p) => isSample(p) || (typeof p?.id === 'string' && p.id.startsWith('amostra-'))

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.3, ease: EASE } },
  exit: { opacity: 0, transition: { duration: 0.22, ease: 'easeIn' } },
}

// No celular o modal vira uma folha que sobe da base; no computador ele só
// assenta no lugar, sem mola.
const dialogVariants = {
  // só deslize e opacidade: escala na entrada redesenha texto e borda a cada quadro
  hidden: (sheet) => (sheet ? { y: '100%' } : { opacity: 0, y: 24 }),
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } },
  exit: (sheet) => (sheet
    ? { y: '100%', transition: { duration: 0.28, ease: [0.4, 0, 1, 1] } }
    : { opacity: 0, y: 12, transition: { duration: 0.2, ease: 'easeIn' } }),
}

function useMatch(query) {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const sync = () => setMatch(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [query])
  return match
}

function OrbitIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.orbit}>
      <ellipse cx="12" cy="13" rx="9" ry="3.2" />
      <path d="M18 9.5l2.5 2.6-3.4 1" />
    </svg>
  )
}

export default function ProductModal({ product, isOpen, onClose }) {
  useScrollLock(isOpen)
  const [selectedSize, setSelectedSize] = useState(null)
  const [picked, setPicked] = useState({ id: null, view: 0 })
  const [reviews, setReviews] = useState([])
  const [showReviewForm, setShowReviewForm] = useState(false)
  const [reviewForm, setReviewForm] = useState({ customer_name: '', customer_email: '', rating: 5, comment: '' })
  const [reviewMsg, setReviewMsg] = useState('')
  const { addToCart, setCartOpen } = useContext(CartContext)
  const addToast = useToast()
  const sheet = useMatch(SHEET_QUERY)
  const titleId = useId()
  const dialogRef = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Guarda o último produto para a saída animar mesmo depois que o pai zera a seleção.
  const lastProduct = useRef(product)
  if (product) lastProduct.current = product
  const shown = product || lastProduct.current
  const sample = shown ? isSampleProduct(shown) : false

  useEffect(() => {
    if (!product?.id) return
    setPicked({ id: null, view: 0 })
    setSelectedSize(null)
    setShowReviewForm(false)
    setReviewMsg('')
    // Amostra não existe no backend: nada de buscar avaliação por esse id.
    if (sample) {
      setReviews([])
      return
    }
    let alive = true
    api.get(`/reviews/product/${product.id}`)
      .then(({ data }) => { if (alive) setReviews(Array.isArray(data) ? data : []) })
      .catch(() => { if (alive) setReviews([]) })
    return () => { alive = false }
  }, [product?.id, sample]) // eslint-disable-line react-hooks/exhaustive-deps

  // Esc fecha; o foco entra no modal ao abrir e volta para onde estava ao fechar.
  useEffect(() => {
    if (!isOpen) return
    const previous = document.activeElement
    const raf = requestAnimationFrame(() => dialogRef.current?.focus({ preventScroll: true }))
    const onKey = (e) => { if (e.key === 'Escape') onCloseRef.current?.() }
    window.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKey)
      if (previous && typeof previous.focus === 'function') previous.focus({ preventScroll: true })
    }
  }, [isOpen])

  if (!shown) return null

  const images = [shown.image_url, shown.image_url_2, shown.image_url_3, shown.image_url_4].filter(Boolean)
  const hasSpin = Boolean(shown.spin)
  const contain = shown.fit === 'contain'
  const view = picked.id === shown.id ? picked.view : (hasSpin ? 'spin' : 0)
  const showSpin = hasSpin && view === 'spin'
  const imgIndex = showSpin ? 0 : Math.min(Number(view) || 0, Math.max(images.length - 1, 0))
  const choose = (v) => setPicked({ id: shown.id, view: v })
  const glowStyle = shown.glow ? { '--glow': shown.glow } : undefined

  const sizes = parseSizes(shown.sizes)
  const rawDiscount = Number(shown.discount_percentage || 0)
  const discount = Math.min(Math.max(rawDiscount, 0), 90)
  const discountActive = discount > 0
  const finalPrice = discountActive ? Number(shown.price) * (1 - discount / 100) : Number(shown.price)

  const formatPrice = (price) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price)
  const stock = Number(shown.stock || 0)

  const handleAddToCart = async () => {
    if (stock === 0) return
    const size = selectedSize || sizes[0] || '42'
    // O preço já vai com o desconto aplicado; zera o percentual para a sacola
    // não descontar de novo no total.
    const result = await addToCart({ ...shown, price: finalPrice, discount_percentage: 0 }, size)
    if (result && result.ok === false) {
      if (result.reason === 'out_of_stock') {
        addToast('Esse tamanho acabou de esgotar. Escolha outro.', 'error')
      }
      return
    }
    if (stock <= 3) {
      addToast(`${shown.name}, tamanho ${size}, foi para a sacola. Restam só ${stock}.`, 'success')
    } else {
      addToast(`${shown.name}, tamanho ${size}, foi para a sacola.`, 'success')
    }
    onClose()
    setTimeout(() => setCartOpen(true), 300)
  }

  const handleSubmitReview = async () => {
    if (!reviewForm.customer_name || !reviewForm.rating) return
    try {
      await api.post('/reviews', { ...reviewForm, product_id: shown.id })
      setReviewMsg('Avaliação enviada. Ela aparece aqui depois de aprovada.')
      setShowReviewForm(false)
      setReviewForm({ customer_name: '', customer_email: '', rating: 5, comment: '' })
    } catch {
      setReviewMsg('Não deu para enviar a avaliação. Tente de novo.')
    }
  }

  const avgRating = reviews.length > 0 ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : null
  const currentImage = getImageUrl(images[imgIndex], shown.name)
  const showThumbs = hasSpin ? images.length > 0 : images.length > 1

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence custom={sheet}>
        {isOpen && (
          <motion.div
            key="product-modal"
            className={styles.overlay}
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={onClose}
            data-lenis-prevent
          >
            <motion.div
              ref={dialogRef}
              className={styles.dialog}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              tabIndex={-1}
              custom={sheet}
              variants={dialogVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              onClick={e => e.stopPropagation()}
            >
              <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Fechar">
                <FiX aria-hidden />
              </button>

              <div className={styles.body}>
                <div className={styles.visual}>
                  <div className={`${styles.stage} ${contain ? styles.vitrine : styles.cover}`} style={glowStyle}>
                    {showSpin ? (
                      <div className={styles.spinBox}>
                        <SpinViewer id={shown.spin} alt={shown.name} delay={450} />
                      </div>
                    ) : (
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.img
                          key={imgIndex}
                          className={styles.photo}
                          src={currentImage}
                          alt={shown.name}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.22, ease: EASE }}
                          draggable={false}
                        />
                      </AnimatePresence>
                    )}
                  </div>

                  {showThumbs && (
                    <div className={styles.thumbs} role="group" aria-label="Vistas do produto">
                      {hasSpin && (
                        <button
                          type="button"
                          className={`${styles.thumb} ${styles.thumbSpin} ${showSpin ? styles.thumbOn : ''}`}
                          onClick={() => choose('spin')}
                          aria-pressed={showSpin}
                          aria-label="Ver o tênis em 360 graus"
                        >
                          <OrbitIcon />
                          <span>360°</span>
                        </button>
                      )}
                      {images.map((img, i) => {
                        const on = !showSpin && imgIndex === i
                        return (
                          <button
                            key={i}
                            type="button"
                            className={`${styles.thumb} ${contain ? styles.thumbVitrine : ''} ${on ? styles.thumbOn : ''}`}
                            style={contain ? glowStyle : undefined}
                            onClick={() => choose(i)}
                            aria-pressed={on}
                            aria-label={`Foto ${i + 1} de ${images.length}`}
                          >
                            <img src={getImageUrl(img, shown.name)} alt="" loading="lazy" draggable={false} />
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                <motion.div
                  className={styles.info}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08, duration: 0.4, ease: EASE }}
                >
                  <div className={styles.head}>
                    {shown.brand_name && <span className={styles.brand}>{shown.brand_name}</span>}
                    <h2 id={titleId} className={styles.name}>{shown.name}</h2>
                    {avgRating && (
                      <div className={styles.rating}>
                        <FiStar aria-hidden />
                        <span className={styles.ratingValue}>{avgRating}</span>
                        <span>({reviews.length} {reviews.length === 1 ? 'avaliação' : 'avaliações'})</span>
                      </div>
                    )}
                  </div>

                  <div className={styles.priceRow}>
                    <span className={styles.price}>{formatPrice(finalPrice)}</span>
                    {discountActive && (
                      <>
                        <span className={styles.priceOld}>
                          <span className="pz-visually-hidden">De </span>{formatPrice(shown.price)}
                        </span>
                        <span className={styles.off}>-{Math.round(discount)}%</span>
                      </>
                    )}
                  </div>

                  {stock <= 3 && stock > 0 && (
                    <p className={styles.stockLow}><span className={styles.dot} aria-hidden /> Últimas {stock} unidades</p>
                  )}
                  {stock === 0 && (
                    <p className={styles.stockOut}><span className={styles.dot} aria-hidden /> Esgotado</p>
                  )}

                  {shown.description && <p className={styles.description}>{shown.description}</p>}

                  <div className={styles.buy}>
                    {sizes.length > 0 && (
                      <SizeSelector
                        productId={shown.id}
                        fallbackSizes={sizes}
                        selected={selectedSize}
                        onSelect={setSelectedSize}
                      />
                    )}

                    <ShippingEstimate productId={shown.id} />

                    <button
                      type="button"
                      className={`pz-btn ${styles.addBtn}`}
                      onClick={handleAddToCart}
                      disabled={stock === 0}
                    >
                      <FiShoppingBag aria-hidden /> {stock === 0 ? 'Esgotado' : 'Colocar na sacola'}
                    </button>

                    {sample && (
                      <p className={styles.sampleNote}>
                        <FiInfo aria-hidden />
                        <span>Exemplar de amostra. Dá para testar a sacola; a compra abre quando o catálogo real entrar.</span>
                      </p>
                    )}
                  </div>

                  {!sample && (
                    <section className={styles.reviews} aria-label="Avaliações">
                      <div className={styles.reviewsHead}>
                        <h3 className={styles.reviewsTitle}>Avaliações</h3>
                        <button
                          type="button"
                          className={styles.reviewToggle}
                          onClick={() => setShowReviewForm(!showReviewForm)}
                          aria-expanded={showReviewForm}
                        >
                          {showReviewForm ? 'Cancelar' : 'Avaliar'}
                        </button>
                      </div>

                      {reviewMsg && <p className={styles.reviewMsg} role="status">{reviewMsg}</p>}

                      <AnimatePresence initial={false}>
                        {showReviewForm && (
                          <motion.div
                            className={styles.reviewForm}
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.3, ease: EASE }}
                          >
                            <div className={styles.reviewFields}>
                              <input
                                className={styles.field}
                                placeholder="Seu nome"
                                aria-label="Seu nome"
                                autoComplete="name"
                                value={reviewForm.customer_name}
                                onChange={e => setReviewForm(p => ({ ...p, customer_name: e.target.value }))}
                              />
                              <input
                                className={styles.field}
                                placeholder="Seu e-mail (opcional)"
                                aria-label="Seu e-mail"
                                type="email"
                                autoComplete="email"
                                value={reviewForm.customer_email}
                                onChange={e => setReviewForm(p => ({ ...p, customer_email: e.target.value }))}
                              />
                              <div className={styles.starsInput} role="radiogroup" aria-label="Nota">
                                {[1, 2, 3, 4, 5].map(n => (
                                  <button
                                    key={n}
                                    type="button"
                                    role="radio"
                                    aria-checked={reviewForm.rating === n}
                                    aria-label={`${n} de 5`}
                                    className={`${styles.starBtn} ${reviewForm.rating >= n ? styles.starOn : ''}`}
                                    onClick={() => setReviewForm(p => ({ ...p, rating: n }))}
                                  >
                                    <FiStar aria-hidden />
                                  </button>
                                ))}
                              </div>
                              <textarea
                                className={`${styles.field} ${styles.textarea}`}
                                placeholder="Conte como foi o tênis no pé"
                                aria-label="Comentário"
                                value={reviewForm.comment}
                                onChange={e => setReviewForm(p => ({ ...p, comment: e.target.value }))}
                              />
                              <button type="button" className={`pz-btn-ghost ${styles.reviewSend}`} onClick={handleSubmitReview}>
                                <FiSend aria-hidden /> Enviar avaliação
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {reviews.length > 0 && (
                        <ul className={styles.reviewList}>
                          {reviews.slice(0, 5).map(r => (
                            <li key={r.id} className={styles.reviewItem}>
                              <div className={styles.reviewItemHead}>
                                <span className={styles.reviewer}>{r.customer_name}</span>
                                <span className={styles.reviewStars} aria-label={`Nota ${r.rating} de 5`}>
                                  {[1, 2, 3, 4, 5].map(n => (
                                    <FiStar key={n} aria-hidden className={n <= r.rating ? styles.starFill : ''} />
                                  ))}
                                </span>
                              </div>
                              {r.comment && <p className={styles.reviewComment}>{r.comment}</p>}
                            </li>
                          ))}
                        </ul>
                      )}
                      {reviews.length === 0 && !showReviewForm && (
                        <p className={styles.noReviews}>Ninguém avaliou este par ainda.</p>
                      )}
                    </section>
                  )}
                </motion.div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  )
}
