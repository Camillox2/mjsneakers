import { useState } from 'react'
import api from '../../services/api'
import styles from './CouponInput.module.css'
import { FiTag, FiX } from 'react-icons/fi'

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
      setError(err.response?.data?.error || 'Cupom inválido')
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
        <FiTag />
        <span className={styles.appliedCode}>{appliedCoupon.code}</span>
        <span className={styles.appliedDiscount}>
          -R$ {appliedCoupon.discount.toFixed(2).replace('.', ',')}
        </span>
        <button className={styles.removeBtn} onClick={handleRemove} title="Remover cupom">
          <FiX />
        </button>
      </div>
    )
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.inputRow}>
        <FiTag className={styles.icon} />
        <input
          className={styles.input}
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={handleKeyDown}
          placeholder="Cupom de desconto"
          maxLength={30}
        />
        <button className={styles.btn} onClick={handleApply} disabled={loading || !code.trim()}>
          {loading ? '...' : 'Aplicar'}
        </button>
      </div>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  )
}
