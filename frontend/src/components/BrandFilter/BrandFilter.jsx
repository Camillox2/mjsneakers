import { motion } from 'framer-motion'
import { FiGrid } from 'react-icons/fi'
import nikelogo from '../../assets/logo/nikelogo.png'
import adidaslogo from '../../assets/logo/adidas logo.jpg'
import pumalogo from '../../assets/logo/pumalogo.jpg'
import nblogo from '../../assets/logo/newbalance logo.png'
import styles from './BrandFilter.module.css'

const brandLogos = {
  'Nike': nikelogo,
  'Adidas': adidaslogo,
  'Puma': pumalogo,
  'New Balance': nblogo,
}

export default function BrandFilter({ brands, activeBrand, onSelect }) {
  return (
    <div className={styles.filtersSection}>
      <div className={styles.filtersContainer}>
        <motion.div
          className={styles.filtersScroll}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <motion.div
            className={`${styles.filterItem} ${activeBrand === null ? styles.active : ''} ${styles.allFilter}`}
            onClick={() => onSelect(null)}
            whileHover={{ scale: 1.05, y: -3 }}
            whileTap={{ scale: 0.95 }}
            layout
          >
            <div className={styles.filterIcon}>
              <FiGrid size={22} />
            </div>
            <span className={styles.filterName}>Todos</span>
          </motion.div>

          {brands.map((brand, index) => (
            <motion.div
              key={brand.id}
              className={`${styles.filterItem} ${activeBrand === brand.id ? styles.active : ''}`}
              onClick={() => onSelect(brand.id)}
              whileHover={{ scale: 1.05, y: -3 }}
              whileTap={{ scale: 0.95 }}
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.08, duration: 0.4 }}
              layout
            >
              <div className={styles.filterIcon}>
                {brandLogos[brand.name] ? (
                  <img
                    src={brandLogos[brand.name]}
                    alt={brand.name}
                    className={styles.brandLogo}
                  />
                ) : (
                  <span className={styles.brandInitial}>
                    {brand.name === 'Louis Vuitton' ? 'LV' : brand.name.charAt(0)}
                  </span>
                )}
              </div>
              <span className={styles.filterName}>{brand.name}</span>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  )
}
