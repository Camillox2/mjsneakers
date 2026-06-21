import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FiAlertTriangle, FiCheck } from 'react-icons/fi'
import api from '../../services/api'
import { parseSizes } from '../../utils/sizes'
import styles from './SizeSelector.module.css'

/*
 * Grade visual de tamanhos com disponibilidade real de estoque.
 * Busca GET /stock/product/:id/sizes -> [{ size, stock, available }].
 * Se a rota ainda não existir, cai no fallback de `fallbackSizes`
 * (tamanhos do produto, tratados como disponíveis) para a loja seguir funcionando.
 */
export default function SizeSelector({ productId, fallbackSizes, selected, onSelect }) {
  const [sizesStock, setSizesStock] = useState(null) // null = carregando
  const [notifyFor, setNotifyFor] = useState(null)   // tamanho com form de aviso aberto
  const [email, setEmail] = useState('')
  const [notified, setNotified] = useState({})       // { [size]: true }
  const [sending, setSending] = useState(false)

  useEffect(() => {
    let alive = true
    setSizesStock(null)
    setNotifyFor(null)
    setNotified({})
    if (!productId) return
    api.get(`/stock/product/${productId}/sizes`)
      .then(({ data }) => {
        if (!alive) return
        const list = Array.isArray(data) ? data : (data?.sizes || [])
        setSizesStock(list.map(s => ({
          size: String(s.size),
          stock: Number(s.stock ?? 0),
          available: Number(s.available ?? s.stock ?? 0),
        })))
      })
      .catch(() => {
        if (!alive) return
        // Fallback: sem dados de estoque por tamanho, assume disponível.
        setSizesStock((fallbackSizes || []).map(size => ({
          size: String(size), stock: null, available: null,
        })))
      })
    return () => { alive = false }
  }, [productId]) // eslint-disable-line react-hooks/exhaustive-deps

  const list = useMemo(() => {
    if (sizesStock && sizesStock.length) return sizesStock
    return (fallbackSizes || []).map(size => ({ size: String(size), stock: null, available: null }))
  }, [sizesStock, fallbackSizes])

  const selectedInfo = list.find(s => s.size === String(selected))
  const selectedScarce = selectedInfo && selectedInfo.available != null &&
    selectedInfo.available > 0 && selectedInfo.available < 5

  const handleClick = (item) => {
    const isOut = item.available === 0
    if (isOut) {
      setNotifyFor(prev => (prev === item.size ? null : item.size))
      return
    }
    setNotifyFor(null)
    onSelect(item.size)
  }

  const handleNotify = async (size) => {
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return
    setSending(true)
    try {
      await api.post('/stock-alerts/subscribe', { product_id: productId, email: email.trim().toLowerCase() })
      setNotified(prev => ({ ...prev, [size]: true }))
      setNotifyFor(null)
      setEmail('')
    } catch {
      /* mantém o form aberto para nova tentativa */
    } finally {
      setSending(false)
    }
  }

  if (sizesStock === null && (!fallbackSizes || fallbackSizes.length === 0)) {
    return <div className={styles.skeletonRow} aria-hidden />
  }
  if (!list.length) return null

  return (
    <div className={styles.wrap}>
      <span className={styles.label}>Tamanho</span>
      <div className={styles.grid}>
        {list.map((item) => {
          const isOut = item.available === 0
          const isScarce = item.available != null && item.available > 0 && item.available < 5
          const isSel = String(selected) === item.size
          return (
            <div key={item.size} className={styles.cell}>
              {isScarce && <span className={styles.scarceBadge}>Últimas {item.available}!</span>}
              <button
                type="button"
                className={`${styles.sizeBtn} ${isSel ? styles.selected : ''} ${isScarce ? styles.scarce : ''} ${isOut ? styles.disabled : ''}`}
                onClick={() => handleClick(item)}
                aria-pressed={isSel}
                aria-disabled={isOut}
              >
                {item.size}
              </button>
            </div>
          )
        })}
      </div>

      {selectedScarce && (
        <motion.p
          className={styles.scarceWarn}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <FiAlertTriangle aria-hidden /> Apenas {selectedInfo.available} unidades disponíveis neste tamanho!
        </motion.p>
      )}

      <AnimatePresence>
        {notifyFor && (
          <motion.div
            className={styles.notifyBox}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            {notified[notifyFor] ? (
              <span className={styles.notifyDone}><FiCheck aria-hidden /> Você será avisado</span>
            ) : (
              <>
                <label className={styles.notifyLabel}>
                  Avise-me quando o tamanho {notifyFor} estiver disponível
                </label>
                <div className={styles.notifyRow}>
                  <input
                    className={styles.notifyInput}
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleNotify(notifyFor)}
                  />
                  <button
                    type="button"
                    className={styles.notifyBtn}
                    onClick={() => handleNotify(notifyFor)}
                    disabled={sending}
                  >
                    {sending ? '...' : 'Quero ser avisado'}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
