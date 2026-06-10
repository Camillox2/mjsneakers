import { useContext, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { FiX, FiMinus, FiPlus, FiTrash2 } from 'react-icons/fi'
import { CartContext } from '../../App'
import { getImageUrl } from '../../utils/imageHelper'
import ShippingCalc from '../ShippingCalc/ShippingCalc'
import CouponInput from '../CouponInput/CouponInput'
import CheckoutModal from '../CheckoutModal/CheckoutModal'
import { useToast } from '../Toast/Toast'
import styles from './CartDrawer.module.css'

export default function CartDrawer() {
  const { cart, cartOpen, setCartOpen, removeFromCart, updateQuantity, cartTotal, clearCart } = useContext(CartContext)
  const [coupon, setCoupon] = useState(null)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const addToast = useToast()

  const formatPrice = (price) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(price)
  }

  const handleCheckoutSuccess = (order) => {
    setCheckoutOpen(false)
    setCartOpen(false)
    setCoupon(null)
    clearCart()
    addToast(`Pedido #${order.orderId || order.id} criado com sucesso!`, 'success')
  }

  const finalTotal = cartTotal - (coupon?.discount || 0)

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
                <ShippingCalc />
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
                  <span className={styles.totalLabel} style={{ fontWeight: 700, fontSize: '1.05rem' }}>Total</span>
                  <span className={styles.totalValue} style={{ fontWeight: 700, fontSize: '1.05rem' }}>{formatPrice(finalTotal)}</span>
                </div>
                <motion.button
                  className={styles.checkoutBtn}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setCheckoutOpen(true)}
                >
                  Finalizar Compra
                </motion.button>
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
