import { useContext, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { FiX, FiMinus, FiPlus, FiTrash2, FiTruck } from 'react-icons/fi'
import { CartContext } from '../../App'
import { getImageUrl } from '../../utils/imageHelper'
import CouponInput from '../CouponInput/CouponInput'
import CheckoutModal from '../CheckoutModal/CheckoutModal'
import { useToast } from '../Toast/Toast'
import api from '../../services/api'
import styles from './CartDrawer.module.css'

const formatCep = (v) => {
  const nums = v.replace(/\D/g, '').slice(0, 8)
  return nums.length > 5 ? `${nums.slice(0, 5)}-${nums.slice(5)}` : nums
}

export default function CartDrawer() {
  const { cart, cartOpen, setCartOpen, removeFromCart, updateQuantity, cartTotal, clearCart } = useContext(CartContext)
  const [coupon, setCoupon] = useState(null)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [cep, setCep] = useState(() => formatCep(sessionStorage.getItem('last_cep') || ''))
  const [shipInfo, setShipInfo] = useState(null) // { price, hasFree }
  const [shipLoading, setShipLoading] = useState(false)
  const [shipError, setShipError] = useState('')
  const addToast = useToast()

  const formatPrice = (price) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(price)
  }

  const calcFrete = async () => {
    const clean = cep.replace(/\D/g, '')
    if (clean.length !== 8) { setShipError('CEP deve ter 8 dígitos'); return }
    setShipError('')
    setShipLoading(true)
    setShipInfo(null)
    try {
      const items = cart.map(i => ({ product_id: i.id, quantity: i.quantity }))
      const { data } = await api.post('/shipping/calculate', { cep: clean, items, order_total: cartTotal })
      const opts = Array.isArray(data) ? data : []
      if (!opts.length) { setShipError('Sem opções de frete para este CEP'); return }
      const hasFree = opts.some(o => o.is_free)
      const cheapest = opts.reduce((m, o) => (Number(o.price) < Number(m.price) ? o : m), opts[0])
      setShipInfo({ price: hasFree ? 0 : Number(cheapest.price), hasFree })
      sessionStorage.setItem('last_cep', clean)
    } catch (err) {
      setShipError(err?.response?.data?.error || 'Erro ao calcular frete')
    } finally {
      setShipLoading(false)
    }
  }

  const handleClearCart = () => {
    clearCart()
    setCoupon(null)
    setShipInfo(null)
    addToast('Carrinho esvaziado.', 'info')
  }

  const handleCheckoutSuccess = (order) => {
    setCheckoutOpen(false)
    setCartOpen(false)
    setCoupon(null)
    clearCart()
    addToast(`Pedido #${order.orderId || order.id} criado com sucesso!`, 'success')
  }

  const finalTotal = cartTotal - (coupon?.discount || 0)
  const estimatedTotal = finalTotal + (shipInfo ? shipInfo.price : 0)

  return (
    <>
    <AnimatePresence>
      {cartOpen && (
        <>
          <motion.div
            className={styles.overlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setCartOpen(false)}
          />
          <motion.div
            className={styles.drawer}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            <div className={styles.header}>
              <span className={styles.title}>CARRINHO</span>
              <button className={styles.closeBtn} onClick={() => setCartOpen(false)}>
                <FiX />
              </button>
            </div>

            <div className={styles.items}>
              {cart.length === 0 ? (
                <p className={styles.emptyCart}>Seu carrinho está vazio</p>
              ) : (
                cart.map((item) => (
                  <motion.div
                    key={`${item.id}-${item.size}`}
                    className={styles.item}
                    layout
                    initial={{ opacity: 0, x: 30 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 30 }}
                  >
                    <img
                      className={styles.itemImg}
                      src={getImageUrl(item.image_url, item.name)}
                      alt={item.name}
                    />
                    <div className={styles.itemInfo}>
                      <span className={styles.itemName}>{item.name}</span>
                      <span className={styles.itemSize}>Tam: {item.size}</span>
                      <span className={styles.itemPrice}>{formatPrice(item.price)}</span>
                      <div className={styles.itemActions}>
                        <button
                          className={styles.qtyBtn}
                          onClick={() => updateQuantity(item.id, item.size, item.quantity - 1)}
                        >
                          <FiMinus />
                        </button>
                        <span className={styles.qty}>{item.quantity}</span>
                        <button
                          className={styles.qtyBtn}
                          onClick={() => updateQuantity(item.id, item.size, item.quantity + 1)}
                        >
                          <FiPlus />
                        </button>
                        <button
                          className={styles.removeBtn}
                          onClick={() => removeFromCart(item.id, item.size)}
                        >
                          <FiTrash2 />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>

            {cart.length > 0 && (
              <div className={styles.footer}>
                {/* Frete compacto */}
                <div className={styles.shipBox}>
                  <div className={styles.shipInputRow}>
                    <FiTruck />
                    <input
                      className={styles.shipCep}
                      value={cep}
                      onChange={e => { setCep(formatCep(e.target.value)); setShipError('') }}
                      placeholder="00000-000"
                      maxLength={9}
                      inputMode="numeric"
                      onKeyDown={e => e.key === 'Enter' && calcFrete()}
                    />
                    <button className={styles.shipBtn} onClick={calcFrete} disabled={shipLoading || cep.replace(/\D/g, '').length < 8}>
                      {shipLoading ? '...' : 'Calcular frete'}
                    </button>
                  </div>
                  {shipError && <p className={styles.shipError}>{shipError}</p>}
                  {shipInfo && (
                    <p className={`${styles.shipMsg} ${shipInfo.hasFree ? styles.shipFreeMsg : ''}`}>
                      {shipInfo.hasFree ? 'Frete GRÁTIS disponível!' : `Frete a partir de ${formatPrice(shipInfo.price)}`}
                    </p>
                  )}
                </div>

                <CouponInput
                  subtotal={cartTotal}
                  appliedCoupon={coupon}
                  onApply={setCoupon}
                  onRemove={() => setCoupon(null)}
                />
                <div className={styles.totalRow}>
                  <span className={styles.totalLabel}>Subtotal</span>
                  <span className={styles.totalValue}>{formatPrice(cartTotal)}</span>
                </div>
                {coupon && (
                  <div className={styles.totalRow}>
                    <span className={styles.totalLabel} style={{ color: '#4caf50' }}>Cupom</span>
                    <span className={styles.totalValue} style={{ color: '#4caf50' }}>-{formatPrice(coupon.discount)}</span>
                  </div>
                )}
                <div className={styles.totalRow}>
                  <span className={styles.totalLabel}>Frete estimado</span>
                  <span className={styles.totalValue}>
                    {shipInfo ? (shipInfo.hasFree ? 'GRÁTIS' : formatPrice(shipInfo.price)) : 'a calcular'}
                  </span>
                </div>
                <div className={styles.totalRow}>
                  <span className={styles.totalLabel} style={{ fontWeight: 700, fontSize: '1.05rem' }}>Total estimado</span>
                  <span className={styles.totalValue} style={{ fontWeight: 700, fontSize: '1.05rem' }}>{formatPrice(estimatedTotal)}</span>
                </div>
                <p className={styles.shipNote}>* Frete confirmado no checkout</p>
                <motion.button
                  className={styles.checkoutBtn}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setCheckoutOpen(true)}
                >
                  Finalizar Compra
                </motion.button>
                <button className={styles.clearBtn} onClick={handleClearCart}>
                  <FiTrash2 /> Limpar carrinho
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>

    <CheckoutModal
      isOpen={checkoutOpen}
      onClose={() => setCheckoutOpen(false)}
      cartItems={cart}
      coupon={coupon}
      onSuccess={handleCheckoutSuccess}
    />
    </>
  )
}
