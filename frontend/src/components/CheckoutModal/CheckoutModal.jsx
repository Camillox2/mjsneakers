import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FiX, FiUser, FiMapPin, FiTruck, FiCheck, FiChevronLeft, FiChevronRight, FiLoader } from 'react-icons/fi'
import api from '../../services/api'
import styles from './CheckoutModal.module.css'

const STEPS = ['Dados', 'Endereço', 'Frete', 'Revisão']

export default function CheckoutModal({ isOpen, onClose, cartItems, coupon, onSuccess }) {
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [shippingOptions, setShippingOptions] = useState([])
  const [shippingLoading, setShippingLoading] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    name: '', email: '', phone: '',
    cep: '', street: '', number: '', complement: '',
    neighborhood: '', city: '', state: '',
    shipping_type: '', shipping_price: 0, shipping_days: ''
  })

  const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }))

  const subtotal = cartItems.reduce((s, i) => {
    const discount = Math.min(Math.max(Number(i.discount_percentage || 0), 0), 90)
    const price = discount > 0 ? Number(i.price) * (1 - discount / 100) : Number(i.price)
    return s + price * i.quantity
  }, 0)

  const couponDiscount = coupon?.discount || 0
  const shipping = Number(form.shipping_price) || 0
  const total = subtotal - couponDiscount + shipping

  /* ---- Step validation ---- */
  const validateStep = () => {
    setError('')
    if (step === 0) {
      if (!form.name.trim() || !form.email.trim() || !form.phone.trim()) {
        setError('Preencha todos os campos')
        return false
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
        setError('E-mail inválido')
        return false
      }
    }
    if (step === 1) {
      if (!form.cep || !form.street || !form.number || !form.neighborhood || !form.city || !form.state) {
        setError('Preencha todos os campos obrigatórios')
        return false
      }
    }
    if (step === 2) {
      if (!form.shipping_type) {
        setError('Selecione uma opção de frete')
        return false
      }
    }
    return true
  }

  const next = () => {
    if (!validateStep()) return
    if (step === 1) fetchShipping()
    setStep(s => Math.min(s + 1, 3))
  }
  const back = () => { setError(''); setStep(s => Math.max(s - 1, 0)) }

  /* ---- CEP auto-fill ---- */
  const handleCepBlur = async () => {
    const cep = form.cep.replace(/\D/g, '')
    if (cep.length !== 8) return
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
      const data = await res.json()
      if (!data.erro) {
        setForm(prev => ({
          ...prev,
          street: data.logradouro || prev.street,
          neighborhood: data.bairro || prev.neighborhood,
          city: data.localidade || prev.city,
          state: data.uf || prev.state
        }))
      }
    } catch {}
  }

  /* ---- Fetch shipping ---- */
  const fetchShipping = async () => {
    const cep = form.cep.replace(/\D/g, '')
    if (cep.length !== 8) return
    setShippingLoading(true)
    try {
      const { data } = await api.post('/shipping/calculate', { cep, products: cartItems })
      setShippingOptions(Array.isArray(data) ? data : (data.options || []))
    } catch {
      setShippingOptions([
        { type: 'PAC', price: 24.90, days: '8-12 dias úteis' },
        { type: 'SEDEX', price: 39.90, days: '3-5 dias úteis' }
      ])
    } finally {
      setShippingLoading(false)
    }
  }

  const selectShipping = (opt) => {
    setForm(prev => ({
      ...prev,
      shipping_type: opt.type,
      shipping_price: opt.price,
      shipping_days: opt.days
    }))
    setError('')
  }

  /* ---- Submit ---- */
  const handleSubmit = async () => {
    setLoading(true)
    setError('')
    try {
      const items = cartItems.map(i => ({
        product_id: i.id,
        size: i.selectedSize || i.size,
        quantity: i.quantity,
        price: Number(i.price)
      }))

      const payload = {
        customer_name: form.name.trim(),
        customer_email: form.email.trim(),
        customer_phone: form.phone.trim(),
        items,
        coupon_code: coupon?.code || null,
        shipping_type: form.shipping_type,
        shipping_price: shipping,
        address_cep: form.cep.replace(/\D/g, ''),
        address_street: form.street,
        address_number: form.number,
        address_complement: form.complement,
        address_neighborhood: form.neighborhood,
        address_city: form.city,
        address_state: form.state
      }

      const { data } = await api.post('/orders', payload)
      onSuccess && onSuccess(data)
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao finalizar pedido')
    } finally {
      setLoading(false)
    }
  }

  const formatPrice = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div className={styles.overlay} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
        <motion.div className={styles.modal} initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }} onClick={e => e.stopPropagation()}>
          <div className={styles.header}>
            <h2 className={styles.title}>Finalizar Pedido</h2>
            <button className={styles.closeBtn} onClick={onClose}><FiX /></button>
          </div>

          {/* Stepper */}
          <div className={styles.stepper}>
            {STEPS.map((label, i) => (
              <div key={label} className={`${styles.stepItem} ${i <= step ? styles.stepActive : ''} ${i < step ? styles.stepDone : ''}`}>
                <div className={styles.stepCircle}>
                  {i < step ? <FiCheck /> : i === 0 ? <FiUser size={14} /> : i === 1 ? <FiMapPin size={14} /> : i === 2 ? <FiTruck size={14} /> : <FiCheck size={14} />}
                </div>
                <span className={styles.stepLabel}>{label}</span>
              </div>
            ))}
          </div>

          <div className={styles.body}>
            {/* Step 0: Customer Data */}
            {step === 0 && (
              <div className={styles.fields}>
                <label className={styles.label}>Nome completo *
                  <input className={styles.input} value={form.name} onChange={set('name')} placeholder="João da Silva" />
                </label>
                <label className={styles.label}>E-mail *
                  <input className={styles.input} type="email" value={form.email} onChange={set('email')} placeholder="joao@email.com" />
                </label>
                <label className={styles.label}>Telefone / WhatsApp *
                  <input className={styles.input} value={form.phone} onChange={set('phone')} placeholder="(11) 99999-9999" />
                </label>
              </div>
            )}

            {/* Step 1: Address */}
            {step === 1 && (
              <div className={styles.fields}>
                <label className={styles.label}>CEP *
                  <input className={styles.input} value={form.cep} onChange={set('cep')} onBlur={handleCepBlur} placeholder="00000-000" maxLength={9} />
                </label>
                <label className={styles.label}>Rua *
                  <input className={styles.input} value={form.street} onChange={set('street')} placeholder="Rua exemplo" />
                </label>
                <div className={styles.row}>
                  <label className={styles.label}>Número *
                    <input className={styles.input} value={form.number} onChange={set('number')} placeholder="123" />
                  </label>
                  <label className={styles.label}>Complemento
                    <input className={styles.input} value={form.complement} onChange={set('complement')} placeholder="Apto 4B" />
                  </label>
                </div>
                <label className={styles.label}>Bairro *
                  <input className={styles.input} value={form.neighborhood} onChange={set('neighborhood')} placeholder="Centro" />
                </label>
                <div className={styles.row}>
                  <label className={styles.label}>Cidade *
                    <input className={styles.input} value={form.city} onChange={set('city')} placeholder="São Paulo" />
                  </label>
                  <label className={styles.label}>Estado *
                    <input className={styles.input} value={form.state} onChange={set('state')} placeholder="SP" maxLength={2} />
                  </label>
                </div>
              </div>
            )}

            {/* Step 2: Shipping */}
            {step === 2 && (
              <div className={styles.shippingSection}>
                {shippingLoading ? (
                  <div className={styles.shippingLoading}><FiLoader className={styles.spinner} /> Calculando frete...</div>
                ) : shippingOptions.length > 0 ? (
                  shippingOptions.map(opt => (
                    <div
                      key={opt.type}
                      className={`${styles.shippingOption} ${form.shipping_type === opt.type ? styles.shippingSelected : ''}`}
                      onClick={() => selectShipping(opt)}
                    >
                      <FiTruck />
                      <div className={styles.shippingInfo}>
                        <strong>{opt.type}</strong>
                        <span>{opt.days}</span>
                      </div>
                      <span className={styles.shippingPrice}>{formatPrice(opt.price)}</span>
                    </div>
                  ))
                ) : (
                  <p className={styles.noShipping}>Nenhuma opção de frete disponível. Verifique o CEP.</p>
                )}
              </div>
            )}

            {/* Step 3: Review */}
            {step === 3 && (
              <div className={styles.review}>
                <div className={styles.reviewSection}>
                  <h4>Dados pessoais</h4>
                  <p>{form.name} — {form.email}</p>
                  <p>{form.phone}</p>
                </div>
                <div className={styles.reviewSection}>
                  <h4>Endereço</h4>
                  <p>{form.street}, {form.number} {form.complement && `- ${form.complement}`}</p>
                  <p>{form.neighborhood} — {form.city}/{form.state}</p>
                  <p>CEP: {form.cep}</p>
                </div>
                <div className={styles.reviewSection}>
                  <h4>Itens ({cartItems.length})</h4>
                  {cartItems.map((item, idx) => (
                    <div key={idx} className={styles.reviewItem}>
                      <span>{item.name} (x{item.quantity})</span>
                      <span>{formatPrice(Number(item.price) * item.quantity)}</span>
                    </div>
                  ))}
                </div>
                <div className={styles.reviewTotals}>
                  <div className={styles.totalRow}><span>Subtotal</span><span>{formatPrice(subtotal)}</span></div>
                  {couponDiscount > 0 && <div className={styles.totalRow}><span>Cupom ({coupon?.code})</span><span className={styles.discountText}>-{formatPrice(couponDiscount)}</span></div>}
                  <div className={styles.totalRow}><span>Frete ({form.shipping_type})</span><span>{formatPrice(shipping)}</span></div>
                  <div className={`${styles.totalRow} ${styles.totalFinal}`}><span>Total</span><span>{formatPrice(total)}</span></div>
                </div>
              </div>
            )}

            {error && <p className={styles.error}>{error}</p>}
          </div>

          {/* Actions */}
          <div className={styles.actions}>
            {step > 0 && (
              <button className={styles.backBtn} onClick={back}><FiChevronLeft /> Voltar</button>
            )}
            {step < 3 ? (
              <button className={styles.nextBtn} onClick={next}>Próximo <FiChevronRight /></button>
            ) : (
              <button className={styles.submitBtn} onClick={handleSubmit} disabled={loading}>
                {loading ? 'Processando...' : 'Confirmar Pedido'}
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
