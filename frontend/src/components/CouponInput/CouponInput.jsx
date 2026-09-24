import { useState } from 'react'
import api from '../../services/api'
import styles from './CouponInput.module.css'
import { FiTag, FiX } from 'react-icons/fi'

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0)

export default function CouponInput({ subtotal, onApply, onRemove, appliedCoupon }) {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleApply = async () => {
    if (!code.trim()) return
    setLoading(true)
    setError('')
    try {
      const { data } = await api.post('/coupons/validate', {
        code: code.trim().toUpperCase(),
        orderTotal: subtotal
      })
      onApply && onApply({
        code: data.code,
        type: data.type,
        value: data.value,
        discount: data.discount
      })
    } catch (err) {
      setError(err.response?.data?.error || 'Esse cupom não vale. Confira o código.')
    } finally {
      setLoading(false)
    }
  }

  const handleRemove = () => {
    setCode('')
    setError('')
    onRemove && onRemove()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleApply()
  }

  if (appliedCoupon) {
    return (
      <div className={styles.applied}>
        <FiTag aria-hidden />
        <span className={styles.appliedCode}>{appliedCoupon.code}</span>
        <span className={styles.appliedDiscount}>-{fmt(appliedCoupon.discount)}</span>
        <button type="button" className={styles.removeBtn} onClick={handleRemove} aria-label="Remover cupom" title="Remover cupom">
          <FiX aria-hidden />
        </button>
      </div>
    )
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.inputRow}>
        <div className={styles.field}>
          <FiTag className={styles.icon} aria-hidden />
          <input
            className={styles.input}
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={handleKeyDown}
            placeholder="Cupom de desconto"
            aria-label="Cupom de desconto"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={30}
          />
        </div>
        <button type="button" className={styles.btn} onClick={handleApply} disabled={loading || !code.trim()}>
          {loading ? 'Aplicando…' : 'Aplicar'}
        </button>
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}
    </div>
  )
}
