import { useContext, useEffect, useRef, useState, useId } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { FiX, FiMinus, FiPlus, FiTrash2, FiTruck, FiShoppingBag, FiInfo, FiClock, FiChevronRight } from 'react-icons/fi'
import { CartContext } from '../../App'
import { getImageUrl } from '../../utils/imageHelper'
import { isSample } from '../../data/drops'
import CouponInput from '../CouponInput/CouponInput'
import CheckoutModal from '../CheckoutModal/CheckoutModal'
import { useToast } from '../Toast/Toast'
import api from '../../services/api'
import styles from './CartDrawer.module.css'
import { useScrollLock } from '../../lib/useScrollLock'
import { useBackToClose } from '../../lib/layers'
import { PENDING_PAYMENT_EVENT, readPendingPayment } from '../../lib/payments'
import { useAccount } from '../../lib/AccountContext'

const EASE = [0.22, 1, 0.36, 1]

const formatCep = (v) => {
  const nums = v.replace(/\D/g, '').slice(0, 8)
  return nums.length > 5 ? `${nums.slice(0, 5)}-${nums.slice(5)}` : nums
}

const readLastCep = () => {
  try { return sessionStorage.getItem('last_cep') || '' } catch { return '' }
}

// Exemplar de amostra: fica na sacola para teste, mas não existe no backend.
const isSampleItem = (item) => isSample(item) || (typeof item?.id === 'string' && item.id.startsWith('amostra-'))

// Mesmo cálculo do total da sacola (App): o desconto do produto vale por unidade.
const unitPrice = (item) => {
  const discount = Math.min(Math.max(Number(item.discount_percentage || 0), 0), 90)
  return discount > 0 ? Number(item.price) * (1 - discount / 100) : Number(item.price)
}

