import { useState, useEffect } from 'react'
import styles from './CountdownTimer.module.css'

function pad(n) { return String(n).padStart(2, '0') }

export default function CountdownTimer({ endDate, compact = false }) {
  const [timeLeft, setTimeLeft] = useState(null)

  useEffect(() => {
    if (!endDate) return
    const target = new Date(endDate).getTime()

    function calc() {
      const diff = target - Date.now()
      if (diff <= 0) { setTimeLeft(null); return }
      setTimeLeft({
        d: Math.floor(diff / 86400000),
        h: Math.floor((diff % 86400000) / 3600000),
        m: Math.floor((diff % 3600000) / 60000),
        s: Math.floor((diff % 60000) / 1000),
      })
    }

    calc()
    const interval = setInterval(calc, 1000)
    return () => clearInterval(interval)
  }, [endDate])

  if (!timeLeft) return null

  if (compact) {
    return (
      <span className={styles.compact}>
        ⏱ {timeLeft.d > 0 ? `${timeLeft.d}d ` : ''}{pad(timeLeft.h)}:{pad(timeLeft.m)}:{pad(timeLeft.s)}
      </span>
    )
  }

  return (
    <div className={styles.timer}>
      <span className={styles.label}>Oferta termina em:</span>
      <div className={styles.blocks}>
        {timeLeft.d > 0 && (
          <div className={styles.block}>
            <span className={styles.num}>{pad(timeLeft.d)}</span>
            <span className={styles.unit}>dias</span>
          </div>
        )}
        <div className={styles.block}>
          <span className={styles.num}>{pad(timeLeft.h)}</span>
          <span className={styles.unit}>h</span>
        </div>
        <div className={styles.block}>
          <span className={styles.num}>{pad(timeLeft.m)}</span>
          <span className={styles.unit}>min</span>
        </div>
        <div className={styles.block}>
          <span className={styles.num}>{pad(timeLeft.s)}</span>
          <span className={styles.unit}>seg</span>
        </div>
      </div>
    </div>
  )
}
