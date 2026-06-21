import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FiTruck, FiCheckCircle } from 'react-icons/fi'
import api from '../../services/api'
import styles from './ShippingEstimate.module.css'

const formatCep = (v) => {
  const nums = v.replace(/\D/g, '').slice(0, 8)
  return nums.length > 5 ? `${nums.slice(0, 5)}-${nums.slice(5)}` : nums
}
const fmtPrice = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0)

export default function ShippingEstimate({ productId }) {
  const [cep, setCep] = useState(() => formatCep(sessionStorage.getItem('last_cep') || ''))
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const lastCalc = useRef(null)

  const calcular = useCallback(async () => {
    const clean = cep.replace(/\D/g, '')
    if (clean.length !== 8 || !productId) return
    lastCalc.current = clean
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const { data } = await api.get('/shipping/estimate', { params: { product_id: productId, cep: clean } })
      setResult(data)
      sessionStorage.setItem('last_cep', clean)
    } catch (err) {
      setError(err?.response?.data?.error || 'CEP não encontrado. Verifique e tente novamente.')
    } finally {
      setLoading(false)
    }
  }, [cep, productId])

  // Dispara automaticamente ao completar o CEP (8 dígitos).
  useEffect(() => {
    const clean = cep.replace(/\D/g, '')
    if (clean.length === 8 && clean !== lastCalc.current) calcular()
  }, [cep, calcular])

  const handleCepChange = (e) => {
    setCep(formatCep(e.target.value))
    setError(null)
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.shippingWidget}>
        <FiTruck />
        <input
          placeholder="Digite seu CEP"
          maxLength={9}
          value={cep}
          onChange={handleCepChange}
          inputMode="numeric"
          onKeyDown={e => e.key === 'Enter' && calcular()}
        />
        <button onClick={calcular} disabled={cep.replace(/\D/g, '').length < 8 || loading}>
          {loading ? '...' : 'Calcular'}
        </button>
      </div>

      <AnimatePresence>
        {result && (
          <motion.div
            className={`${styles.shippingResult} ${result.is_free ? styles.free : styles.paid}`}
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
          >
            {result.is_free ? (
              <><FiCheckCircle aria-hidden /> Frete GRÁTIS para seu CEP!</>
            ) : (
              <><FiTruck aria-hidden /> {result.name}: {fmtPrice(result.price)} | {result.estimated_days_min}-{result.estimated_days_max} dias úteis</>
            )}
          </motion.div>
        )}
        {error && (
          <motion.div className={`${styles.shippingResult} ${styles.error}`}
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      <a className={styles.cepLink} href="https://buscacepinter.correios.com.br/app/endereco/index.php" target="_blank" rel="noopener noreferrer">
        Não sei meu CEP
      </a>
    </div>
  )
}
