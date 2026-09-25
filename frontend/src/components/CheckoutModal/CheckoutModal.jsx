import { useState, useEffect, useId, useRef } from 'react'
import { motion, AnimatePresence, MotionConfig } from 'framer-motion'
import { FiX, FiUser, FiMapPin, FiTruck, FiCheck, FiChevronLeft, FiChevronRight, FiLoader, FiCreditCard, FiInfo, FiMinus, FiPlus } from 'react-icons/fi'
import api, { captchaHeaders, isCaptchaError } from '../../services/api'
import SuccessScreen from '../SuccessScreen/SuccessScreen'
import PaymentStep from '../Payment/PaymentStep'
import Turnstile, { useTurnstile } from '../Turnstile/Turnstile'
import { useAccount } from '../../lib/AccountContext'
import { useToast } from '../Toast/Toast'
import { clearPendingPayment, loadPaymentConfig, markPendingOpen, savePendingPayment } from '../../lib/payments'
import styles from './CheckoutModal.module.css'
import { useScrollLock } from '../../lib/useScrollLock'
import { useBackToClose } from '../../lib/layers'
import { getCartSessionId } from '../../utils/stockSession'
import { isSample } from '../../data/drops'

const BASE_STEPS = ['Dados', 'Endereço', 'Frete', 'Revisão']
// com o Mercado Pago ligado, o pedido nasce na revisão e a quinta etapa é o pagamento
const PAY_STEP = 4
const EASE = [0.22, 1, 0.36, 1]
const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']

const sheetMotion = {
  initial: { y: 32, opacity: 0 },
  animate: { y: 0, opacity: 1, transition: { duration: 0.42, ease: EASE } },
  exit: { y: 24, opacity: 0, transition: { duration: 0.2, ease: 'easeIn' } },
}
const fadeMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.3, ease: EASE } },
  exit: { opacity: 0, transition: { duration: 0.2 } },
}

const digits = (v) => String(v || '').replace(/\D/g, '')

// 00000-000
const formatCep = (v) => {
  const d = digits(v).slice(0, 8)
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}

