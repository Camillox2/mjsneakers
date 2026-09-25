import { useState, useEffect, useRef, useCallback, useId } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FiTruck, FiCheckCircle } from 'react-icons/fi'
import api from '../../services/api'
import styles from './ShippingEstimate.module.css'

const EASE = [0.22, 1, 0.36, 1]

const formatCep = (v) => {
  const nums = v.replace(/\D/g, '').slice(0, 8)
  return nums.length > 5 ? `${nums.slice(0, 5)}-${nums.slice(5)}` : nums
}
const fmtPrice = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0)

// Exemplar de amostra (id "amostra-...") não existe no backend: sem estimativa.
const isSampleId = (id) => typeof id === 'string' && id.startsWith('amostra-')

const readLastCep = () => {
  try { return sessionStorage.getItem('last_cep') || '' } catch { return '' }
}

export default function ShippingEstimate({ productId }) {
  const [cep, setCep] = useState(() => formatCep(readLastCep()))
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const lastCalc = useRef(null)
  const inputId = useId()
  const sample = isSampleId(productId)

  const calcular = useCallback(async () => {
    const clean = cep.replace(/\D/g, '')
    if (clean.length !== 8 || !productId || sample) return
    lastCalc.current = clean
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const { data } = await api.get('/shipping/estimate', { params: { product_id: productId, cep: clean } })
      setResult(data)
      try { sessionStorage.setItem('last_cep', clean) } catch { /* sem storage, segue */ }
    } catch (err) {
      setError(err?.response?.data?.error || 'Não achamos esse CEP. Confira os números e tente de novo.')
    } finally {
      setLoading(false)
    }
  }, [cep, productId, sample])

  // Dispara automaticamente ao completar o CEP (8 dígitos).
  useEffect(() => {
    const clean = cep.replace(/\D/g, '')
    if (clean.length === 8 && clean !== lastCalc.current) calcular()
  }, [cep, calcular])

  const handleCepChange = (e) => {
    setCep(formatCep(e.target.value))
    setError(null)
  }

  if (sample) return null

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <label className={styles.label} htmlFor={inputId}>Frete e prazo</label>
        <a className={styles.cepLink} href="https://buscacepinter.correios.com.br/app/endereco/index.php" target="_blank" rel="noopener noreferrer">
          Não sei meu CEP
        </a>
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <FiTruck aria-hidden />
          <input
            id={inputId}
            placeholder="Seu CEP"
            maxLength={9}
            value={cep}
            onChange={handleCepChange}
            inputMode="numeric"
            autoComplete="postal-code"
            enterKeyHint="go"
            onKeyDown={e => e.key === 'Enter' && calcular()}
          />
        </div>
        <button
          type="button"
          className={styles.calcBtn}
          onClick={calcular}
          disabled={cep.replace(/\D/g, '').length < 8 || loading}
        >
          {loading ? 'Calculando…' : 'Calcular'}
        </button>
      </div>

      <div aria-live="polite">
        <AnimatePresence>
          {result && (
            <motion.div
              className={styles.resultBox}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: EASE }}
            >
              {result.is_free ? (
                <p className={`${styles.result} ${styles.free}`}>
                  <FiCheckCircle aria-hidden /> Frete grátis para esse CEP.
                </p>
              ) : (
                <p className={styles.result}>
                  <span className={styles.resultMain}>
                    <span className={styles.resultName}>{result.name}</span>
                    <span className={styles.resultDays}>
                      {result.estimated_days_min} a {result.estimated_days_max} dias úteis
                    </span>
                  </span>
                  <span className={styles.resultPrice}>{fmtPrice(result.price)}</span>
                </p>
              )}
            </motion.div>
          )}
          {error && (
            <motion.div
              className={styles.resultBox}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: EASE }}
            >
              <p className={`${styles.result} ${styles.error}`}>{error}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
