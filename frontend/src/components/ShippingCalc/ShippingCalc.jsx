import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FiTruck } from 'react-icons/fi'
import api from '../../services/api'
import styles from './ShippingCalc.module.css'

export default function ShippingCalc() {
  const [cep, setCep] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const formatCep = (v) => {
    const nums = v.replace(/\D/g, '').slice(0, 8)
    return nums.length > 5 ? `${nums.slice(0, 5)}-${nums.slice(5)}` : nums
  }

  const handleCalc = async () => {
    const clean = cep.replace(/\D/g, '')
    if (clean.length !== 8) {
      setError('CEP deve ter 8 dígitos')
      return
    }
    setError('')
    setLoading(true)
    setResult(null)
    try {
      const { data } = await api.post('/shipping/calculate', { cep: clean })
      setResult(data)
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao calcular frete')
    } finally {
      setLoading(false)
    }
  }

  const formatPrice = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <FiTruck /> Calcular Frete
      </div>
      <div className={styles.inputRow}>
        <input
          className={styles.cepInput}
          value={cep}
          onChange={e => setCep(formatCep(e.target.value))}
          placeholder="00000-000"
          maxLength={9}
          onKeyDown={e => e.key === 'Enter' && handleCalc()}
        />
        <button className={styles.calcBtn} onClick={handleCalc} disabled={loading}>
          {loading ? '...' : 'OK'}
        </button>
      </div>
      {error && <p className={styles.error}>{error}</p>}

      <AnimatePresence>
        {result && (
          <motion.div className={styles.results} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <p className={styles.address}>
              {result.address.city}/{result.address.state}
              {result.address.neighborhood && ` - ${result.address.neighborhood}`}
            </p>
            {result.options.map((opt, i) => (
              <div key={i} className={styles.option}>
                <div className={styles.optionLeft}>
                  <span className={styles.optionType}>{opt.type}</span>
                  <span className={styles.optionDays}>{opt.days}</span>
                </div>
                <span className={styles.optionPrice}>{formatPrice(opt.price)}</span>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
