import { useState, useEffect } from 'react'
import api from '../../services/api'
import styles from './PromotionTicker.module.css'

export default function PromotionTicker({ position = 'top' }) {
  const [tickers, setTickers] = useState([])
  const [settings, setSettings] = useState({})

  useEffect(() => {
    api.get('/tickers').then(({ data }) => setTickers(data)).catch(() => {})
    api.get('/settings').then(({ data }) => setSettings(data)).catch(() => {})
  }, [])

  if (tickers.length === 0 || settings.ticker_enabled !== 'true') return null

  const speed = settings.ticker_speed || '20s'
  const bg = settings.ticker_bg_color || '#DC2626'
  const textColor = settings.ticker_text_color || '#FFFFFF'
  const showBottom = settings.ticker_double === 'true'

  const tickerContent = tickers.map(t => (
    <span key={t.id} className={styles.tickerItem} style={{ color: t.color || textColor }}>
      {t.emoji && <span className={styles.emoji}>{t.emoji}</span>}
      {t.text}
    </span>
  ))

  // Duplicate content for seamless loop
  const duplicated = (
    <>
      <div className={styles.tickerTrack}>{tickerContent}{tickerContent}{tickerContent}</div>
    </>
  )

  return (
    <div className={`${styles.tickerWrap} ${styles[position]}`} style={{ '--ticker-speed': speed, '--ticker-bg': bg, '--ticker-color': textColor }}>
      <div className={styles.tickerLine}>
        <div className={styles.tickerScroll}>{duplicated}</div>
      </div>
      {showBottom && (
        <div className={`${styles.tickerLine} ${styles.tickerReverse}`}>
          <div className={styles.tickerScroll}>{duplicated}</div>
        </div>
      )}
    </div>
  )
}
