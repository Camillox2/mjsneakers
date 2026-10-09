import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useDragScroll } from '../../lib/useDragScroll'
import { getImageUrl } from '../../utils/imageHelper'
import { discountOf, fetchPromos, salePrice } from '../../lib/promos'
import CountdownTimer from '../CountdownTimer/CountdownTimer'
import ShareButton from '../ShareButton/ShareButton'
import { CARD_SPEED, useScrollParallax } from '../../lib/useScrollParallax'
import PromoBanner from './PromoBanner'
import styles from './PromoRail.module.css'

const brl = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
const MAX_RAIL = 12
const EASE = [0.22, 1, 0.36, 1]

// Card da fileira de promoções: o mesmo cartão dos "vistos recentemente",
// com o preço antigo riscado, o selo do desconto pulsando e, se a oferta tem
// data para acabar, o relógio.
export function PromoCard({ product: p, index = 0, onClick }) {
  const disc = discountOf(p)
  const contain = p.fit === 'contain'
  const end = p.promo_end ? new Date(p.promo_end) : null
  const ending = end && end > new Date()
  const soldOut = Number(p.stock) <= 0
  return (
    <motion.li
      className={styles.item}
      initial={{ opacity: 0, y: 26, scale: 0.97 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: '0px -4% -6% 0px' }}
      transition={{ duration: 0.6, delay: Math.min(index, 6) * 0.07, ease: EASE }}
    >
      {/* camada da paralaxe (a mesma dos cards "No pé"): o li já usa transform na entrada */}
      <div className={styles.lift} data-par={index % 3}>
        <button
          type="button"
          className={`${styles.card} ${soldOut ? styles.soldOut : ''}`}
          style={{ '--glow': p.glow || '#b89af0' }}
          onClick={() => onClick?.(p)}
          aria-label={`${p.name}, de ${brl(p.price)} por ${brl(salePrice(p))}, ${Math.round(disc)}% off`}
        >
          <span className={`${styles.imgWrap} ${contain ? styles.imgContain : ''}`}>
            <span className={styles.badge}>-{Math.round(disc)}%</span>
            {soldOut && <span className={styles.out}>Esgotado</span>}
            <img src={getImageUrl(p.image_url, p.name)} alt="" className={styles.img} loading="lazy" decoding="async" draggable={false} />
          </span>
          <span className={styles.info}>
            {p.brand_name && <span className={styles.brand}>{p.brand_name}</span>}
            <span className={styles.name}>{p.name}</span>
            <span className={styles.prices}>
              <span className={styles.price}>{brl(salePrice(p))}</span>
              <s className={styles.old}>{brl(p.price)}</s>
            </span>
            {ending && <CountdownTimer endDate={end} compact />}
          </span>
        </button>
        <ShareButton product={p} className={styles.share} />
      </div>
    </motion.li>
  )
}

// Fileira "Promoções" da página inicial. Some quando não há nada em oferta.
export default function PromoRail({ onProductClick }) {
  const [items, setItems] = useState([])
  const rowRef = useRef(null)
  useDragScroll(rowRef, items.length > 0)

  useEffect(() => {
    let alive = true
    fetchPromos()
      .then((list) => alive && setItems(list))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  // Paralaxe do "No pé" (mesmo hook): cada card anda numa velocidade na
  // rolagem da página. O gatilho é a fileira, que não se mexe.
  const sectionRef = useRef(null)
  useScrollParallax(sectionRef, {
    selector: '[data-par]',
    speeds: CARD_SPEED,
    trigger: (el) => el.closest('ul'),
    deps: [items.length],
  })

  if (!items.length) return null
  const maxOff = Math.max(...items.map(discountOf))
  const shown = items.slice(0, MAX_RAIL)

  return (
    <section ref={sectionRef} className={styles.section} aria-labelledby="promo-titulo" id="promocoes">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '0px 0px -10% 0px' }}
        transition={{ duration: 0.7, ease: EASE }}
      >
        <PromoBanner
          titleId="promo-titulo"
          count={items.length}
          maxOff={maxOff}
          lead="Pares selecionados com preço de queima. Corre que é por tempo limitado."
          cta={{ to: '/promocoes', label: 'Ver todas' }}
        />
      </motion.div>
      <ul ref={rowRef} className={styles.row}>
        {shown.map((p, i) => (
          <PromoCard key={p.id} product={p} index={i} onClick={onProductClick} />
        ))}
        {items.length > shown.length && (
          <li className={`${styles.item} ${styles.moreItem}`}>
            <Link to="/promocoes" className={styles.more}>
              <span className={styles.moreNum}>+{items.length - shown.length}</span>
              <span>Ver todas as promoções</span>
            </Link>
          </li>
        )}
      </ul>
    </section>
  )
}
