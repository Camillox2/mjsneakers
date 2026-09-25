import { useState, useEffect, useMemo, useId } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FiAlertCircle, FiAlertTriangle, FiCheck } from 'react-icons/fi'
import api from '../../services/api'
import SizeGuide from '../SizeGuide/SizeGuide'
import styles from './SizeSelector.module.css'

const EASE = [0.22, 1, 0.36, 1]

// Exemplar de amostra (id "amostra-...") não existe no backend.
const isSampleId = (id) => typeof id === 'string' && id.startsWith('amostra-')

/*
 * Grade visual de tamanhos com disponibilidade real de estoque.
 * Busca GET /stock/product/:id/sizes -> [{ size, stock, available }].
 * Se a rota ainda não existir, cai no fallback de `fallbackSizes`
 * (tamanhos do produto, tratados como disponíveis) para a loja seguir funcionando.
 * Amostras usam direto o `fallbackSizes`, sem chamar a API.
 * `error`: aviso quando a pessoa tenta comprar sem escolher (a grade
 * chacoalha e o aviso aparece embaixo dela); `errorTick` muda a cada
 * tentativa, para a grade chacoalhar de novo.
 */
export default function SizeSelector({ productId, fallbackSizes, selected, onSelect, error = '', errorTick = 0 }) {
  const [sizesStock, setSizesStock] = useState(null) // null = carregando
  const [notifyFor, setNotifyFor] = useState(null)   // tamanho com form de aviso aberto
  const [email, setEmail] = useState('')
  const [notified, setNotified] = useState({})       // { [size]: true }
  const [sending, setSending] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const labelId = useId()
  const emailId = useId()
  const errorId = useId()
  const sample = isSampleId(productId)

  useEffect(() => {
    let alive = true
    setSizesStock(null)
    setNotifyFor(null)
    setNotified({})
    if (!productId || sample) return
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
  }, [productId, sample]) // eslint-disable-line react-hooks/exhaustive-deps

  const list = useMemo(() => {
    if (sizesStock && sizesStock.length) return sizesStock
    return (fallbackSizes || []).map(size => ({ size: String(size), stock: null, available: null }))
  }, [sizesStock, fallbackSizes])

  const selectedInfo = list.find(s => s.size === String(selected))
  const selectedScarce = selectedInfo && selectedInfo.available != null &&
    selectedInfo.available > 0 && selectedInfo.available < 5
  const anyScarce = list.some(s => s.available != null && s.available > 0 && s.available < 5)

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
    if (sample) return
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return
    setSending(true)
    try {
      // com o tamanho, o aviso sai quando aquele número volta (não qualquer um)
      await api.post('/stock-alerts/subscribe', { product_id: productId, size: String(size), email: email.trim().toLowerCase() })
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
      <div className={styles.head}>
        <span className={styles.label} id={labelId}>
          Tamanho{selected ? <span className={styles.current}> {selected}</span> : null}
        </span>
        <button type="button" className={styles.guideBtn} onClick={() => setGuideOpen(true)}>
          Guia de tamanhos
        </button>
      </div>

      <div
        key={error ? `erro-${errorTick}` : 'grade'}
        className={`${styles.grid} ${error ? styles.gridError : ''}`}
        role="group"
        aria-labelledby={labelId}
        aria-describedby={error ? errorId : undefined}
      >
        {list.map((item) => {
          const isOut = item.available === 0
          const isScarce = item.available != null && item.available > 0 && item.available < 5
          const isSel = String(selected) === item.size
          const status = isOut ? ', esgotado' : isScarce ? `, últimas ${item.available}` : ''
          return (
            <button
              key={item.size}
              type="button"
              className={`${styles.chip} ${isSel ? styles.selected : ''} ${isOut ? styles.out : ''}`}
              onClick={() => handleClick(item)}
              aria-pressed={isSel}
              aria-disabled={isOut}
              aria-label={`Tamanho ${item.size}${status}`}
            >
              {item.size}
              {isScarce && <span className={styles.scarceDot} aria-hidden />}
            </button>
          )
        })}
      </div>

      {error && (
        <p className={styles.error} id={errorId} role="alert">
          <FiAlertCircle aria-hidden /> {error}
        </p>
      )}

      {anyScarce && !selectedScarce && (
        <p className={styles.legend}><span className={styles.legendDot} aria-hidden /> Poucas unidades</p>
      )}

      {selectedScarce && (
        <motion.p
          className={styles.scarceWarn}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: EASE }}
        >
          <FiAlertTriangle aria-hidden /> Só restam {selectedInfo.available} no tamanho {selectedInfo.size}.
        </motion.p>
      )}

      <AnimatePresence>
        {notifyFor && (
          <motion.div
            className={styles.notifyBox}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
          >
            <div className={styles.notifyInner}>
              {notified[notifyFor] ? (
                <span className={styles.notifyDone}>
                  <FiCheck aria-hidden /> Pronto. Avisamos no seu e-mail quando o {notifyFor} voltar.
                </span>
              ) : (
                <>
                  <label className={styles.notifyLabel} htmlFor={emailId}>
                    O {notifyFor} esgotou. Deixe seu e-mail e avisamos quando voltar.
                  </label>
                  <div className={styles.notifyRow}>
                    <input
                      id={emailId}
                      className={styles.notifyInput}
                      type="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      enterKeyHint="send"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleNotify(notifyFor)}
                    />
                    <button
                      type="button"
                      className={`pz-btn ${styles.notifyBtn}`}
                      onClick={() => handleNotify(notifyFor)}
                      disabled={sending}
                    >
                      {sending ? 'Enviando…' : 'Me avise'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <SizeGuide isOpen={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  )
}
