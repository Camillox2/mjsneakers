import { Link } from 'react-router-dom'
import styles from './PromoBanner.module.css'

// Faixa de abertura das promoções: vidro escuro com o violeta e o cobalto do
// giro acesos atrás, "Promoções" no cromo e o maior desconto em destaque.
// O brilho anda só por transform/opacity (placa de vídeo) e para com
// prefers-reduced-motion.
export default function PromoBanner({ count = 0, maxOff = 0, size = 'rail', titleId, title = 'Promoções', lead, cta }) {
  const Title = size === 'hero' ? 'h1' : 'h2'
  return (
    <div className={`${styles.banner} ${size === 'hero' ? styles.hero : styles.rail}`}>
      <span className={styles.glowA} aria-hidden="true" />
      <span className={styles.glowB} aria-hidden="true" />
      <span className={styles.grain} aria-hidden="true" />
      <div className={styles.content}>
        <div className={styles.text}>
          <span className={styles.eyebrow}>
            <span className={styles.dot} aria-hidden="true" />
            Ofertas por tempo limitado
          </span>
          <Title id={titleId} className={styles.title}>
            <span className={styles.titleText}>{title}</span>
          </Title>
          {lead && <p className={styles.lead}>{lead}</p>}
        </div>
        <div className={styles.side}>
          {maxOff > 0 && (
            <p className={styles.stat}>
              <span className={styles.statSmall}>até</span>
              <span className={styles.statBig}>-{Math.round(maxOff)}%</span>
            </p>
          )}
          {count > 0 && <p className={styles.count}>{count === 1 ? '1 par em oferta' : `${count} pares em oferta`}</p>}
          {cta && (
            <Link to={cta.to} className={`pz-btn ${styles.cta}`}>
              {cta.label}
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
