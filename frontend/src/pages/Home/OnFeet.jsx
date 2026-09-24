import { useLayoutEffect, useRef } from 'react'
import { SAMPLE_PRODUCTS } from '../../data/drops'
import { gsap, prefersReducedMotion } from '../../lib/motion'
import styles from './OnFeet.module.css'

// Fotos reais da loja, no pé. Três colunas que correm em velocidades
// diferentes na rolagem (paralaxe só com transform, leve).
const SHOTS = [
  { src: '/amostras/skate-lavanda-lado.webp', product: 'amostra-skate-lavanda', caption: 'Skate Lavanda, de lado' },
  { src: '/amostras/skate-oceano-frente.webp', product: 'amostra-skate-oceano', caption: 'Skate Oceano, de frente' },
  { src: '/amostras/skate-lavanda-tras.webp', product: 'amostra-skate-lavanda', caption: 'Skate Lavanda, o calcanhar' },
  { src: '/amostras/skate-oceano-lado.webp', product: 'amostra-skate-oceano', caption: 'Skate Oceano, de lado' },
  { src: '/amostras/skate-lavanda-frente.webp', product: 'amostra-skate-lavanda', caption: 'Skate Lavanda, de frente' },
  { src: '/amostras/skate-oceano-tras.webp', product: 'amostra-skate-oceano', caption: 'Skate Oceano, o calcanhar' },
]
const COLUMNS = [
  [SHOTS[0], SHOTS[3]],
  [SHOTS[1], SHOTS[4]],
  [SHOTS[2], SHOTS[5]],
]
const SPEED = [-8, 10, -4] // yPercent de cada coluna ao longo da passagem

export default function OnFeet({ onOpen }) {
  const ref = useRef(null)

  useLayoutEffect(() => {
    if (prefersReducedMotion()) return undefined
    const ctx = gsap.context(() => {
      gsap.utils.toArray('[data-col]').forEach((col, i) => {
        gsap.fromTo(
          col,
          { yPercent: -SPEED[i] },
          {
            yPercent: SPEED[i],
            ease: 'none',
            scrollTrigger: { trigger: ref.current, start: 'top bottom', end: 'bottom top', scrub: true },
          },
        )
      })
    }, ref)
    return () => ctx.revert()
  }, [])

  const open = (id) => {
    const product = SAMPLE_PRODUCTS.find((p) => p.id === id)
    if (product) onOpen?.(product)
  }

  return (
    <section ref={ref} className={styles.onfeet} aria-labelledby="no-pe">
      <div className={styles.head}>
        <h2 id="no-pe" className={styles.title}>
          No pé
        </h2>
        <p className={styles.lead}>Foto de verdade, sem filtro. É assim que o par chega e é assim que ele fica.</p>
      </div>

      <div className={styles.cols}>
        {COLUMNS.map((col, i) => (
          <div key={i} className={styles.col} data-col>
            {col.map((shot) => (
              <figure key={shot.src} className={styles.shot}>
                <button type="button" className={styles.shotBtn} onClick={() => open(shot.product)} aria-label={`Ver ${shot.caption}`}>
                  <img src={shot.src} alt={shot.caption} loading="lazy" decoding="async" />
                </button>
                <figcaption>{shot.caption}</figcaption>
              </figure>
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}
