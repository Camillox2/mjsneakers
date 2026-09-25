import { useContext, useEffect, useState } from 'react'
import { FiAlertCircle, FiInfo } from 'react-icons/fi'
import { CartContext } from '../../App'
import { GRID_SAMPLES } from '../../data/drops'
import { cachedGet, TTL } from '../../services/cache'
import { parseSizes } from '../../utils/sizes'
import { getImageUrl } from '../../utils/imageHelper'
import SpinViewer from '../../components/SpinViewer/SpinViewer'
import { useToast } from '../../components/Toast/Toast'
import styles from './FeaturedDrop.module.css'

const brl = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
const FALLBACK = () => GRID_SAMPLES.find((p) => p.id === 'amostra-jordan-1-low') ?? GRID_SAMPLES[0]

// "O par da semana": o primeiro destaque do admin (ou uma amostra), com o
// giro de arrastar quando o par tem giro, a ficha e os tamanhos à mão.
export default function FeaturedDrop({ onOpen }) {
  const { addToCart, revealCart } = useContext(CartContext)
  const addToast = useToast()
  const [product, setProduct] = useState(null)
  const [size, setSize] = useState(null)
  const [nudge, setNudge] = useState(false)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    let alive = true
    cachedGet('/products/featured', { ttl: TTL.item })
      .then((list) => alive && setProduct(Array.isArray(list) && list[0] ? list[0] : FALLBACK()))
      .catch(() => alive && setProduct(FALLBACK()))
    return () => {
      alive = false
    }
  }, [])

  if (!product) return null

  const sizes = parseSizes(product.sizes)
  const stock = Number(product.stock || 0)
  const pct = Math.min(Math.max(Number(product.discount_percentage || 0), 0), 90)
  const price = pct > 0 ? Number(product.price) * (1 - pct / 100) : Number(product.price)

  const add = async () => {
    if (!size) {
      // chacoalha a grade e diz o porquê (com menos movimento, só o aviso)
      setNudge(true)
      setTimeout(() => setNudge(false), 700)
      setMissing(true)
      return
    }
    const result = await addToCart(product, size)
    if (result?.ok === false) {
      addToast('Esse tamanho acabou de esgotar. Escolha outro.', 'error')
      return
    }
    addToast(`${product.name}, tamanho ${size}, foi para a sacola.`, 'success')
    revealCart()
  }

  return (
    <section className={styles.featured} style={{ '--glow': product.glow || '#cdd1d8' }} aria-labelledby="par-semana">
      <div className={styles.inner}>
        <div className={styles.visual}>
          {product.spin ? (
            <SpinViewer id={product.spin} alt={product.name} />
          ) : (
            <img
              className={product.fit === 'contain' ? styles.contain : styles.cover}
              src={getImageUrl(product.image_url, product.name)}
              alt={product.name}
              loading="lazy"
            />
          )}
        </div>

        <div className={styles.info}>
          <h2 id="par-semana" className={styles.kicker}>
            O par da semana
          </h2>
          <p className={styles.name}>{product.name}</p>
          {product.description && <p className={styles.desc}>{product.description}</p>}

          <div className={styles.priceRow}>
            <span className={styles.price}>{brl(price)}</span>
            {pct > 0 && <span className={styles.old}>{brl(product.price)}</span>}
            {product.sample && <span className={styles.sample}>Amostra</span>}
          </div>

          {stock > 0 && sizes.length > 0 && !product.sample && (
            <fieldset className={`${styles.sizes} ${nudge ? styles.nudge : ''}`}>
              <legend>Escolha o tamanho</legend>
              <div className={styles.sizeGrid}>
                {sizes.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`${styles.size} ${size === s ? styles.sizeOn : ''}`}
                    aria-pressed={size === s}
                    onClick={() => {
                      setSize(s)
                      setMissing(false)
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
              {missing && !size && (
                <p className={styles.missing} role="alert">
                  <FiAlertCircle aria-hidden="true" /> Escolha o tamanho antes de colocar na sacola.
                </p>
              )}
            </fieldset>
          )}

          <div className={styles.actions}>
            {product.sample ? (
              <p className={`pz-soon ${styles.soon}`}>
                <FiInfo aria-hidden="true" /> Amostra da vitrine, ainda não está à venda
              </p>
            ) : (
              <button type="button" className="pz-btn" onClick={add} disabled={stock === 0}>
                {stock === 0 ? 'Esgotado' : 'Colocar na sacola'}
              </button>
            )}
            <button type="button" className="pz-btn-ghost" onClick={() => onOpen?.(product)}>
              Ver detalhes do par
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