export default function CartDrawer() {
  const { cart, cartOpen, setCartOpen, removeFromCart, updateQuantity, cartTotal, clearCart } = useContext(CartContext)
  useScrollLock(cartOpen)
  // cupons da conta viram fichas no campo de cupom
  const { customer } = useAccount()
  const accountCoupons = Array.isArray(customer?.coupons) ? customer.coupons : []
  useBackToClose(cartOpen, () => setCartOpen(false))
  const [coupon, setCoupon] = useState(null)
  // digitando CEP ou cupom no celular: o rodapé preso some para o teclado
  // não espremer a lista num vão de poucos pixels
  const [typing, setTyping] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [cep, setCep] = useState(() => formatCep(readLastCep()))
  const [shipInfo, setShipInfo] = useState(null) // { price, hasFree }
  const [shipLoading, setShipLoading] = useState(false)
  const [shipError, setShipError] = useState('')
  const addToast = useToast()
  const titleId = useId()
  const cepId = useId()
  const panelRef = useRef(null)

  const formatPrice = (price) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(price)
  }

  const realItems = cart.filter(i => !isSampleItem(i))
  const hasSample = realItems.length < cart.length
  const realTotal = realItems.reduce((s, i) => s + unitPrice(i) * i.quantity, 0)
  const itemCount = cart.reduce((s, i) => s + i.quantity, 0)

  // Esc fecha a sacola (quando o checkout não está por cima); foco entra no painel.
  useEffect(() => {
    if (!cartOpen || checkoutOpen) return
    const raf = requestAnimationFrame(() => panelRef.current?.focus({ preventScroll: true }))
    const onKey = (e) => { if (e.key === 'Escape') setCartOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKey)
    }
  }, [cartOpen, checkoutOpen, setCartOpen])

  const calcFrete = async () => {
    const clean = cep.replace(/\D/g, '')
    if (clean.length !== 8) { setShipError('O CEP tem 8 dígitos.'); return }
    // Só produto de verdade vai para o cálculo; amostra não existe no backend.
    if (!realItems.length) return
    setShipError('')
    setShipLoading(true)
    setShipInfo(null)
    try {
      const items = realItems.map(i => ({ product_id: i.id, quantity: i.quantity }))
      // Sem amostra na sacola, realTotal é igual ao cartTotal.
      const { data } = await api.post('/shipping/calculate', { cep: clean, items, order_total: realTotal })
      const opts = Array.isArray(data) ? data : []
      if (!opts.length) { setShipError('Não há entrega para esse CEP.'); return }
      const hasFree = opts.some(o => o.is_free)
      const cheapest = opts.reduce((m, o) => (Number(o.price) < Number(m.price) ? o : m), opts[0])
      setShipInfo({ price: hasFree ? 0 : Number(cheapest.price), hasFree, subtotal: cartTotal })
      try { sessionStorage.setItem('last_cep', clean) } catch { /* sem storage, segue */ }
    } catch (err) {
      setShipError(err?.response?.data?.error || 'Não deu para calcular o frete agora. Tente de novo.')
    } finally {
      setShipLoading(false)
    }
  }

  const handleClearCart = () => {
    clearCart()
    setCoupon(null)
    setShipInfo(null)
    addToast('Sacola vazia.', 'info')
  }

  // O checkout continua aberto para mostrar a tela de pedido feito; ele mesmo
  // se fecha quando a pessoa sai dela.
  const handleCheckoutSuccess = (order) => {
    setCartOpen(false)
    setCoupon(null)
    setShipInfo(null)
    clearCart()
    const id = order.orderId || order.id
    addToast(order.payment?.status === 'review' ? `Pedido #${id} registrado. O pagamento está em análise.` : `Pedido #${id} registrado.`, 'success')
  }

  // Com pagamento online, o pedido nasce antes de pagar: a sacola esvazia
  // na hora (os pares agora são do pedido) e o pedido fica esperando aqui.
  const handleOrderCreated = () => {
    setCoupon(null)
    setShipInfo(null)
    clearCart()
  }

  // Pedido esperando pagamento nesta aba (sessionStorage).
  const [pending, setPending] = useState(() => readPendingPayment())
  const [resume, setResume] = useState(null)
  useEffect(() => {
    const sync = () => setPending(readPendingPayment())
    window.addEventListener(PENDING_PAYMENT_EVENT, sync)
    // recarregou no meio do pagamento: a etapa de pagamento volta sozinha
    const first = readPendingPayment()
    if (first?.open) {
      setResume(first)
      setCheckoutOpen(true)
    }
    return () => window.removeEventListener(PENDING_PAYMENT_EVENT, sync)
  }, [])

  const openCheckout = () => {
    if (hasSample || !cart.length) return
    setResume(null)
    setCheckoutOpen(true)
  }

  const payPending = () => {
    const current = readPendingPayment()
    if (!current) return
    setResume(current)
    setCheckoutOpen(true)
  }

  const closeCheckout = () => {
    setCheckoutOpen(false)
    setResume(null)
  }

  const pendingCard = pending && !checkoutOpen && (
    <div className={styles.pending} role="status">
      <span className={styles.pendingIcon} aria-hidden><FiClock /></span>
      <span className={styles.pendingText}>
        <span className={styles.pendingTitle}>Pedido #{pending.id} esperando pagamento</span>
        <span className={styles.pendingSub}>{formatPrice(pending.total)} · Pix ou cartão</span>
      </span>
      <button type="button" className={`pz-btn ${styles.pendingBtn}`} onClick={payPending}>
        Pagar <FiChevronRight aria-hidden />
      </button>
    </div>
  )

  // Cupom e frete valem para o subtotal em que foram calculados. Se a sacola
  // muda, somem (cupom pode ter mínimo, frete grátis depende do valor) e a
  // pessoa aplica de novo; senão o total podia até ficar negativo.
  useEffect(() => {
    if (coupon && coupon.subtotal !== cartTotal) {
      setCoupon(null)
      if (cart.length) addToast('Sua sacola mudou. Aplique o cupom de novo.', 'info')
    }
    if (shipInfo && shipInfo.subtotal !== cartTotal) setShipInfo(null)
  }, [cartTotal]) // eslint-disable-line react-hooks/exhaustive-deps

  const finalTotal = Math.max(0, cartTotal - (coupon?.discount || 0))
  const estimatedTotal = finalTotal + (shipInfo ? shipInfo.price : 0)

  return (
    <>
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {cartOpen && (
          <>
            <motion.div
              key="cart-overlay"
              className={styles.overlay}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: EASE }}
              onClick={() => setCartOpen(false)}
            />
            <motion.aside
              key="cart-drawer"
              ref={panelRef}
              className={styles.drawer}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              tabIndex={-1}
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.45, ease: EASE }}
              data-lenis-prevent
            >
              <div className={styles.header}>
                <h2 id={titleId} className={styles.title}>
                  Sacola
                  {itemCount > 0 && (
                    <span className={styles.count}>{itemCount} {itemCount === 1 ? 'par' : 'pares'}</span>
                  )}
                </h2>
                <button type="button" className={styles.closeBtn} onClick={() => setCartOpen(false)} aria-label="Fechar sacola">
                  <FiX aria-hidden />
                </button>
              </div>

              <div
                className={styles.scroll}
                onFocus={(e) => e.target.tagName === 'INPUT' && setTyping(true)}
                onBlur={(e) => e.target.tagName === 'INPUT' && setTyping(false)}
              >
                {pendingCard}
                {cart.length === 0 ? (
                  <div className={styles.empty}>
                    <span className={styles.emptyIcon} aria-hidden><FiShoppingBag /></span>
                    <p className={styles.emptyTitle}>Sua sacola está vazia.</p>
                    <p className={styles.emptyText}>Escolha um par na vitrine e ele aparece aqui.</p>
                    <button type="button" className="pz-btn-ghost" onClick={() => setCartOpen(false)}>
                      Ver os pares
                    </button>
                  </div>
                ) : (
                  <>
                    <ul className={styles.items}>
                      <AnimatePresence initial={false}>
                        {cart.map((item) => {
                          const contain = item.fit === 'contain'
                          const sample = isSampleItem(item)
                          const unit = unitPrice(item)
                          return (
                            <motion.li
                              key={`${item.id}-${item.size}`}
                              className={styles.item}
                              layout
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0 }}
                              transition={{ duration: 0.3, ease: EASE }}
                            >
                              <div
                                className={`${styles.thumb} ${contain ? styles.thumbVitrine : ''}`}
                                style={contain && item.glow ? { '--glow': item.glow } : undefined}
                              >
                                <img src={getImageUrl(item.image_url, item.name)} alt="" loading="lazy" />
                              </div>
                              <div className={styles.itemInfo}>
                                <div className={styles.itemTop}>
                                  <span className={styles.itemName}>{item.name}</span>
                                  <span className={styles.itemTotal}>{formatPrice(unit * item.quantity)}</span>
                                </div>
                                <span className={styles.itemMeta}>
                                  Tamanho {item.size}
                                  {item.quantity > 1 && <> · {formatPrice(unit)} cada</>}
                                </span>
                                {sample && <span className={styles.sampleTag}>Amostra</span>}
                                <div className={styles.itemActions}>
                                  <div className={styles.stepper}>
                                    <button
                                      type="button"
                                      className={styles.qtyBtn}
                                      onClick={() => updateQuantity(item.id, item.size, item.quantity - 1)}
                                      aria-label={item.quantity === 1 ? `Tirar ${item.name} da sacola` : `Diminuir quantidade de ${item.name}`}
                                    >
                                      <FiMinus aria-hidden />
                                    </button>
                                    <span className={styles.qty} aria-label={`Quantidade: ${item.quantity}`}>{item.quantity}</span>
                                    <button
                                      type="button"
                                      className={styles.qtyBtn}
                                      onClick={() => updateQuantity(item.id, item.size, item.quantity + 1)}
                                      aria-label={`Aumentar quantidade de ${item.name}`}
                                    >
                                      <FiPlus aria-hidden />
                                    </button>
                                  </div>
                                  <button
                                    type="button"
                                    className={styles.removeBtn}
                                    onClick={() => removeFromCart(item.id, item.size)}
                                    aria-label={`Remover ${item.name}, tamanho ${item.size}`}
                                  >
                                    <FiTrash2 aria-hidden />
                                  </button>
                                </div>
                              </div>
                            </motion.li>
                          )
                        })}
                      </AnimatePresence>
                    </ul>

                    <div className={styles.extras}>
                      {realItems.length > 0 && (
                        <div className={styles.shipBox}>
                          <label className={styles.fieldLabel} htmlFor={cepId}>Frete</label>
                          <div className={styles.shipRow}>
                            <div className={styles.shipField}>
                              <FiTruck aria-hidden />
                              <input
                                id={cepId}
                                className={styles.shipCep}
                                value={cep}
                                onChange={e => { setCep(formatCep(e.target.value)); setShipError('') }}
                                placeholder="Seu CEP"
                                maxLength={9}
                                inputMode="numeric"
                                autoComplete="postal-code"
                                enterKeyHint="go"
                                onKeyDown={e => e.key === 'Enter' && calcFrete()}
                              />
                            </div>
                            <button
                              type="button"
                              className={styles.shipBtn}
                              onClick={calcFrete}
                              disabled={shipLoading || cep.replace(/\D/g, '').length < 8}
                            >
                              {shipLoading ? 'Calculando…' : 'Calcular'}
                            </button>
                          </div>
                          {shipError && <p className={styles.shipError} role="alert">{shipError}</p>}
                          {shipInfo && (
                            <p className={`${styles.shipMsg} ${shipInfo.hasFree ? styles.shipFreeMsg : ''}`}>
                              {shipInfo.hasFree ? 'Tem frete grátis para esse CEP.' : `Frete a partir de ${formatPrice(shipInfo.price)}.`}
                            </p>
                          )}
                        </div>
                      )}

                      <CouponInput
                        subtotal={cartTotal}
                        appliedCoupon={coupon}
                        suggestions={accountCoupons}
                        onApply={(c) => setCoupon({ ...c, subtotal: cartTotal })}
                        onRemove={() => setCoupon(null)}
                      />

                      <dl className={styles.summary}>
                        <div className={styles.summaryRow}>
                          <dt>Subtotal</dt>
                          <dd>{formatPrice(cartTotal)}</dd>
                        </div>
                        {coupon && (
                          <div className={`${styles.summaryRow} ${styles.summaryOk}`}>
                            <dt>Cupom {coupon.code}</dt>
                            <dd>-{formatPrice(coupon.discount)}</dd>
                          </div>
                        )}
                        {realItems.length > 0 && (
                          <div className={styles.summaryRow}>
                            <dt>Frete estimado</dt>
                            <dd>{shipInfo ? (shipInfo.hasFree ? 'Grátis' : formatPrice(shipInfo.price)) : 'Informe o CEP'}</dd>
                          </div>
                        )}
                      </dl>

                      <button type="button" className={styles.clearBtn} onClick={handleClearCart}>
                        <FiTrash2 aria-hidden /> Esvaziar sacola
                      </button>
                    </div>
                  </>
                )}
              </div>

              {cart.length > 0 && (
                <div className={`${styles.footer} ${typing ? styles.footerAway : ''}`}>
                  {hasSample && (
                    <p className={styles.sampleWarn} role="note">
                      <FiInfo aria-hidden />
                      <span>Exemplares de amostra ainda não podem ser comprados. Remova-os para finalizar.</span>
                    </p>
                  )}
                  <div className={styles.totalRow}>
                    <span className={styles.totalLabel}>Total estimado</span>
                    <span className={styles.totalValue}>{formatPrice(estimatedTotal)}</span>
                  </div>
                  <button
                    type="button"
                    className={`pz-btn ${styles.checkoutBtn}`}
                    onClick={openCheckout}
                    disabled={hasSample}
                  >
                    Finalizar compra
                  </button>
                  <p className={styles.shipNote}>O frete final é confirmado na finalização.</p>
                </div>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </MotionConfig>

    <CheckoutModal
      isOpen={checkoutOpen}
      onClose={closeCheckout}
      cartItems={cart}
      coupon={coupon}
      onSuccess={handleCheckoutSuccess}
      onOrderCreated={handleOrderCreated}
      resume={resume}
    />
    </>
  )
}
