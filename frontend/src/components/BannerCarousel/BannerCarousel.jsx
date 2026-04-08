import { useState, useEffect, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi'
import api from '../../services/api'
import { getImageUrl } from '../../utils/imageHelper'
import styles from './BannerCarousel.module.css'

const speedMap = {
  ultra_slow: 8000,
  slow: 5000,
  fast: 3000,
  super_fast: 1500,
}

const effectDurationMap = {
  ultra_slow: '6s',
  slow: '4s',
  fast: '2s',
  super_fast: '1s',
}

/* Animation variants for each transition type */
const getVariants = (type) => {
  switch (type) {
    case 'slide':
      return {
        enter: (dir) => ({ x: dir > 0 ? '100%' : '-100%', opacity: 0 }),
        center: { x: 0, opacity: 1 },
        exit: (dir) => ({ x: dir > 0 ? '-100%' : '100%', opacity: 0 }),
      }
    case 'zoom':
      return {
        enter: { scale: 1.3, opacity: 0 },
        center: { scale: 1, opacity: 1 },
        exit: { scale: 0.7, opacity: 0 },
      }
    case 'wave':
      return {
        enter: { scaleX: 0, opacity: 0, originX: 0 },
        center: { scaleX: 1, opacity: 1 },
        exit: { scaleX: 0, opacity: 0, originX: 1 },
      }
    case 'flip':
      return {
        enter: { rotateY: 90, opacity: 0 },
        center: { rotateY: 0, opacity: 1 },
        exit: { rotateY: -90, opacity: 0 },
      }
    case 'fade':
    default:
      return {
        enter: { opacity: 0 },
        center: { opacity: 1 },
        exit: { opacity: 0 },
      }
  }
}

function EffectOverlay({ type, speed }) {
  const duration = effectDurationMap[speed] || '4s'
  const style = { '--effect-duration': duration }

  switch (type) {
    case 'sparkle': return <div className={styles.effectSparkle} style={style} />
    case 'comet': return <div className={styles.effectComet} style={style} />
    case 'glow_pulse': return <div className={styles.effectGlowPulse} style={style} />
    case 'neon_border': return <div className={styles.effectNeonBorder} style={style} />
    case 'light_sweep': return <div className={styles.effectLightSweep} style={style} />
    default: return null
  }
}

export default function BannerCarousel() {
  const [banners, setBanners] = useState([])
  const [current, setCurrent] = useState(0)
  const [direction, setDirection] = useState(1)

  useEffect(() => {
    api.get('/banners').then(({ data }) => setBanners(data)).catch(() => {})
  }, [])

  const goTo = useCallback((idx, dir) => {
    setDirection(dir)
    setCurrent(idx)
  }, [])

  const next = useCallback(() => {
    if (banners.length <= 1) return
    goTo((current + 1) % banners.length, 1)
  }, [current, banners.length, goTo])

  const prev = useCallback(() => {
    if (banners.length <= 1) return
    goTo((current - 1 + banners.length) % banners.length, -1)
  }, [current, banners.length, goTo])

  // Auto-advance
  useEffect(() => {
    if (banners.length <= 1) return
    const speed = banners[current]?.effect_speed || 'slow'
    const interval = setInterval(next, speedMap[speed] || 5000)
    return () => clearInterval(interval)
  }, [current, banners, next])

  if (banners.length === 0) return null

  const banner = banners[current]
  const variants = getVariants(banner?.animation_type)

  return (
    <div className={styles.carousel}>
      <div className={styles.bannerWrap} style={{ perspective: banner?.animation_type === 'flip' ? '1200px' : undefined }}>
        <AnimatePresence custom={direction} mode="wait">
          <motion.div
            key={current}
            className={styles.bannerSlide}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
          >
            {banner.media_type === 'video' && banner.video_url ? (
              <video className={styles.bannerVideo} src={banner.video_url} autoPlay muted loop playsInline />
            ) : (
              <img className={styles.bannerImg} src={getImageUrl(banner.image_url, banner.title || 'Banner')} alt={banner.title} />
            )}
          </motion.div>
        </AnimatePresence>

        <EffectOverlay type={banner.effect_type} speed={banner.effect_speed} />

        {(banner.title || banner.subtitle) && (
          <div className={styles.bannerOverlay}>
            <AnimatePresence mode="wait">
              <motion.div key={current} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                {banner.title && <h2 className={styles.bannerTitle}>{banner.title}</h2>}
                {banner.subtitle && <p className={styles.bannerSub}>{banner.subtitle}</p>}
              </motion.div>
            </AnimatePresence>
          </div>
        )}

        {banners.length > 1 && (
          <>
            <button className={`${styles.arrow} ${styles.arrowLeft}`} onClick={prev}><FiChevronLeft /></button>
            <button className={`${styles.arrow} ${styles.arrowRight}`} onClick={next}><FiChevronRight /></button>
          </>
        )}

        {banners.length > 1 && (
          <div className={styles.dots}>
            {banners.map((_, i) => (
              <div key={i} className={`${styles.dot} ${i === current ? styles.activeDot : ''}`} onClick={() => goTo(i, i > current ? 1 : -1)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
