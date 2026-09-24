import BrandOrbit from './BrandOrbit'
import styles from './ShopIntro.module.css'

// Ponte entre o giro e a loja: o título cromado e a órbita de marcas.
export default function ShopIntro({ brands, active, onBrand, count, shoeFor, countFor, onSeeAll }) {
  return (
    <section className={styles.intro} aria-labelledby="loja-titulo">
      <div className={styles.head}>
        <h2 id="loja-titulo" className={styles.title}>
          A loja
        </h2>
        <p className={styles.lead}>
          Pares originais, escolhidos um a um, com envio em até 24h.
          {count > 0 && <span className={styles.count}> {count} pares na vitrine agora.</span>}
        </p>
      </div>

      {brands.length > 0 && (
        <BrandOrbit brands={brands} active={active} onPick={onBrand} shoeFor={shoeFor} countFor={countFor} onSeeAll={onSeeAll} />
      )}
    </section>
  )
}
