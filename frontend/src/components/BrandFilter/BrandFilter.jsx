import { motion, MotionConfig } from 'framer-motion'
import { FiGrid } from 'react-icons/fi'
import nikelogo from '../../assets/logo/nikelogo.png'
import adidaslogo from '../../assets/logo/adidas logo.jpg'
import pumalogo from '../../assets/logo/pumalogo.jpg'
import nblogo from '../../assets/logo/newbalance logo.png'
import styles from './BrandFilter.module.css'

const EASE = [0.22, 1, 0.36, 1]

const brandLogos = {
  'Nike': nikelogo,
  'Adidas': adidaslogo,
  'Puma': pumalogo,
  'New Balance': nblogo,
}

export default function BrandFilter({ brands, activeBrand, onSelect }) {
  return (
    <MotionConfig reducedMotion="user">
      <div className={styles.filtersSection}>
        <motion.div
          className={styles.filtersScroll}
          role="group"
          aria-label="Marcas"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, ease: EASE }}
        >
          <button
            type="button"
            className={`${styles.filterItem} ${activeBrand === null ? styles.active : ''}`}
            onClick={() => onSelect(null)}
            aria-pressed={activeBrand === null}
          >
            <span className={styles.filterIcon} aria-hidden="true">
              <FiGrid />
            </span>
            <span className={styles.filterName}>Todas</span>
          </button>

          {brands.map((brand) => (
            <button
              key={brand.id}
              type="button"
              className={`${styles.filterItem} ${activeBrand === brand.id ? styles.active : ''}`}
              onClick={() => onSelect(brand.id)}
              aria-pressed={activeBrand === brand.id}
            >
              <span className={styles.filterIcon} aria-hidden="true">
                {brandLogos[brand.name] ? (
                  <img src={brandLogos[brand.name]} alt="" className={styles.brandLogo} />
                ) : (
                  <span className={styles.brandInitial}>
                    {brand.name === 'Louis Vuitton' ? 'LV' : brand.name.charAt(0)}
                  </span>
                )}
              </span>
              <span className={styles.filterName}>{brand.name}</span>
            </button>
          ))}
        </motion.div>
      </div>
    </MotionConfig>
  )
}
