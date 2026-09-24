import { useState, useEffect, Fragment } from 'react'
import styles from './PromotionTicker.module.css'
import { cachedGet, TTL } from '../../services/cache'

// Faixa corrida fina com texto cromado. Cor de fundo, cor do texto e emoji
// cadastrados no admin ficam de fora: a loja tem uma identidade só.
// Mínimo de chamadas por volta, para a faixa nunca ficar com buraco em tela larga.
const MIN_ITEMS_PER_LOOP = 8

export default function PromotionTicker({ position = 'top' }) {
  const [tickers, setTickers] = useState([])
  const [settings, setSettings] = useState({})

  useEffect(() => {
    cachedGet('/tickers', { ttl: TTL.config, persist: true }).then((data) => setTickers(Array.isArray(data) ? data : [])).catch(() => {})
    cachedGet('/settings', { ttl: TTL.config, persist: true }).then((data) => setSettings(data || {})).catch(() => {})
  }, [])

  if (tickers.length === 0 || settings.ticker_enabled !== 'true') return null

  const showBottom = settings.ticker_double === 'true'

  const reps = Math.max(1, Math.ceil(MIN_ITEMS_PER_LOOP / tickers.length))
  const loop = Array.from({ length: reps }, () => tickers).flat()

  // ticker_speed é o tempo de uma volta pela lista (ex.: "20s"); com a lista
  // repetida, a volta fica proporcionalmente mais longa e a velocidade não muda
  const raw = String(settings.ticker_speed || '20s')
  const base = parseFloat(raw) || 20
  const secs = (/ms\s*$/.test(raw) ? base / 1000 : base) * reps

  // Duas metades idênticas: a trilha anda meia largura e recomeça sem emenda
  const group = () => (
    <div className={styles.group}>
      {loop.map((t, i) => (
        <Fragment key={`${t.id ?? i}-${i}`}>
          <span className={styles.tickerItem}>{t.text}</span>
          <span className={styles.sep} aria-hidden="true" />
        </Fragment>
      ))}
    </div>
  )

  const line = (reverse) => (
    <div className={`${styles.tickerLine} ${reverse ? styles.tickerReverse : ''}`} aria-hidden="true">
      <div className={styles.tickerTrack}>
        {group()}
        {group()}
      </div>
    </div>
  )

  return (
    <div
      className={`${styles.tickerWrap} ${styles[position] || ''}`}
      style={{ '--ticker-speed': `${secs}s` }}
      role="region"
      aria-label="Avisos da loja"
    >
      {/* leitor de tela ouve cada aviso uma vez; a faixa animada fica oculta para ele */}
      <ul className="pz-visually-hidden">
        {tickers.map((t, i) => <li key={t.id ?? i}>{t.text}</li>)}
      </ul>
      {line(false)}
      {showBottom && line(true)}
    </div>
  )
}
