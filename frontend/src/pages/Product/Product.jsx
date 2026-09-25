import { useState, useEffect, useContext, useMemo, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { AnimatePresence, motion, MotionConfig } from 'framer-motion'
import { FiAlertTriangle, FiArrowLeft, FiHeart, FiInfo, FiMaximize2, FiShoppingBag, FiStar } from 'react-icons/fi'
import api from '../../services/api'
import { CartContext } from '../../App'
import { BRAND } from '../../config/brand'
import { DROPS, SAMPLE_PRODUCTS } from '../../data/drops'
import { getImageUrl } from '../../utils/imageHelper'
import { parseSizes } from '../../utils/sizes'
import { useToast } from '../../components/Toast/Toast'
import SizeSelector from '../../components/SizeSelector/SizeSelector'
import ShippingEstimate from '../../components/ShippingEstimate/ShippingEstimate'
import SpinViewer from '../../components/SpinViewer/SpinViewer'
import CountdownTimer from '../../components/CountdownTimer/CountdownTimer'
import Lightbox from '../../components/Lightbox/Lightbox'
import RelatedProducts from '../../components/RelatedProducts/RelatedProducts'
import { addRecentlyViewed } from '../../components/RecentlyViewed/RecentlyViewed'
import styles from './Product.module.css'
import { cachedGet, TTL } from '../../services/cache'
import { MQ, useMedia } from '../../lib/breakpoints'
import { useSwipe } from '../../lib/useSwipe'

// Ids de amostra começam assim; o produto sai de data/drops.js, não da API.
const SAMPLE_PREFIX = 'amostra-'
const EASE = [0.22, 1, 0.36, 1]
const brl = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

// a foto que chega entra pelo lado de onde o dedo puxou
const photoVariants = {
  enter: (dir) => ({ opacity: 0, x: dir * 40 }),
  center: { opacity: 1, x: 0 },
  exit: (dir) => ({ opacity: 0, x: dir * -40 }),
}

export default function Product({ wishlist, onToggleWishlist }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { addToCart } = useContext(CartContext)
  const addToast = useToast()

  const [product, setProduct] = useState(null)
  const [reviews, setReviews] = useState([])
  const [selectedSize, setSelectedSize] = useState('')
  const [sizeError, setSizeError] = useState('')
  const [sizeTick, setSizeTick] = useState(0)
  const [dir, setDir] = useState(1)
  // barra de compra presa embaixo (celular e tablet) quando o botão da ficha sai da tela
  const [barOn, setBarOn] = useState(false)
  const actionsRef = useRef(null)
  const sizesRef = useRef(null)
  const compact = useMedia(MQ.compact)
  const touch = useMedia(MQ.touch)
  // o que ocupa a vitrine: 'spin' (giro 360°) ou o índice da foto
  const [view, setView] = useState(0)
  const [zoom, setZoom] = useState(false)
  const [zoomPos, setZoomPos] = useState({ x: 50, y: 50 })
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  const [reviewForm, setReviewForm] = useState({ author: '', rating: 5, comment: '' })
  const [reviewLoading, setReviewLoading] = useState(false)

  useEffect(() => {
    let alive = true

    const show = (p, list) => {
      setProduct(p)
      setReviews(list)
      // tamanho é escolha da pessoa: começa sem nenhum marcado
      setSelectedSize('')
      setSizeError('')
      setView(p.spin ? 'spin' : 0)
      setZoom(false)
      setLightboxOpen(false)
      addRecentlyViewed(p)
    }

    // Exemplar de amostra: nada de chamar a API com esse id.
    if (id?.startsWith(SAMPLE_PREFIX)) {
      const sample = SAMPLE_PRODUCTS.find((p) => p.id === id)
      if (sample) {
        show(sample, [])
        setLoading(false)
      } else {
        navigate('/', { replace: true })
      }
      return () => {
        alive = false
      }
    }

    setLoading(true)
    // o produto é obrigatório; avaliações que falham não podem derrubar a página
    Promise.all([
      cachedGet(`/products/${id}`, { ttl: TTL.item }),
      api.get(`/reviews/product/${id}`).then((r) => r.data).catch(() => [])
    ]).then(([productData, reviewsData]) => {
      if (!alive) return
      if (!productData?.id) throw new Error('Produto não encontrado')
      show(productData, Array.isArray(reviewsData) ? reviewsData : [])
    }).catch(() => {
      if (alive) navigate('/', { replace: true })
    }).finally(() => {
      if (alive) setLoading(false)
    })

    return () => {
      alive = false
    }
  }, [id, navigate])

  const photos = useMemo(() => {
    if (!product) return []
    const list = [product.image_url, product.image_url_2, product.image_url_3, product.image_url_4].filter(Boolean)
    return list.length ? list : [null]
  }, [product])

  // A barra de baixo aparece quando o botão da ficha some da tela (nos dois
  // sentidos) e sai quando ele volta. Os botões flutuantes sobem junto
  // (classe pz-buybar no <html>, lida pelo global.css).
  const buyable = Boolean(product) && !product.sample && Number(product.stock) !== 0
  useEffect(() => {
    const el = actionsRef.current
    if (!el || !compact || !buyable) {
      setBarOn(false)
      return undefined
    }
    const io = new IntersectionObserver(([entry]) => setBarOn(!entry.isIntersecting), { rootMargin: '0px 0px -40px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [compact, buyable, product?.id, loading])

  useEffect(() => {
    document.documentElement.classList.toggle('pz-buybar', barOn)
    return () => document.documentElement.classList.remove('pz-buybar')
  }, [barOn])

  const photoCount = photos.length
  const currentPhoto = typeof view === 'number' ? Math.min(view, photoCount - 1) : 0
  // deslizar na foto troca de foto (no giro o dedo gira o tênis)
  const swipe = useSwipe({
    enabled: touch && view !== 'spin' && photoCount > 1,
    onNext: () => {
      if (currentPhoto >= photoCount - 1) return
      setDir(1)
      setView(currentPhoto + 1)
    },
    onPrev: () => {
      if (currentPhoto <= 0) return
      setDir(-1)
      setView(currentPhoto - 1)
    },
  })

  const handlePointerMove = (e) => {
    if (e.pointerType !== 'mouse') return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    setZoomPos({ x, y })
  }

  const goBack = () => {
    // entrou direto pelo link: não há página anterior da loja para voltar
    if (location.key === 'default') navigate('/')
    else navigate(-1)
  }

  const pickSize = (size) => {
    setSelectedSize(size)
    setSizeError('')
  }

  const handleAddToCart = async () => {
    if (!product || product.stock === 0 || product.sample) return
    if (parseSizes(product.sizes).length > 0 && !selectedSize) {
      // sem tamanho: leva até a grade, que chacoalha e diz o porquê
      setSizeError('Escolha o tamanho antes de colocar na sacola.')
      setSizeTick((n) => n + 1)
      sizesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    const result = await addToCart(product, selectedSize)
    if (result && result.ok === false) {
      if (result.reason === 'out_of_stock') {
        addToast('Esse tamanho acabou de esgotar. Escolha outro ou tire da sacola.', 'error')
      }
      return
    }
    addToast(selectedSize ? `${product.name}, tamanho ${selectedSize}, foi para a sacola.` : `${product.name} foi para a sacola.`, 'success')
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
    } catch {
      addToast('Não deu para enviar a avaliação. Tente de novo.', 'error')
    }
    setReviewLoading(false)
  }

  if (loading) {
    return (
      <div className={styles.loading} role="status" aria-live="polite">
        <span className="pz-visually-hidden">Carregando o produto</span>
        <div className={styles.loadingStage} />
        <div className={styles.loadingLines} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    )
  }

  if (!product) return null

  const sample = Boolean(product.sample)
  const drop = product.spin ? DROPS.find((d) => d.id === product.spin) : null
  const contain = product.fit === 'contain'
  const spinOn = Boolean(product.spin) && view === 'spin'
  const photoIndex = currentPhoto

  const discount = Math.min(Math.max(Number(product.discount_percentage || 0), 0), 90)
  const finalPrice = discount > 0 ? Number(product.price) * (1 - discount / 100) : Number(product.price)
  const promoActive = discount > 0 && product.promo_end && new Date(product.promo_end) > new Date()
  const sizes = parseSizes(product.sizes)
  const isWished = wishlist?.some(w => w.id === product.id)
  const avgRating = reviews.length > 0 ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) : 0
  const lightboxImages = photos.map((url) => getImageUrl(url, product.name))

  const pickPhoto = (i) => {
    setDir(typeof view === 'number' && i < view ? -1 : 1)
    setView(i)
    setZoom(false)
  }

  return (
    <MotionConfig reducedMotion="user">
      <motion.main
        className={styles.page}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, ease: EASE }}
      >
        <title>{product.meta_title || `${product.name} | ${BRAND.name}`}</title>

        <button type="button" className={styles.backBtn} onClick={goBack}>
          <FiArrowLeft aria-hidden="true" /> Voltar
        </button>

        <div className={styles.content}>
          {/* Vitrine: giro 360° ou foto com zoom */}
          <div className={styles.gallery}>
            <div
              className={`${styles.stage} ${contain ? styles.stageContain : styles.stageCover} ${product.spin ? styles.stageWide : ''}`}
              style={{ '--glow': product.glow || '#cdd1d8' }}
            >
              {spinOn ? (
                <SpinViewer id={product.spin} alt={product.name} className={styles.spin} />
              ) : (
                <button
                  type="button"
                  className={`${styles.zoomArea} ${zoom ? styles.zoomed : ''}`}
                  onPointerEnter={(e) => e.pointerType === 'mouse' && setZoom(true)}
                  onPointerLeave={() => setZoom(false)}
                  onPointerMove={handlePointerMove}
                  onClick={() => !swipe.justDragged() && setLightboxOpen(true)}
                  aria-label={`Ampliar a foto ${photoIndex + 1} de ${product.name}`}
                >
                  {/* camada da lupa (mouse): amplia no ponto do cursor; a foto
                      dentro dela desliza quando o dedo troca de foto */}
                  <span
                    className={styles.zoomLayer}
                    style={zoom ? { transformOrigin: `${zoomPos.x}% ${zoomPos.y}%`, transform: 'scale(2)' } : undefined}
                  >
                    <AnimatePresence initial={false} custom={dir}>
                      <motion.img
                        key={photoIndex}
                        className={styles.photo}
                        src={getImageUrl(photos[photoIndex], product.name)}
                        alt={product.name}
                        draggable={false}
                        custom={dir}
                        variants={photoVariants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={{ duration: 0.28, ease: EASE }}
                        {...swipe.bind}
                      />
                    </AnimatePresence>
                  </span>
                  {photos.length > 1 && (
                    <span className={styles.counter} aria-hidden="true">{photoIndex + 1} / {photos.length}</span>
                  )}
                  <span className={styles.zoomHint} aria-hidden="true">
                    <FiMaximize2 />
                    <span className={styles.hintMouse}>Passe o mouse para zoom</span>
                    <span className={styles.hintTouch}>Toque para ampliar</span>
                  </span>
                </button>
              )}

              {(sample || discount > 0) && (
                <div className={styles.badges}>
                  {sample && <span className={styles.badgeSample}>Amostra</span>}
                  {discount > 0 && <span className={styles.badgeOff}>-{Math.round(discount)}%</span>}
                </div>
              )}
            </div>

            {(product.spin || photos.length > 1) && (
              <div className={styles.thumbs} role="group" aria-label="Fotos do tênis">
                {product.spin && (
                  <button
                    type="button"
                    className={`${styles.thumb} ${styles.thumbContain} ${styles.thumb360} ${spinOn ? styles.thumbOn : ''}`}
                    style={{ '--glow': product.glow || '#cdd1d8' }}
                    onClick={() => setView('spin')}
                    aria-pressed={spinOn}
                    aria-label="Ver o giro em 360°"
                  >
                    <img src={`/giros/${product.spin}/poster.webp`} alt="" draggable={false} />
                    <span>360°</span>
                  </button>
                )}
                {photos.map((url, i) => {
                  const on = !spinOn && photoIndex === i
                  return (
                    <button
                      key={`${i}-${url || 'vazio'}`}
                      type="button"
                      className={`${styles.thumb} ${contain ? styles.thumbContain : ''} ${on ? styles.thumbOn : ''}`}
                      style={{ '--glow': product.glow || '#cdd1d8' }}
                      onClick={() => pickPhoto(i)}
                      aria-pressed={on}
                      aria-label={`Foto ${i + 1} de ${photos.length}`}
                    >
                      <img src={getImageUrl(url, product.name)} alt="" loading="lazy" draggable={false} />
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Detalhes */}
          <div className={styles.details}>
            <div className={styles.titleBlock}>
              {product.brand_name && <p className={styles.brand}>{product.brand_name}</p>}
              <h1 className={styles.name}>{product.name}</h1>
              {drop?.line && <p className={styles.line}>{drop.line}</p>}
            </div>

            {avgRating > 0 && (
              <div className={styles.ratingRow}>
                <span className="pz-visually-hidden">Nota {avgRating.toFixed(1)} de 5.</span>
                {[1, 2, 3, 4, 5].map(s => (
                  <FiStar key={s} aria-hidden="true" className={s <= Math.round(avgRating) ? styles.starFilled : styles.star} />
                ))}
                <span className={styles.ratingCount}>
                  {reviews.length} {reviews.length === 1 ? 'avaliação' : 'avaliações'}
                </span>
              </div>
            )}

            <div className={styles.priceBlock}>
              <span className={styles.price}>{brl(finalPrice)}</span>
              {discount > 0 && (
                <>
                  <span className={styles.oldPrice}>
                    <span className="pz-visually-hidden">Antes </span>
                    {brl(product.price)}
                  </span>
                  <span className={styles.savings}>Você economiza {brl(Number(product.price) - finalPrice)}</span>
                </>
              )}
            </div>

            {promoActive && <CountdownTimer endDate={product.promo_end} />}

            {product.stock <= 3 && product.stock > 0 && (
              <p className={styles.lowStock}>
                <FiAlertTriangle aria-hidden="true" />
                {product.stock === 1 ? 'Resta só 1 par.' : `Restam só ${product.stock} pares.`}
              </p>
            )}
            {product.stock === 0 && <p className={styles.outOfStock}>Esgotado. Este par não tem estoque agora.</p>}

            {sample && (
              <p className={styles.sampleNote}>
                <FiInfo aria-hidden="true" />
                <span>Exemplar de amostra. Dá para testar a sacola; a compra abre quando o catálogo real entrar.</span>
              </p>
            )}

            {sizes.length > 0 && !sample && product.stock !== 0 && (
              <div className={styles.sizesSection} ref={sizesRef}>
                <SizeSelector
                  productId={product.id}
                  fallbackSizes={sizes}
                  selected={selectedSize}
                  onSelect={pickSize}
                  error={sizeError}
                  errorTick={sizeTick}
                />
              </div>
            )}

            <div className={styles.actions} ref={actionsRef}>
              {sample ? (
                <p className={`pz-soon ${styles.addBtn}`}>
                  <FiInfo aria-hidden="true" /> Amostra da vitrine, ainda não está à venda
                </p>
              ) : (
                <button
                  type="button"
                  className={`pz-btn ${styles.addBtn}`}
                  onClick={handleAddToCart}
                  disabled={product.stock === 0}
                >
                  <FiShoppingBag aria-hidden="true" />
                  {product.stock === 0 ? 'Indisponível' : 'Colocar na sacola'}
                </button>
              )}
              <button
                type="button"
                className={`${styles.wishBtn} ${isWished ? styles.wished : ''}`}
                onClick={() => onToggleWishlist && onToggleWishlist(product)}
                aria-pressed={Boolean(isWished)}
                aria-label={isWished ? 'Tirar dos favoritos' : 'Guardar nos favoritos'}
              >
                <FiHeart aria-hidden="true" />
              </button>
            </div>

            {/* Frete depende do produto no backend; amostra não tem. */}
            {!sample && <ShippingEstimate productId={product.id} />}

            {product.description && (
              <section className={styles.block}>
                <h2 className={styles.blockTitle}>Sobre o par</h2>
                <p className={styles.description}>{product.description}</p>
              </section>
            )}

            {drop?.specs?.length > 0 && (
              <section className={styles.block}>
                <h2 className={styles.blockTitle}>Ficha</h2>
                <dl className={styles.specs}>
                  {drop.specs.map(([label, value]) => (
                    <div key={label} className={styles.spec}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            {product.tags && (
              <ul className={styles.tags} aria-label="Etiquetas">
                {product.tags.split(',').map(t => t.trim()).filter(Boolean).map(t => (
                  <li key={t} className={styles.tag}>{t}</li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Avaliações: só para produto real */}
        {!sample && (
          <section className={styles.reviewsSection} aria-labelledby="avaliacoes-titulo">
            <div className={styles.reviewsAside}>
              <h2 id="avaliacoes-titulo" className={styles.reviewsTitle}>Avaliações</h2>
              <p className={styles.reviewsSub}>
                {reviews.length === 0
                  ? 'Ninguém avaliou este par ainda.'
                  : `${reviews.length} ${reviews.length === 1 ? 'pessoa contou' : 'pessoas contaram'} como foi.`}
              </p>

              <form className={styles.reviewForm} onSubmit={handleReviewSubmit}>
                <label className={styles.field}>
                  <span>Seu nome</span>
                  <input
                    className={styles.reviewInput}
                    value={reviewForm.author}
                    onChange={e => setReviewForm(p => ({ ...p, author: e.target.value }))}
                    autoComplete="name"
                    maxLength={100}
                  />
                </label>

                <fieldset className={styles.starsField}>
                  <legend>Sua nota</legend>
                  <div className={styles.starsInput}>
                    {[1, 2, 3, 4, 5].map(s => (
                      <button
                        type="button"
                        key={s}
                        className={`${styles.starBtn} ${s <= reviewForm.rating ? styles.starBtnFilled : ''}`}
                        onClick={() => setReviewForm(p => ({ ...p, rating: s }))}
                        aria-label={`${s} de 5`}
                        aria-pressed={reviewForm.rating === s}
                      >
                        <FiStar aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                </fieldset>

                <label className={styles.field}>
                  <span>Como foi com o par</span>
                  <textarea
                    className={styles.reviewTextarea}
                    value={reviewForm.comment}
                    onChange={e => setReviewForm(p => ({ ...p, comment: e.target.value }))}
                    placeholder="Conforto, forma, material, entrega..."
                    rows={4}
                    maxLength={500}
                  />
                </label>

                <button className={`pz-btn-ghost ${styles.reviewSubmitBtn}`} type="submit" disabled={reviewLoading}>
                  {reviewLoading ? 'Enviando...' : 'Enviar avaliação'}
                </button>
              </form>
            </div>

            {reviews.length > 0 && (
              <ul className={styles.reviewsList}>
                {reviews.map(r => (
                  <li key={r.id} className={styles.reviewCard}>
                    <div className={styles.reviewHeader}>
                      <strong>{r.author}</strong>
                      <div className={styles.reviewStars}>
                        <span className="pz-visually-hidden">Nota {r.rating} de 5.</span>
                        {[1, 2, 3, 4, 5].map(s => (
                          <FiStar key={s} aria-hidden="true" className={s <= r.rating ? styles.starFilled : styles.star} />
                        ))}
                      </div>
                    </div>
                    <p>{r.comment}</p>
                    <span className={styles.reviewDate}>{new Date(r.created_at).toLocaleDateString('pt-BR')}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <RelatedProducts productId={product.id} onProductClick={(p) => navigate(`/produto/${p.id}`)} />

        {/* compra presa embaixo no celular e no tablet, com a área segura */}
        <AnimatePresence>
          {barOn && (
            <motion.div
              className={styles.buyBar}
              initial={{ y: '110%' }}
              animate={{ y: 0 }}
              exit={{ y: '110%' }}
              transition={{ duration: 0.32, ease: EASE }}
            >
              <span className={styles.buyBarPrice}>
                <span className={styles.buyBarValue}>{brl(finalPrice)}</span>
                <span className={styles.buyBarSize}>{selectedSize ? `Tamanho ${selectedSize}` : sizes.length ? 'Escolha o tamanho' : product.name}</span>
              </span>
              <button type="button" className={`pz-btn ${styles.buyBarBtn}`} onClick={handleAddToCart}>
                <FiShoppingBag aria-hidden="true" /> Colocar na sacola
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <Lightbox
          images={lightboxImages}
          startIndex={photoIndex}
          isOpen={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
          alt={product.name}
        />
      </motion.main>
    </MotionConfig>
  )
}
