import { useContext, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { FiHeart, FiStar } from 'react-icons/fi'
import CountdownTimer from '../CountdownTimer/CountdownTimer'
import { CartContext, WishlistContext } from '../../App'
import { getImageUrl } from '../../utils/imageHelper'
import { parseSizes } from '../../utils/sizes'
import { curveIndex, loadManifest } from '../../lib/frames'
import { useToast } from '../Toast/Toast'
import styles from './ProductCard.module.css'

const brl = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
const canHover = () => typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches

// Giro no card: com o mouse em cima, a posição horizontal do cursor escolhe o
// ângulo do tênis. Carrega 24 quadros leves só quando alguém passa o mouse.
function useHoverSpin(spinId) {
  const canvasRef = useRef(null)
  const frames = useRef([])
  const [ready, setReady] = useState(false)
  const started = useRef(false)

  const start = () => {
    if (!spinId || started.current) return
    started.current = true
    loadManifest(spinId)
      .then((m) => {
        const n = m.sizes.m.n
        const rev = m.rev ? `?v=${m.rev}` : ''
        // 24 posições igualmente espaçadas em ângulo (pela curva de tempo)
        const picks = Array.from({ length: 24 }, (_, k) => Math.round(curveIndex(m.sizes.m.curve, n, k / 24)) % n)
        return Promise.all(
          picks.map((i) => {
            const img = new Image()
            img.src = `/giros/${spinId}/m/${String(i).padStart(3, '0')}.webp${rev}`
            return img.decode().then(() => img).catch(() => null)
          }),
        )
      })
      .then((imgs) => {
        frames.current = imgs.filter(Boolean)
        if (frames.current.length) setReady(true)
      })
      .catch(() => {
        started.current = false
      })
  }

  const shown = useRef(null)
  const draw = (fraction) => {
    const canvas = canvasRef.current
    const list = frames.current
    if (!canvas || !list.length) return
    // o quadro inteiro mais perto do cursor. Misturar dois vizinhos (15° um
    // do outro) desenhava duas poses ao mesmo tempo: o tênis ficava com fantasma
    const img = list[Math.round(Math.min(1, Math.max(0, fraction)) * (list.length - 1))]
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = Math.round(canvas.clientWidth * dpr)
    const h = Math.round(canvas.clientHeight * dpr)
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
      shown.current = null
    }
    if (img === shown.current) return // mesmo quadro: nada a redesenhar
    shown.current = img
    const ctx = canvas.getContext('2d')
    const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight)
    const dw = img.naturalWidth * scale
    const dh = img.naturalHeight * scale
    const x = (w - dw) / 2
    const y = (h - dh) / 2
    ctx.clearRect(0, 0, w, h)
    ctx.drawImage(img, x, y, dw, dh)
  }

  return { canvasRef, ready, start, draw }
}

