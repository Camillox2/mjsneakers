import logo from '../../assets/dcfoundry-digital-logo.png'
import styles from './DcFoundryCredit.module.css'

/**
 * Crédito clicável da DC Foundry Digital (rodapé + fluxo de compra).
 * `compact` encolhe logo e texto para gaveta/modal.
 * Logo importada via Vite (/assets/hashed) para não cair no rewrite SPA.
 */
export default function DcFoundryCredit({ compact = false, className = '' }) {
  const root = [styles.credit, compact ? styles.compact : '', className].filter(Boolean).join(' ')
  return (
    <a
      className={root}
      href="https://dcfoundrydigital.com"
      target="_blank"
      rel="noreferrer noopener"
      aria-label="Desenvolvido e Mantido por DC Foundry Digital"
    >
      <img
        src={logo}
        width={compact ? 36 : 48}
        height={compact ? 36 : 48}
        alt="DC Foundry Digital"
        loading="lazy"
        decoding="async"
      />
      <span className={styles.label}>
        Desenvolvido e Mantido por <strong className={styles.name}>DC Foundry Digital</strong>
      </span>
    </a>
  )
}
