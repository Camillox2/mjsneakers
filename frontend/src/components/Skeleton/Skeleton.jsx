import { motion } from 'framer-motion'
import styles from './Skeleton.module.css'

export default function SkeletonGrid({ count = 8 }) {
  return (
    <div className={styles.skeletonGrid}>
      {Array.from({ length: count }, (_, i) => (
        <motion.div
          key={i}
          className={styles.skeletonCard}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: i * 0.05 }}
        >
          <div className={styles.skeletonImage} />
          <div className={styles.skeletonBody}>
            <div className={styles.skeletonLine} />
            <div className={styles.skeletonLine} />
            <div className={styles.skeletonLine} />
          </div>
        </motion.div>
      ))}
    </div>
  )
}
