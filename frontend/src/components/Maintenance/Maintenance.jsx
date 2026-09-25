import { useEffect, useRef } from 'react'
import { FiMail } from 'react-icons/fi'
import { BRAND } from '../../config/brand'
import { StarField } from '../../lib/starfield'
import { prefersReducedMotion } from '../../lib/motion'
import { MQ, matches } from '../../lib/breakpoints'
import ChromeLogo from '../ChromeLogo/ChromeLogo'
import styles from './Maintenance.module.css'

const DEFAULT_MESSAGE = 'Estamos ajustando a vitrine para o próximo drop. Volte daqui a pouco.'

// Loja em manutenção (maintenance_mode nas configurações): o mesmo céu
// estrelado da abertura, o logo cromado e o recado do admin. O /admin segue
// funcionando por fora disto.
export default function Maintenance({ message, email }) {
  const skyRef = useRef(null)

  useEffect(() => {
    const canvas = skyRef.current
    if (!canvas) return undefined
    const phone = matches(MQ.phone)
    const stars = new StarField(canvas, phone ? 120 : 220)
    const born = performance.now()
    const still = prefersReducedMotion()
    let raf = 0
    const ro = new ResizeObserver(() => {
      stars.resize()
      if (still) stars.draw(0, 0, 1)
    })
    ro.observe(canvas)
    if (still) {
      stars.draw(0, 0, 1)
    } else {
      const tick = (now) => {
        raf = requestAnimationFrame(tick)
        if (document.hidden) return
        stars.draw(now / 1000, 0, Math.min(1, (now - born) / 1500))
      }
      raf = requestAnimationFrame(tick)
    }
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  const text = String(message || '').trim() || DEFAULT_MESSAGE

  return (
    <main className={styles.page}>
      <title>{`${BRAND.name} | Voltamos já`}</title>
      <canvas ref={skyRef} className={styles.sky} aria-hidden="true" />
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.content}>
        <ChromeLogo className={styles.logo} />
        <h1 className={styles.title}>Voltamos já</h1>
        <p className={styles.message}>{text}</p>
        {email && (
          <a className={styles.contact} href={`mailto:${email}`}>
            <FiMail aria-hidden="true" />
            <span>{email}</span>
          </a>
        )}
      </div>
    </main>
  )
}