// Card da loja: uma vitrine na cor do próprio tênis (como os mundos do giro).
// Sem efeito 3D: inclinar um card com cantos arredondados serrilha a borda.
export default function ProductCard({ product, onClick, index = 0, feature = false }) {
  const { addToCart, setCartOpen } = useContext(CartContext)
  const { wishlist, toggleWishlist } = useContext(WishlistContext)
  const addToast = useToast()
  const cardRef = useRef(null)
  const [spinning, setSpinning] = useState(false)
  const spin = useHoverSpin(product.spin)

  const isWished = wishlist?.some((w) => w.id === product.id)
  const stock = Number(product.stock || 0)
  const sizes = parseSizes(product.sizes)
  const contain = product.fit === 'contain'

  const discount = Math.min(Math.max(Number(product.discount_percentage || 0), 0), 90)
  const discountActive = discount > 0
  const finalPrice = discountActive ? Number(product.price) * (1 - discount / 100) : Number(product.price)
  const avgRating = product.avg_rating ? Number(product.avg_rating) : null
  const reviewCount = product.review_count ? Number(product.review_count) : 0
  const promoEnd = product.promo_end ? new Date(product.promo_end) : null
  const promoActive = promoEnd && promoEnd > new Date() && discountActive

  useEffect(() => {
    if (spin.ready && spinning) spin.draw(0.5)
  }, [spin.ready, spinning]) // eslint-disable-line react-hooks/exhaustive-deps

  const onMove = (e) => {
    if (!spin.ready || !cardRef.current || !canHover()) return
    const rect = cardRef.current.getBoundingClientRect()
    spin.draw(Math.min(0.999, Math.max(0, (e.clientX - rect.left) / rect.width)))
  }

  const onEnter = () => {
    if (!canHover()) return
    spin.start()
    setSpinning(true)
  }

  const quickAdd = async (e, size) => {
    e.stopPropagation()
    if (stock === 0) return
    const result = await addToCart(product, size)
    if (result?.ok === false) {
      addToast('Esse tamanho acabou de esgotar. Escolha outro.', 'error')
      return
    }
    addToast(`${product.name}, tamanho ${size}, foi para a sacola.`, 'success')
    setCartOpen?.(true)
  }

  return (
    <motion.article
      className={styles.cardWrapper}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -8% 0px' }}
      transition={{ duration: 0.55, delay: (index % 4) * 0.05, ease: [0.22, 1, 0.36, 1] }}
    >
      <div
        ref={cardRef}
        className={`${styles.card} ${contain ? styles.contain : styles.cover} ${feature ? styles.feature : ''} ${stock === 0 ? styles.soldOut : ''}`}
        style={{ '--glow': product.glow || '#cdd1d8' }}
        onPointerMove={onMove}
        onPointerEnter={onEnter}
        onPointerLeave={() => setSpinning(false)}
        onClick={() => onClick?.(product)}
      >
        <div className={styles.stage}>
          <span className={styles.floor} aria-hidden="true" />
          <img
            className={`${styles.photo} ${spinning && spin.ready ? styles.photoHidden : ''}`}
            src={getImageUrl(product.image_url, product.name)}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
          />
          {product.spin && <canvas ref={spin.canvasRef} className={`${styles.spin} ${spinning && spin.ready ? styles.spinOn : ''}`} aria-hidden="true" />}

          <div className={styles.badges}>
            {discountActive && <span className={styles.badgeOff}>-{Math.round(discount)}%</span>}
            {stock === 0 && <span className={styles.badgeOut}>Esgotado</span>}
            {stock > 0 && stock <= 3 && <span className={styles.badgeLow}>Últimos {stock}</span>}
          </div>

          <button
            type="button"
            className={`${styles.wish} ${isWished ? styles.wished : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              toggleWishlist(product)
            }}
            aria-pressed={isWished}
            aria-label={isWished ? 'Tirar dos favoritos' : 'Guardar nos favoritos'}
          >
            <FiHeart />
          </button>

          {product.spin && (
            <span className={styles.spinHint} aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <ellipse cx="12" cy="13" rx="9" ry="3.2" />
                <path d="M18 9.5l2.5 2.6-3.4 1" />
              </svg>
            </span>
          )}

          {stock > 0 && sizes.length > 0 && (
            <div className={styles.quick} onClick={(e) => e.stopPropagation()}>
              {sizes.slice(0, 8).map((s) => (
                <button key={s} type="button" onClick={(e) => quickAdd(e, s)} aria-label={`Colocar tamanho ${s} na sacola`}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className={styles.info}>
          <div className={styles.meta}>
            <span className={styles.brand}>{product.brand_name}</span>
            {product.sample && <span className={styles.sample}>amostra</span>}
          </div>
          <h3 className={styles.name}>
            <button
              type="button"
              className={styles.nameBtn}
              onClick={(e) => {
                e.stopPropagation()
                onClick?.(product)
              }}
            >
              {product.name}
            </button>
          </h3>
          {feature && product.description && <p className={styles.desc}>{product.description}</p>}
          {avgRating !== null && (
            <div className={styles.rating}>
              <FiStar aria-hidden="true" />
              <span>{avgRating.toFixed(1)}</span>
              {reviewCount > 0 && <span className={styles.reviews}>({reviewCount})</span>}
            </div>
          )}
          {promoActive && <CountdownTimer endDate={promoEnd} compact />}
          <div className={styles.priceRow}>
            <span className={styles.price}>{brl(finalPrice)}</span>
            {discountActive && <span className={styles.oldPrice}>{brl(product.price)}</span>}
          </div>
        </div>
      </div>
    </motion.article>
  )
}
