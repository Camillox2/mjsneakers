import { BRAND } from '../../config/brand'
import styles from './ChromeLogo.module.css'

// O logo cromado de verdade (imagem) com um reflexo de luz que atravessa as
// letras. O reflexo usa o próprio logo como máscara, então só acende o metal.
export default function ChromeLogo({ small = false, shine = true, className = '', ...rest }) {
  const src = small ? BRAND.logoSmall : BRAND.logo
  return (
    <span
      className={`${styles.logo} ${className}`}
      style={{ '--logo-mask': `url(${src})` }}
      role="img"
      aria-label={BRAND.name}
      {...rest}
    >
      <img src={src} alt="" aria-hidden="true" draggable={false} className={styles.img} />
      {shine && <span className={styles.shine} aria-hidden="true" />}
    </span>
  )
}
