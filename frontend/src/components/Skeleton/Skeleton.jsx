import styles from './Skeleton.module.css'

// Mesma forma do card da loja: vitrine 4:5 e duas linhas (nome e preço).
export default function SkeletonGrid({ count = 8 }) {
  return (
    <div className={styles.skeletonGrid} role="status" aria-live="polite">
      <span className="pz-visually-hidden">Carregando os tênis</span>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={styles.skeletonCard} aria-hidden="true">
          <div className={styles.skeletonImage} />
          <div className={styles.skeletonBody}>
            <div className={styles.skeletonLine} />
            <div className={styles.skeletonLine} />
          </div>
        </div>
      ))}
    </div>
  )
}