// (00) 0000-0000 ou (00) 00000-0000, conforme vai sendo digitado
const formatPhone = (v) => {
  const d = digits(v).slice(0, 11)
  if (!d) return ''
  if (d.length <= 2) return `(${d}`
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

// Amostra da vitrine não existe no backend (o pedido voltaria 400): nunca vai.
const isSampleItem = (item) => isSample(item) || String(item?.id ?? '').startsWith('amostra-')

// resume: pedido que ficou esperando pagamento (sacola ou recarregar a página)
// onOrderCreated: o pedido existe e a sacola já pode esvaziar (o pagamento vem depois)
export default function CheckoutModal({ isOpen, onClose, cartItems, coupon, onSuccess, onOrderCreated, resume = null }) {
  useScrollLock(isOpen)
  const addToast = useToast()
  const [step, setStep] = useState(0)
  const [completedOrder, setCompletedOrder] = useState(null)
  // pagamento online: undefined carregando, null desligado, objeto ligado
  const [payConfig, setPayConfig] = useState(undefined)
  const [order, setOrder] = useState(null) // pedido criado, esperando pagamento
  const [payNote, setPayNote] = useState('') // pedido cancelado ou estornado
  const [loading, setLoading] = useState(false)
  const [shippingOptions, setShippingOptions] = useState([])
  const [shippingLoading, setShippingLoading] = useState(false)
  const [error, setError] = useState('')
  const [cepStatus, setCepStatus] = useState('') // '' | loading | ok | notfound
  // conta do cliente: preenche os dados e libera os pontos
  const { customer, loggedIn, refresh: refreshAccount } = useAccount()
  const [usePoints, setUsePoints] = useState(false)
  const [pointsQty, setPointsQty] = useState(0)
  // total calculado pelo servidor (POST /orders/quote) antes de pagar
  const [quote, setQuote] = useState(null)
  const [quoting, setQuoting] = useState(false)
  // captcha ao criar o pedido (desligado sem chave no servidor)
  const captcha = useTurnstile()

  const [form, setForm] = useState({
    name: '', email: '', phone: '',
    cep: '', street: '', number: '', complement: '',
    neighborhood: '', city: '', state: '',
    shipping_type: '', shipping_price: 0, shipping_days: '',
    shipping_name: '', shipping_rule_id: null,
    estimated_days_min: '', estimated_days_max: '', shipping_is_free: false
  })

  const set = (field, format) => (e) => {
    const value = format ? format(e.target.value) : e.target.value
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const titleId = useId()
  const formId = useId()
  const dialogRef = useRef(null)
  const bodyRef = useRef(null)
  const streetRef = useRef(null)
  const numberRef = useRef(null)
  const closeRef = useRef(null)

  // Sair da tela de pedido feito zera o checkout para a próxima compra.
  const closeSuccess = () => { setCompletedOrder(null); setOrder(null); setStep(0); onClose() }
  // Fechar com o pedido esperando pagamento: ele continua na sacola para pagar
  // depois, e recarregar a página não reabre mais a etapa sozinha.
  const requestClose = () => {
    if (order && step === PAY_STEP && !payNote) {
      markPendingOpen(false)
      addToast(`O pedido #${order.id} está esperando o pagamento. É só abrir a sacola para pagar.`, 'info', 5000)
    }
    onClose()
  }
  closeRef.current = completedOrder ? closeSuccess : requestClose
  useBackToClose(isOpen, () => closeRef.current?.())

  // Configuração do pagamento: pedida a cada abertura (vale 1 min em memória).
  useEffect(() => {
    if (!isOpen) return undefined
    let alive = true
    loadPaymentConfig().then((cfg) => alive && setPayConfig(cfg))
    return () => {
      alive = false
    }
  }, [isOpen])

  // Abrindo: com pedido esperando pagamento, vai direto para a etapa de
  // pagamento; sem ele, uma compra nova começa do zero.
  useEffect(() => {
    if (!isOpen || completedOrder) return
    if (resume) {
      // retomando, o servidor sempre diz onde o pagamento parou (fresh: false)
      setOrder((cur) => (cur && cur.id === resume.id ? { ...cur, fresh: false } : { ...resume, fresh: false }))
      setForm((prev) => ({ ...prev, email: prev.email || resume.email || '' }))
      setPayNote('')
      setStep(PAY_STEP)
    } else if (step === PAY_STEP) {
      setOrder(null)
      setPayNote('')
      setError('')
      setStep(0)
    }
  }, [isOpen, resume]) // eslint-disable-line react-hooks/exhaustive-deps

  // etapa de pagamento na tela: recarregar volta para ela
  useEffect(() => {
    if (isOpen && step === PAY_STEP && order && !payNote) markPendingOpen(true)
  }, [isOpen, step, order, payNote])

  const finishPaid = (payment, status) => {
    clearPendingPayment()
    const done = { ...order, payment: { ...payment, status } }
    setCompletedOrder(done)
    setOrder(null)
    onSuccess && onSuccess(done)
  }
  const onPaid = (payment) => finishPaid(payment, 'approved')
  const onReview = (payment) => finishPaid(payment, 'review')
  const onCancelled = (message) => {
    clearPendingPayment()
    setPayNote(message)
  }

  // Esc fecha; o foco entra no modal quando ele abre.
  useEffect(() => {
    if (!isOpen) return
    const raf = requestAnimationFrame(() => dialogRef.current?.focus({ preventScroll: true }))
    const onKey = (e) => { if (e.key === 'Escape') closeRef.current?.() }
    window.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKey)
    }
  }, [isOpen])

  // cada etapa começa do topo
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0
  }, [step])

  // CEP completo (8 dígitos): o ViaCEP preenche rua, bairro, cidade e estado
  // na hora, sem esperar a pessoa sair do campo.
  const cepDigits = digits(form.cep)
  const lastCep = useRef('')
  useEffect(() => {
    if (!isOpen || cepDigits.length !== 8 || cepDigits === lastCep.current) return undefined
    const ctrl = new AbortController()
    setCepStatus('loading')
    fetch(`https://viacep.com.br/ws/${cepDigits}/json/`, { signal: ctrl.signal })
      .then((res) => res.json())
      .then((data) => {
        lastCep.current = cepDigits
        if (data?.erro) {
          setCepStatus('notfound')
          return
        }
        setForm(prev => ({
          ...prev,
          street: data.logradouro || prev.street,
          neighborhood: data.bairro || prev.neighborhood,
          city: data.localidade || prev.city,
          state: data.uf || prev.state
        }))
        setCepStatus('ok')
        // CEP de rua já traz o logradouro: segue para o número; CEP de
        // cidade pequena não traz, então a rua vem primeiro
        requestAnimationFrame(() => (data.logradouro ? numberRef : streetRef).current?.focus())
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') setCepStatus('')
      })
    return () => ctrl.abort()
  }, [cepDigits, isOpen])

  const buyable = cartItems.filter((i) => !isSampleItem(i))

  const subtotal = buyable.reduce((s, i) => {
    const discount = Math.min(Math.max(Number(i.discount_percentage || 0), 0), 90)
    const price = discount > 0 ? Number(i.price) * (1 - discount / 100) : Number(i.price)
    return s + price * i.quantity
  }, 0)

  const couponDiscount = coupon?.discount || 0
  const shipping = Number(form.shipping_price) || 0
  const total = subtotal - couponDiscount + shipping
  const faltaGratis = shippingOptions
    .filter(o => o.falta_para_gratis != null)
    .reduce((min, o) => (min == null ? o.falta_para_gratis : Math.min(min, o.falta_para_gratis)), null)

  const validateStep = () => {
    setError('')
    if (step === 0) {
      if (!form.name.trim() || !form.email.trim() || !form.phone.trim()) {
        setError('Preencha nome, e-mail e telefone.')
        return false
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
        setError('Confira o e-mail, parece incompleto.')
        return false
      }
      if (digits(form.phone).length < 10) {
        setError('Confira o telefone: DDD e número.')
        return false
      }
    }
    if (step === 1) {
      if (!form.cep || !form.street || !form.number || !form.neighborhood || !form.city || !form.state) {
        setError('Preencha os campos marcados com *.')
        return false
      }
      if (cepDigits.length !== 8) {
        setError('O CEP tem 8 dígitos.')
        return false
      }
    }
    if (step === 2) {
      if (!form.shipping_type) {
        setError('Escolha uma opção de frete.')
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
  const steps = payConfig ? [...BASE_STEPS, 'Pagamento'] : BASE_STEPS
  const paying = step === PAY_STEP
  const back = () => { setError(''); setStep(s => Math.max(s - 1, 0)) }

  const fetchShipping = async () => {
    if (cepDigits.length !== 8) return
    setShippingLoading(true)
    try {
      const items = buyable.map(i => ({ product_id: i.id, quantity: i.quantity }))
      const { data } = await api.post('/shipping/calculate', { cep: cepDigits, items, order_total: subtotal })
      const opts = Array.isArray(data) ? data : (data.options || [])
      setShippingOptions(opts)
      if (opts.length === 1) selectShipping(opts[0])
    } catch {
      setShippingOptions([])
    } finally {
      setShippingLoading(false)
    }
  }

  const selectShipping = (opt) => {
    setForm(prev => ({
      ...prev,
      shipping_type: opt.name,
      shipping_name: opt.name,
      shipping_rule_id: opt.id ?? null,
      shipping_price: opt.is_free ? 0 : Number(opt.price),
      shipping_days: `${opt.estimated_days_min}-${opt.estimated_days_max} dias úteis`,
      estimated_days_min: opt.estimated_days_min,
      estimated_days_max: opt.estimated_days_max,
      shipping_is_free: !!opt.is_free
    }))
    setError('')
  }

  // Pontos: dentro do mínimo, do teto percentual e do saldo. O valor em R$
  // daqui é uma prévia; quem manda é o POST /orders/quote.
  const loyalty = customer?.loyalty || {}
  const balance = Math.max(0, Math.floor(Number(customer?.points) || 0))
  const perReal = Number(loyalty.points_per_real_discount) > 0
    ? Number(loyalty.points_per_real_discount)
    : (Number(customer?.points_value) > 0 ? balance / Number(customer.points_value) : 0)
  const maxPct = Number(loyalty.max_redeem_percent) > 0 ? Number(loyalty.max_redeem_percent) : 100
  const pointsBase = Number(quote?.subtotal) || subtotal
  const pointsStep = perReal >= 1 ? Math.round(perReal) : 1
  const pointsMin = Math.max(Number(loyalty.min_redeem) || 0, pointsStep)
  const pointsMax = perReal > 0
    ? Math.min(balance, Math.floor((pointsBase * maxPct) / 100 * perReal / pointsStep) * pointsStep)
    : 0
  const canUsePoints = loggedIn && loyalty.enabled !== false && balance > 0 && perReal > 0
  const pointsUsable = canUsePoints && pointsMax >= pointsMin
  const usedPoints = usePoints && pointsUsable ? Math.min(Math.max(pointsQty, pointsMin), pointsMax) : 0
  const pointsPreview = perReal > 0 ? usedPoints / perReal : 0

  // o mesmo corpo vai para o orçamento e para o pedido
  const buildPayload = () => ({
    session_id: getCartSessionId(),
    customer_name: form.name.trim(),
    customer_email: form.email.trim(),
    customer_phone: form.phone.trim(),
    items: buyable.map(i => ({
      product_id: i.id,
      size: i.selectedSize || i.size,
      quantity: i.quantity,
      price: Number(i.price)
    })),
    coupon_code: coupon?.code || null,
    shipping_type: form.shipping_name || form.shipping_type,
    shipping_rule_id: form.shipping_rule_id || null,
    shipping_price: shipping,
    address_cep: cepDigits,
    address_street: form.street,
    address_number: form.number,
    address_complement: form.complement,
    address_neighborhood: form.neighborhood,
    address_city: form.city,
    address_state: form.state,
    use_points: usedPoints
  })

  const handleSubmit = async () => {
    if (loading) return
    if (!buyable.length) {
      setError('Não há par à venda na sacola para fechar o pedido.')
      return
    }
    setLoading(true)
    setError('')
    try {
      // O servidor recalcula preço, desconto, pontos e frete; os valores
      // daqui só continuam indo como antes.
      const payload = buildPayload()
      // pagamento online: a configuração precisa estar em mãos antes de decidir
      const cfg = payConfig === undefined ? await loadPaymentConfig() : payConfig
      if (payConfig === undefined) setPayConfig(cfg)
      const token = await captcha.getToken()
      const { data: created } = await api.post('/orders', payload, captchaHeaders(token))
      // pontos usados: o que o servidor devolver, senão o do orçamento
      const data = {
        ...created,
        points_used: created?.points_used ?? quote?.points_used ?? usedPoints,
        points_discount: created?.points_discount ?? quote?.points_discount ?? 0
      }
      const bought = buyable.map(i => ({ product_name: i.name, size: i.size, quantity: i.quantity, price: i.price }))
      // pontos saíram do saldo: a conta relê o saldo novo
      if (usedPoints > 0) refreshAccount()
      setUsePoints(false)
      setQuote(null)
      const needsPayment = cfg && data?.access_token && data.payment_required !== false && data.payment_status !== 'approved'
      if (needsPayment) {
        // O pedido existe; o pagamento vem na próxima etapa. Guarda o que é
        // preciso para retomar nesta aba (id, token e total do servidor).
        const pending = { id: data.id, access_token: data.access_token, total: Number(data.total), email: form.email.trim(), open: true }
        savePendingPayment(pending)
        setOrder({ ...data, ...pending, items: bought, fresh: true })
        setStep(PAY_STEP)
        onOrderCreated && onOrderCreated(data)
      } else {
        setCompletedOrder({ ...data, items: bought })
        onSuccess && onSuccess(data)
      }
    } catch (err) {
      if (isCaptchaError(err)) captcha.reset()
      setError(err.response?.data?.error || err.message || 'Não deu para fechar o pedido. Tente de novo.')
    } finally {
      setLoading(false)
    }
  }

  // Logado: nome, e-mail e telefone já vêm da conta (sem apagar o que a
  // pessoa digitou).
  useEffect(() => {
    if (!isOpen || !loggedIn || !customer) return
    setForm((prev) => ({
      ...prev,
      name: prev.name || customer.name || '',
      email: prev.email || customer.email || '',
      phone: prev.phone || formatPhone(customer.phone || '')
    }))
  }, [isOpen, loggedIn, customer])

  // Orçamento do servidor na revisão: total certo (cupom, pontos, frete)
  // antes de pagar. Espera a pessoa parar de mexer (debounce).
  const quoteKey = step === 3 && isOpen
    ? JSON.stringify([buyable.map(i => [i.id, i.size, i.quantity]), coupon?.code || '', form.shipping_rule_id, form.shipping_name, cepDigits, usedPoints])
    : ''
  useEffect(() => {
    if (!quoteKey) return undefined
    let alive = true
    setQuoting(true)
    const t = setTimeout(() => {
      api.post('/orders/quote', buildPayload())
        .then(({ data }) => alive && setQuote(data && typeof data === 'object' ? data : null))
        .catch(() => alive && setQuote(null))
        .finally(() => alive && setQuoting(false))
    }, 350)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [quoteKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Enter (ou "Próximo" no teclado do celular) anda para o campo seguinte;
  // no último campo da etapa, envia a etapa.
  const onFormKeyDown = (e) => {
    if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return
    const fields = [...e.currentTarget.querySelectorAll('input, select')].filter((el) => !el.disabled)
    const i = fields.indexOf(e.target)
    if (i >= 0 && i < fields.length - 1) {
      e.preventDefault()
      fields[i + 1].focus()
    }
  }

  const onFormSubmit = (e) => {
    e.preventDefault()
    if (step < 3) next()
    else if (step === 3) handleSubmit()
  }

  const formatPrice = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

  if (!isOpen) return null

  const stepIcon = (i) => {
    if (i < step) return <FiCheck aria-hidden />
    if (i === 0) return <FiUser aria-hidden />
    if (i === 1) return <FiMapPin aria-hidden />
    if (i === 2) return <FiTruck aria-hidden />
    if (i === PAY_STEP) return <FiCreditCard aria-hidden />
    return <FiCheck aria-hidden />
  }

  if (completedOrder) {
    return (
      <MotionConfig reducedMotion="user">
        <AnimatePresence>
          <motion.div className={styles.overlay} {...fadeMotion} data-lenis-prevent>
            <motion.div
              ref={dialogRef}
              className={`${styles.modal} ${styles.modalSuccess}`}
              role="dialog"
              aria-modal="true"
              aria-label={completedOrder.payment?.status === 'review' ? 'Pagamento em análise' : 'Pedido feito'}
              tabIndex={-1}
              {...sheetMotion}
            >
              <SuccessScreen order={completedOrder} onClose={closeSuccess} />
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </MotionConfig>
    )
  }

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {/* tocar fora só fecha na primeira etapa: depois disso, um toque
            perdido jogaria o endereço digitado para trás */}
        <motion.div className={styles.overlay} {...fadeMotion} onClick={() => step === 0 && !loading && onClose()} data-lenis-prevent>
          <motion.div
            ref={dialogRef}
            className={`${styles.modal} ${paying ? styles.modalPay : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            {...sheetMotion}
            onClick={e => e.stopPropagation()}
          >
            <div className={styles.header}>
              <h2 id={titleId} className={styles.title}>{paying ? 'Pagamento' : 'Finalizar pedido'}</h2>
              <button type="button" className={styles.closeBtn} onClick={requestClose} aria-label="Fechar"><FiX aria-hidden /></button>
            </div>

            <ol className={`${styles.stepper} ${steps.length > 4 ? styles.stepperFive : ''}`} aria-label={`Etapa ${Math.min(step, steps.length - 1) + 1} de ${steps.length}`}>
              {steps.map((label, i) => (
                <li
                  key={label}
                  className={`${styles.stepItem} ${i <= step ? styles.stepActive : ''} ${i === step ? styles.stepCurrent : ''} ${i < step ? styles.stepDone : ''}`}
                  aria-current={i === step ? 'step' : undefined}
                >
                  <span className={styles.stepCircle}>{stepIcon(i)}</span>
                  <span className={styles.stepLabel}>{label}</span>
                </li>
              ))}
            </ol>

            <div className={styles.body} ref={bodyRef}>
              {paying && (
                payNote ? (
                  <div className={styles.payNote} role="alert">
                    <FiInfo aria-hidden />
                    <p>{payNote}</p>
                    <button type="button" className="pz-btn-ghost" onClick={onClose}>Fechar</button>
                  </div>
                ) : payConfig === undefined || !order ? (
                  <div className={styles.shippingLoading} role="status"><FiLoader className={styles.spinner} aria-hidden /> Preparando o pagamento…</div>
                ) : payConfig === null ? (
                  <div className={styles.payNote} role="alert">
                    <FiInfo aria-hidden />
                    <p>O pagamento online está fora do ar agora. O pedido #{order.id} está guardado; fale com a gente pelo chat para pagar.</p>
                    <button type="button" className="pz-btn-ghost" onClick={requestClose}>Fechar</button>
                  </div>
                ) : (
                  <PaymentStep
                    key={order.id}
                    order={order}
                    config={payConfig}
                    fresh={Boolean(order.fresh)}
                    onPaid={onPaid}
                    onReview={onReview}
                    onCancelled={onCancelled}
                  />
                )
              )}
              {!paying && (
              <form id={formId} onSubmit={onFormSubmit} onKeyDown={onFormKeyDown} noValidate>
                {step === 0 && (
                  <div className={styles.fields}>
                    <label className={styles.label}>Nome completo *
                      <input className={styles.input} value={form.name} onChange={set('name')} placeholder="João da Silva" autoComplete="name" autoCapitalize="words" enterKeyHint="next" />
                    </label>
                    <label className={styles.label}>E-mail *
                      <input className={styles.input} type="email" value={form.email} onChange={set('email')} placeholder="joao@email.com" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} enterKeyHint="next" />
                    </label>
                    <label className={styles.label}>Telefone ou WhatsApp *
                      <input className={styles.input} type="tel" value={form.phone} onChange={set('phone', formatPhone)} placeholder="(11) 99999-9999" autoComplete="tel-national" inputMode="tel" maxLength={16} enterKeyHint="go" />
                    </label>
                  </div>
                )}

                {step === 1 && (
                  <div className={styles.fields}>
                    <label className={styles.label}>
                      <span className={styles.labelRow}>
                        CEP *
                        {cepStatus === 'loading' && <span className={styles.cepHint}><FiLoader className={styles.spinner} aria-hidden /> Buscando o endereço</span>}
                        {cepStatus === 'notfound' && <span className={`${styles.cepHint} ${styles.cepWarn}`}>CEP não encontrado, preencha à mão</span>}
                      </span>
                      <input className={styles.input} value={form.cep} onChange={set('cep', formatCep)} placeholder="00000-000" maxLength={9} autoComplete="postal-code" inputMode="numeric" enterKeyHint="next" />
                    </label>
                    <label className={styles.label}>Rua *
                      <input ref={streetRef} className={styles.input} value={form.street} onChange={set('street')} placeholder="Rua exemplo" autoComplete="address-line1" autoCapitalize="words" enterKeyHint="next" />
                    </label>
                    <div className={styles.row}>
                      <label className={styles.label}>Número *
                        {/* sem teclado numérico: tem número "123A" e "S/N" */}
                        <input ref={numberRef} className={styles.input} value={form.number} onChange={set('number')} placeholder="123" enterKeyHint="next" />
                      </label>
                      <label className={styles.label}>Complemento
                        <input className={styles.input} value={form.complement} onChange={set('complement')} placeholder="Apto 4B" autoComplete="address-line2" enterKeyHint="next" />
                      </label>
                    </div>
                    <label className={styles.label}>Bairro *
                      <input className={styles.input} value={form.neighborhood} onChange={set('neighborhood')} placeholder="Centro" autoComplete="address-level3" autoCapitalize="words" enterKeyHint="next" />
                    </label>
                    <div className={`${styles.row} ${styles.rowCity}`}>
                      <label className={styles.label}>Cidade *
                        <input className={styles.input} value={form.city} onChange={set('city')} placeholder="São Paulo" autoComplete="address-level2" autoCapitalize="words" enterKeyHint="next" />
                      </label>
                      <label className={styles.label}>Estado *
                        <span className={styles.selectWrap}>
                          <select className={`${styles.input} ${styles.select}`} value={form.state} onChange={set('state')} autoComplete="address-level1">
                            <option value="" disabled>UF</option>
                            {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                          </select>
                        </span>
                      </label>
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className={styles.shippingSection}>
                    {shippingLoading ? (
                      <div className={styles.shippingLoading} role="status"><FiLoader className={styles.spinner} aria-hidden /> Calculando o frete…</div>
                    ) : shippingOptions.length === 1 ? (
                      <div className={styles.singleShip}>
                        <FiTruck aria-hidden className={styles.singleIcon} />
                        <div className={styles.shipInfo}>
                          <span className={styles.shipName}>{shippingOptions[0].name}</span>
                          <span className={styles.shipDays}>{shippingOptions[0].estimated_days_min} a {shippingOptions[0].estimated_days_max} dias úteis</span>
                        </div>
                        <span className={`${styles.shipPrice} ${shippingOptions[0].is_free ? styles.shipFree : ''}`}>
                          {shippingOptions[0].is_free ? 'Grátis' : formatPrice(shippingOptions[0].price)}
                        </span>
                      </div>
                    ) : shippingOptions.length > 0 ? (
                      <>
                        <div className={styles.shipList} role="radiogroup" aria-label="Opções de frete">
                          {shippingOptions.map((opt, i) => {
                            const selected = form.shipping_name === opt.name
                            return (
                              <button
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                key={opt.id ?? opt.name ?? i}
                                className={`${styles.shipOption} ${selected ? styles.shipSelected : ''}`}
                                onClick={() => selectShipping(opt)}
                              >
                                <span className={styles.shipRadio} aria-hidden />
                                <span className={styles.shipInfo}>
                                  <span className={styles.shipName}>{opt.name}</span>
                                  <span className={styles.shipDays}>{opt.estimated_days_min} a {opt.estimated_days_max} dias úteis</span>
                                </span>
                                <span className={`${styles.shipPrice} ${opt.is_free ? styles.shipFree : ''}`}>
                                  {opt.is_free ? 'Grátis' : formatPrice(opt.price)}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                        {faltaGratis != null && (
                          <div className={styles.faltaGratis}>
                            Faltam {formatPrice(faltaGratis)} para o frete sair grátis.
                          </div>
                        )}
                      </>
                    ) : (
                      <p className={styles.noShipping}>Não achamos entrega para esse CEP. Volte e confira o endereço.</p>
                    )}
                  </div>
                )}

                {step === 3 && (
                  <div className={styles.review}>
                    <div className={styles.reviewSection}>
                      <h4>Seus dados</h4>
                      <p>{form.name}</p>
                      <p>{form.email}</p>
                      <p>{form.phone}</p>
                    </div>
                    <div className={styles.reviewSection}>
                      <h4>Entrega</h4>
                      <p>{form.street}, {form.number}{form.complement && `, ${form.complement}`}</p>
                      <p>{form.neighborhood}, {form.city}/{form.state}</p>
                      <p>CEP {form.cep}</p>
                    </div>
                    <div className={styles.reviewSection}>
                      <h4>Itens ({buyable.length})</h4>
                      {buyable.map((item, idx) => (
                        <div key={idx} className={styles.reviewItem}>
                          <span>{item.name} <span className={styles.reviewQty}>{item.size ? `tam. ${item.size} ` : ''}× {item.quantity}</span></span>
                          <span className={styles.num}>{formatPrice(Number(item.price) * item.quantity)}</span>
                        </div>
                      ))}
                    </div>
                    {canUsePoints && (
                      <div className={`${styles.reviewSection} ${styles.points}`}>
                        <label className={styles.pointsSwitch}>
                          <input
                            type="checkbox"
                            className={styles.switchInput}
                            checked={usePoints && pointsUsable}
                            disabled={!pointsUsable}
                            onChange={(e) => {
                              setUsePoints(e.target.checked)
                              if (e.target.checked && !pointsQty) setPointsQty(pointsMax)
                            }}
                          />
                          <span className={styles.switch} aria-hidden="true" />
                          <span className={styles.pointsText}>
                            <span className={styles.pointsTitle}>Usar meus pontos</span>
                            <span className={styles.pointsSub}>Você tem {balance.toLocaleString('pt-BR')} pontos</span>
                          </span>
                        </label>
                        {!pointsUsable && (
                          <p className={styles.pointsHint}>
                            {balance < pointsMin
                              ? `Dá para usar a partir de ${pointsMin.toLocaleString('pt-BR')} pontos.`
                              : `Neste pedido ainda não dá para usar pontos (o limite é ${maxPct}% do valor).`}
                          </p>
                        )}
                        {usePoints && pointsUsable && (
                          <div className={styles.pointsControl}>
                            <button
                              type="button"
                              className={styles.stepBtn}
                              onClick={() => setPointsQty(Math.max(pointsMin, usedPoints - pointsStep))}
                              disabled={usedPoints <= pointsMin}
                              aria-label="Usar menos pontos"
                            >
                              <FiMinus aria-hidden />
                            </button>
                            <input
                              type="range"
                              className={styles.range}
                              min={pointsMin}
                              max={pointsMax}
                              step={pointsStep}
                              value={usedPoints}
                              onChange={(e) => setPointsQty(Number(e.target.value))}
                              aria-label="Quantos pontos usar"
                              aria-valuetext={`${usedPoints} pontos, ${formatPrice(pointsPreview)} de desconto`}
                            />
                            <button
                              type="button"
                              className={styles.stepBtn}
                              onClick={() => setPointsQty(Math.min(pointsMax, usedPoints + pointsStep))}
                              disabled={usedPoints >= pointsMax}
                              aria-label="Usar mais pontos"
                            >
                              <FiPlus aria-hidden />
                            </button>
                            <p className={styles.pointsValue} aria-live="polite">
                              <strong>{usedPoints.toLocaleString('pt-BR')} pontos</strong> = {formatPrice(Number(quote?.points_discount) > 0 ? quote.points_discount : pointsPreview)} de desconto
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                    <div className={styles.reviewTotals} aria-busy={quoting || undefined}>
                      {quote ? (
                        <>
                          <div className={styles.totalRow}><span>Subtotal</span><span className={styles.num}>{formatPrice(quote.subtotal)}</span></div>
                          {Number(quote.coupon_discount) > 0 && (
                            <div className={styles.totalRow}><span>Cupom {quote.coupon_code || coupon?.code}</span><span className={`${styles.num} ${styles.discountText}`}>-{formatPrice(quote.coupon_discount)}</span></div>
                          )}
                          {Number(quote.points_discount) > 0 && (
                            <div className={styles.totalRow}><span>Pontos ({Number(quote.points_used || 0).toLocaleString('pt-BR')})</span><span className={`${styles.num} ${styles.discountText}`}>-{formatPrice(quote.points_discount)}</span></div>
                          )}
                          <div className={styles.totalRow}>
                            <span>{form.shipping_name ? `Frete (${form.shipping_name})` : 'Frete'}</span>
                            <span className={styles.num}>{Number(quote.shipping_price) > 0 ? formatPrice(quote.shipping_price) : 'Grátis'}</span>
                          </div>
                          {Number(quote.gift_wrap_price) > 0 && (
                            <div className={styles.totalRow}><span>Embrulho para presente</span><span className={styles.num}>{formatPrice(quote.gift_wrap_price)}</span></div>
                          )}
                          <div className={`${styles.totalRow} ${styles.totalFinal}`}>
                            <span>Total</span>
                            <span className={styles.num}>{quoting ? <FiLoader className={styles.spinner} aria-label="Atualizando" /> : formatPrice(quote.total)}</span>
                          </div>
                          {payConfig && payConfig.pixDiscount > 0 && Number(quote.pix_discount_preview) > 0 && (
                            <p className={styles.pixPreview}>No Pix sai por {formatPrice(Number(quote.total) - Number(quote.pix_discount_preview))}</p>
                          )}
                          {Array.isArray(quote.messages) && quote.messages.filter(Boolean).map((m, i) => (
                            <p key={i} className={styles.quoteMsg}><FiInfo aria-hidden /> {String(m)}</p>
                          ))}
                        </>
                      ) : (
                        <>
                          <div className={styles.totalRow}><span>Subtotal</span><span className={styles.num}>{formatPrice(subtotal)}</span></div>
                          {couponDiscount > 0 && <div className={styles.totalRow}><span>Cupom {coupon?.code}</span><span className={`${styles.num} ${styles.discountText}`}>-{formatPrice(couponDiscount)}</span></div>}
                          {usedPoints > 0 && <div className={styles.totalRow}><span>Pontos ({usedPoints.toLocaleString('pt-BR')})</span><span className={`${styles.num} ${styles.discountText}`}>-{formatPrice(pointsPreview)}</span></div>}
                          <div className={styles.totalRow}>
                            <span>{form.shipping_is_free ? 'Frete' : `Frete (${form.shipping_name || form.shipping_type})`}</span>
                            <span className={styles.num}>{form.shipping_is_free ? 'Grátis' : formatPrice(shipping)}</span>
                          </div>
                          <div className={`${styles.totalRow} ${styles.totalFinal}`}>
                            <span>Total</span>
                            <span className={styles.num}>{quoting ? <FiLoader className={styles.spinner} aria-label="Atualizando" /> : formatPrice(Math.max(0, total - pointsPreview))}</span>
                          </div>
                          <p className={styles.totalNote}>
                            {payConfig
                              ? 'A loja confere preços, cupom, pontos e frete ao criar o pedido; o valor a pagar aparece na próxima etapa.'
                              : 'A loja confere preços, cupom, pontos e frete ao confirmar; o valor final aparece na tela do pedido.'}
                          </p>
                        </>
                      )}
                    </div>
                    <Turnstile captcha={captcha} />
                  </div>
                )}
              </form>
              )}
            </div>

            {!paying && (
            <div className={styles.footer}>
              {error && <p className={styles.error} role="alert">{error}</p>}
              {step === 3 && (
                <p className={styles.consent}>
                  Ao continuar, você concorda com os{' '}
                  <a href="/termos" target="_blank" rel="noopener noreferrer">Termos de uso</a> e a{' '}
                  <a href="/privacidade" target="_blank" rel="noopener noreferrer">Política de privacidade</a>.
                </p>
              )}
              <div className={styles.actions}>
                {step > 0 && (
                  <button type="button" className={`pz-btn-ghost ${styles.backBtn}`} onClick={back}><FiChevronLeft aria-hidden /> Voltar</button>
                )}
                {step < 3 ? (
                  <button type="submit" form={formId} className={`pz-btn ${styles.nextBtn}`}>Continuar <FiChevronRight aria-hidden /></button>
                ) : (
                  <button type="submit" form={formId} className={`pz-btn ${styles.nextBtn}`} disabled={loading}>
                    {loading ? 'Enviando pedido…' : payConfig ? <>Ir para o pagamento <FiChevronRight aria-hidden /></> : 'Confirmar pedido'}
                  </button>
                )}
              </div>
            </div>
            )}
          </motion.div>
        </motion.div>
      </AnimatePresence>
    </MotionConfig>
  )
}
