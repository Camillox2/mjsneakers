import { useState, useContext, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { FiPlus, FiEdit2, FiTrash2, FiLogOut, FiPackage, FiImage, FiStar, FiCheck, FiX, FiBarChart2, FiShoppingBag, FiSettings, FiChevronDown, FiChevronUp, FiAlertTriangle, FiTrendingUp, FiBox, FiUsers, FiDollarSign, FiSave } from 'react-icons/fi'
import api from '../../services/api'
import { AuthContext } from '../../App'
import { getImageUrl } from '../../utils/imageHelper'
import styles from './Admin.module.css'

const formatPrice = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

/* ========================================================
   LOGIN SCREEN
   ======================================================== */
function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await api.post('/auth/login', { username, password })
      onLogin(data.user, data.token)
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao fazer login')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.loginWrap}>
      <div className={styles.bgGlow} />
      <motion.div className={styles.loginCard}
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}>
        <h2 className={styles.loginTitle}>Admin <span>MJSneakers</span></h2>
        <p className={styles.loginSub}>Acesse o painel administrativo</p>
        <form className={styles.form} onSubmit={handleSubmit}>
          {error && <motion.div className={styles.error} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>{error}</motion.div>}
          <div className={styles.inputGroup}>
            <label className={styles.label}>Usuário</label>
            <input className={styles.input} type="text" placeholder="Digite seu usuário" value={username} onChange={e => setUsername(e.target.value)} required autoComplete="username" />
          </div>
          <div className={styles.inputGroup}>
            <label className={styles.label}>Senha</label>
            <input className={styles.input} type="password" placeholder="Digite sua senha" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" />
          </div>
          <motion.button type="submit" className={styles.submitBtn} disabled={loading} whileHover={{ scale: loading ? 1 : 1.02 }} whileTap={{ scale: loading ? 1 : 0.98 }}>
            {loading ? 'Entrando...' : 'Entrar'}
          </motion.button>
        </form>
      </motion.div>
    </div>
  )
}

/* ========================================================
   PRODUCT FORM MODAL (Create/Edit with image drag-reorder)
   ======================================================== */
function ProductFormModal({ product, brands, onSave, onClose }) {
  const [form, setForm] = useState({
    name: product?.name || '',
    description: product?.description || '',
    price: product?.price || '',
    brand_id: product?.brand_id || '',
    sizes: product?.sizes || '38,39,40,41,42,43,44',
    stock: product?.stock || 10,
    active: product?.active ?? true,
  })
  const [images, setImages] = useState(() => {
    const imgs = []
    if (product?.image_url) imgs.push(product.image_url)
    if (product?.image_url_2) imgs.push(product.image_url_2)
    if (product?.image_url_3) imgs.push(product.image_url_3)
    if (product?.image_url_4) imgs.push(product.image_url_4)
    return imgs
  })
  const [saving, setSaving] = useState(false)
  const dragIdx = useRef(null)

  const handleChange = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files)
    files.forEach(file => {
      if (images.length >= 4) return
      const reader = new FileReader()
      reader.onload = () => setImages(prev => prev.length < 4 ? [...prev, reader.result] : prev)
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  const removeImage = (idx) => setImages(prev => prev.filter((_, i) => i !== idx))

  const handleDragStart = (idx) => { dragIdx.current = idx }
  const handleDragOver = (e) => e.preventDefault()
  const handleDrop = (targetIdx) => {
    if (dragIdx.current === null || dragIdx.current === targetIdx) return
    setImages(prev => {
      const copy = [...prev]
      const [moved] = copy.splice(dragIdx.current, 1)
      copy.splice(targetIdx, 0, moved)
      return copy
    })
    dragIdx.current = null
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = {
        ...form,
        price: parseFloat(form.price),
        brand_id: parseInt(form.brand_id) || null,
        stock: parseInt(form.stock) || 0,
        image_url: images[0] || null,
        image_url_2: images[1] || null,
        image_url_3: images[2] || null,
        image_url_4: images[3] || null,
      }
      if (product?.id) {
        await api.put(`/products/${product.id}`, payload)
      } else {
        await api.post('/products', payload)
      }
      onSave()
    } catch {
      alert('Erro ao salvar produto')
    } finally {
      setSaving(false)
    }
  }

  const brandName = brands.find(b => b.id === parseInt(form.brand_id))?.name || ''

  return (
    <motion.div className={styles.formOverlay} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className={styles.formCard} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 30 }} onClick={e => e.stopPropagation()}>
        <h3 className={styles.formTitle}>{product ? 'Editar Produto' : 'Novo Produto'}</h3>

        <div className={styles.formRow}>
          <div className={styles.inputGroup}>
            <label className={styles.label}>Nome</label>
            <input className={styles.input} value={form.name} onChange={e => handleChange('name', e.target.value)} placeholder="Nome do produto" />
          </div>
          <div className={styles.inputGroup}>
            <label className={styles.label}>Marca</label>
            <select className={styles.select} value={form.brand_id} onChange={e => handleChange('brand_id', e.target.value)}>
              <option value="">Selecione</option>
              {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        </div>

        <div className={styles.inputGroup}>
          <label className={styles.label}>Descrição</label>
          <textarea className={styles.textarea} value={form.description} onChange={e => handleChange('description', e.target.value)} placeholder="Descrição do produto" />
        </div>

        <div className={styles.formRow}>
          <div className={styles.inputGroup}>
            <label className={styles.label}>Preço (R$)</label>
            <input className={styles.input} type="number" step="0.01" value={form.price} onChange={e => handleChange('price', e.target.value)} placeholder="0.00" />
          </div>
          <div className={styles.inputGroup}>
            <label className={styles.label}>Estoque</label>
            <input className={styles.input} type="number" value={form.stock} onChange={e => handleChange('stock', e.target.value)} />
          </div>
        </div>

        <div className={styles.inputGroup}>
          <label className={styles.label}>Tamanhos (separados por vírgula)</label>
          <input className={styles.input} value={form.sizes} onChange={e => handleChange('sizes', e.target.value)} placeholder="38,39,40,41,42,43,44" />
        </div>

        <div className={styles.inputGroup}>
          <label className={styles.label}>Imagens (arraste para reordenar, máx 4)</label>
          <div className={styles.imageSlots}>
            {images.map((img, idx) => (
              <div key={idx} className={styles.imageSlot}
                draggable onDragStart={() => handleDragStart(idx)} onDragOver={handleDragOver} onDrop={() => handleDrop(idx)}>
                <img src={img.startsWith('data:') ? img : getImageUrl(img, 'img')} alt={`Img ${idx + 1}`} />
                <div className={styles.imageSlotRemove} onClick={() => removeImage(idx)}>✕</div>
                <span className={styles.imageSlotLabel}>{idx === 0 ? 'Principal' : `Foto ${idx + 1}`}</span>
              </div>
            ))}
            {images.length < 4 && (
              <label className={styles.imageSlot} style={{ cursor: 'pointer' }}>
                <span className={styles.imageSlotAdd}>+</span>
                <input type="file" accept="image/*" multiple hidden onChange={handleImageUpload} />
              </label>
            )}
          </div>
        </div>

        {/* Preview */}
        {form.name && (
          <div className={styles.previewSection}>
            <div className={styles.previewLabel}>Preview do card</div>
            <div className={styles.previewCard}>
              <img className={styles.previewCardImg} src={images[0] ? (images[0].startsWith('data:') ? images[0] : getImageUrl(images[0], form.name)) : getImageUrl(null, form.name)} alt="preview" />
              <div className={styles.previewCardInfo}>
                {brandName && <span className={styles.previewCardBrand}>{brandName}</span>}
                <span className={styles.previewCardName}>{form.name}</span>
                {form.price && <span className={styles.previewCardPrice}>{formatPrice(form.price)}</span>}
              </div>
            </div>
          </div>
        )}

        <div className={styles.formActions}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancelar</button>
          <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </motion.div>
    </motion.div>
  )
}

/* ========================================================
   BANNER INLINE FORM (no modal - preview on screen)
   ======================================================== */
function BannerInlineForm({ banner, onSave, onCancel }) {
  const [form, setForm] = useState({
    title: banner?.title || '',
    subtitle: banner?.subtitle || '',
    link: banner?.link || '',
    media_type: banner?.media_type || 'image',
    video_url: banner?.video_url || '',
    animation_type: banner?.animation_type || 'fade',
    effect_type: banner?.effect_type || 'none',
    effect_speed: banner?.effect_speed || 'slow',
    sort_order: banner?.sort_order || 0,
    active: banner?.active ?? true,
  })
  const [image, setImage] = useState(banner?.image_url || '')
  const [saving, setSaving] = useState(false)

  const handleChange = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleImageUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setImage(reader.result)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = { ...form, image_url: image, sort_order: parseInt(form.sort_order) || 0 }
      if (banner?.id) {
        await api.put(`/banners/${banner.id}`, payload)
      } else {
        await api.post('/banners', payload)
      }
      onSave()
    } catch {
      alert('Erro ao salvar banner')
    } finally {
      setSaving(false)
    }
  }

  const animations = [
    { value: 'fade', label: 'Fade' },
    { value: 'slide', label: 'Slide' },
    { value: 'zoom', label: 'Zoom' },
    { value: 'wave', label: 'Wave' },
    { value: 'flip', label: 'Flip' },
  ]
  const effects = [
    { value: 'none', label: 'Nenhum' },
    { value: 'sparkle', label: 'Cintilante' },
    { value: 'comet', label: 'Cometa' },
    { value: 'glow_pulse', label: 'Glow Pulse' },
    { value: 'neon_border', label: 'Neon Border' },
    { value: 'light_sweep', label: 'Light Sweep' },
  ]
  const speeds = [
    { value: 'ultra_slow', label: 'Ultra Lento' },
    { value: 'slow', label: 'Lento' },
    { value: 'fast', label: 'Rápido' },
    { value: 'super_fast', label: 'Super Rápido' },
  ]

  return (
    <motion.div className={styles.bannerInlineForm}
      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>

      {/* Full-width banner preview */}
      <div className={styles.bannerLivePreview}>
        {image ? (
          <img className={styles.bannerLiveImg} src={image.startsWith('data:') ? image : getImageUrl(image, 'banner')} alt="preview" />
        ) : (
          <div className={styles.bannerLivePlaceholder}>
            <FiImage size={48} />
            <span>Preview do Banner</span>
          </div>
        )}
        <div className={styles.bannerLiveOverlay}>
          {form.title && <div className={styles.bannerLiveTitle}>{form.title}</div>}
          {form.subtitle && <div className={styles.bannerLiveSub}>{form.subtitle}</div>}
        </div>
        <div className={styles.bannerLiveBadges}>
          <span className={styles.bannerLiveBadge}>{animations.find(a => a.value === form.animation_type)?.label}</span>
          {form.effect_type !== 'none' && <span className={styles.bannerLiveBadge}>{effects.find(e => e.value === form.effect_type)?.label}</span>}
        </div>
      </div>

      {/* Form fields below preview */}
      <div className={styles.bannerInlineFields}>
        <div className={styles.formRow}>
          <div className={styles.inputGroup}>
            <label className={styles.label}>Título</label>
            <input className={styles.input} value={form.title} onChange={e => handleChange('title', e.target.value)} placeholder="Título do banner" />
          </div>
          <div className={styles.inputGroup}>
            <label className={styles.label}>Subtítulo</label>
            <input className={styles.input} value={form.subtitle} onChange={e => handleChange('subtitle', e.target.value)} placeholder="Subtítulo" />
          </div>
        </div>

        <div className={styles.formRow}>
          <div className={styles.inputGroup}>
            <label className={styles.label}>Tipo de mídia</label>
            <select className={styles.select} value={form.media_type} onChange={e => handleChange('media_type', e.target.value)}>
              <option value="image">Imagem</option>
              <option value="video">Vídeo</option>
            </select>
          </div>
          {form.media_type === 'image' ? (
            <div className={styles.inputGroup}>
              <label className={styles.label}>Imagem</label>
              <label className={styles.uploadBtn}>
                {image ? 'Trocar imagem' : 'Selecionar imagem'}
                <input type="file" accept="image/*" hidden onChange={handleImageUpload} />
              </label>
            </div>
          ) : (
            <div className={styles.inputGroup}>
              <label className={styles.label}>URL do Vídeo</label>
              <input className={styles.input} value={form.video_url} onChange={e => handleChange('video_url', e.target.value)} placeholder="https://..." />
            </div>
          )}
        </div>

        <div className={styles.formRow}>
          <div className={styles.inputGroup}>
            <label className={styles.label}>Link (ao clicar)</label>
            <input className={styles.input} value={form.link} onChange={e => handleChange('link', e.target.value)} placeholder="/produto/1 ou URL externa" />
          </div>
          <div className={styles.inputGroup}>
            <label className={styles.label}>Ordem</label>
            <input className={styles.input} type="number" value={form.sort_order} onChange={e => handleChange('sort_order', e.target.value)} />
          </div>
        </div>

        <div className={styles.formRow}>
          <div className={styles.inputGroup}>
            <label className={styles.label}>Animação</label>
            <select className={styles.select} value={form.animation_type} onChange={e => handleChange('animation_type', e.target.value)}>
              {animations.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </div>
          <div className={styles.inputGroup}>
            <label className={styles.label}>Efeito de luz</label>
            <select className={styles.select} value={form.effect_type} onChange={e => handleChange('effect_type', e.target.value)}>
              {effects.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
            </select>
          </div>
          <div className={styles.inputGroup}>
            <label className={styles.label}>Velocidade</label>
            <select className={styles.select} value={form.effect_speed} onChange={e => handleChange('effect_speed', e.target.value)}>
              {speeds.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>

        <div className={styles.formActions}>
          <button className={styles.cancelBtn} onClick={onCancel}>Cancelar</button>
          <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar Banner'}</button>
        </div>
      </div>
    </motion.div>
  )
}

/* ========================================================
   MAIN ADMIN COMPONENT
   ======================================================== */
export default function Admin() {
  const { user, login, logout } = useContext(AuthContext)
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState('dashboard')
  const [products, setProducts] = useState([])
  const [brands, setBrands] = useState([])
  const [banners, setBanners] = useState([])
  const [reviews, setReviews] = useState([])
  const [orders, setOrders] = useState([])
  const [dashboard, setDashboard] = useState(null)
  const [settings, setSettings] = useState({})
  const [reviewFilter, setReviewFilter] = useState('all')
  const [pendingCount, setPendingCount] = useState(0)
  const [editingProduct, setEditingProduct] = useState(null)
  const [showProductForm, setShowProductForm] = useState(false)
  const [editingBanner, setEditingBanner] = useState(null)
  const [showBannerForm, setShowBannerForm] = useState(false)
  const [expandedOrder, setExpandedOrder] = useState(null)
  const [orderDetails, setOrderDetails] = useState({})
  const [savingSettings, setSavingSettings] = useState(false)

  const loadProducts = useCallback(async () => {
    try {
      const { data } = await api.get('/products')
      setProducts(data)
    } catch {}
  }, [])

  const loadBrands = useCallback(async () => {
    try {
      const { data } = await api.get('/brands')
      setBrands(data)
    } catch {}
  }, [])

  const loadBanners = useCallback(async () => {
    try {
      const { data } = await api.get('/banners/all')
      setBanners(data)
    } catch {}
  }, [])

  const loadReviews = useCallback(async () => {
    try {
      const params = reviewFilter !== 'all' ? { status: reviewFilter } : {}
      const { data } = await api.get('/reviews', { params })
      setReviews(data)
      const { data: all } = await api.get('/reviews', { params: { status: 'pending' } })
      setPendingCount(all.length)
    } catch {}
  }, [reviewFilter])

  const loadOrders = useCallback(async () => {
    try {
      const { data } = await api.get('/orders')
      setOrders(data)
    } catch {}
  }, [])

  const loadDashboard = useCallback(async () => {
    try {
      const { data } = await api.get('/dashboard')
      setDashboard(data)
    } catch {}
  }, [])

  const loadSettings = useCallback(async () => {
    try {
      const { data } = await api.get('/settings')
      setSettings(data)
    } catch {}
  }, [])

  useEffect(() => {
    if (!user) return
    loadDashboard()
    loadProducts()
    loadBrands()
    loadBanners()
    loadReviews()
    loadOrders()
    loadSettings()
  }, [user, loadProducts, loadBrands, loadBanners, loadReviews, loadOrders, loadDashboard, loadSettings])

  const handleDeleteProduct = async (id) => {
    if (!confirm('Remover este produto?')) return
    try {
      await api.delete(`/products/${id}`)
      loadProducts()
    } catch {}
  }

  const handleDeleteBanner = async (id) => {
    if (!confirm('Remover este banner?')) return
    try {
      await api.delete(`/banners/${id}`)
      loadBanners()
    } catch {}
  }

  const handleReviewAction = async (id, status) => {
    try {
      await api.put(`/reviews/${id}/status`, { status })
      loadReviews()
    } catch {}
  }

  const handleDeleteReview = async (id) => {
    if (!confirm('Remover esta avaliação?')) return
    try {
      await api.delete(`/reviews/${id}`)
      loadReviews()
    } catch {}
  }

  const handleOrderStatus = async (id, status) => {
    try {
      await api.put(`/orders/${id}/status`, { status })
      loadOrders()
    } catch {}
  }

  const handleExpandOrder = async (id) => {
    if (expandedOrder === id) { setExpandedOrder(null); return }
    setExpandedOrder(id)
    if (!orderDetails[id]) {
      try {
        const { data } = await api.get(`/orders/${id}`)
        setOrderDetails(prev => ({ ...prev, [id]: data }))
      } catch {}
    }
  }

  const handleSaveSettings = async () => {
    setSavingSettings(true)
    try {
      const keys = ['store_name', 'store_email', 'store_phone', 'store_whatsapp', 'store_instagram', 'store_facebook', 'maintenance_mode']
      for (const key of keys) {
        if (settings[key] !== undefined) {
          await api.post('/settings', { key, value: settings[key] })
        }
      }
      alert('Configurações salvas!')
    } catch {
      alert('Erro ao salvar configurações')
    } finally {
      setSavingSettings(false)
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  if (!user) return <LoginScreen onLogin={login} />

  const tabs = [
    { key: 'dashboard', label: 'Dashboard', icon: <FiBarChart2 /> },
    { key: 'products', label: 'Produtos', icon: <FiPackage /> },
    { key: 'banners', label: 'Banners', icon: <FiImage /> },
    { key: 'orders', label: 'Pedidos', icon: <FiShoppingBag />, badge: orders.filter(o => o.status === 'pending').length || 0 },
    { key: 'reviews', label: 'Reviews', icon: <FiStar />, badge: pendingCount },
    { key: 'settings', label: 'Config', icon: <FiSettings /> },
  ]

  const statusLabels = {
    pending: 'Pendente', confirmed: 'Confirmado', shipped: 'Enviado', delivered: 'Entregue', cancelled: 'Cancelado'
  }
  const statusColors = {
    pending: styles.statusPending, confirmed: styles.statusConfirmed, shipped: styles.statusShipped, delivered: styles.statusApproved, cancelled: styles.statusRejected
  }

  const maxBrand = dashboard?.brandStats?.length ? Math.max(...dashboard.brandStats.map(b => b.count), 1) : 1

  return (
    <div className={styles.adminPage}>
      <div className={styles.topBar}>
        <h1 className={styles.panelTitle}>Painel <span>Admin</span></h1>
        <button className={styles.logoutBtn} onClick={handleLogout}><FiLogOut /> Sair</button>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        {tabs.map(t => (
          <button key={t.key} className={`${styles.tab} ${activeTab === t.key ? styles.activeTab : ''}`} onClick={() => setActiveTab(t.key)}>
            {t.icon} {t.label}
            {t.badge > 0 && <span className={styles.tabBadge}>{t.badge}</span>}
          </button>
        ))}
      </div>

      {/* ===== DASHBOARD TAB ===== */}
      {activeTab === 'dashboard' && dashboard && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className={styles.dashGrid}>
            <div className={styles.dashCard}>
              <div className={styles.dashCardIcon} style={{ background: 'rgba(99,102,241,0.15)', color: '#818CF8' }}><FiPackage size={22} /></div>
              <div className={styles.dashCardInfo}>
                <span className={styles.dashCardValue}>{dashboard.cards.totalProducts}</span>
                <span className={styles.dashCardLabel}>Produtos</span>
              </div>
            </div>
            <div className={styles.dashCard}>
              <div className={styles.dashCardIcon} style={{ background: 'rgba(220,38,38,0.15)', color: '#DC2626' }}><FiShoppingBag size={22} /></div>
              <div className={styles.dashCardInfo}>
                <span className={styles.dashCardValue}>{dashboard.cards.totalOrders}</span>
                <span className={styles.dashCardLabel}>Pedidos</span>
              </div>
            </div>
            <div className={styles.dashCard}>
              <div className={styles.dashCardIcon} style={{ background: 'rgba(34,197,94,0.15)', color: '#22C55E' }}><FiDollarSign size={22} /></div>
              <div className={styles.dashCardInfo}>
                <span className={styles.dashCardValue}>{formatPrice(dashboard.cards.totalRevenue)}</span>
                <span className={styles.dashCardLabel}>Receita Total</span>
              </div>
            </div>
            <div className={styles.dashCard}>
              <div className={styles.dashCardIcon} style={{ background: 'rgba(251,191,36,0.15)', color: '#FBBF24' }}><FiStar size={22} /></div>
              <div className={styles.dashCardInfo}>
                <span className={styles.dashCardValue}>{dashboard.cards.pendingReviews}</span>
                <span className={styles.dashCardLabel}>Reviews Pendentes</span>
              </div>
            </div>
          </div>

          <div className={styles.dashRow}>
            {/* Brand chart */}
            <div className={styles.dashPanel}>
              <h3 className={styles.dashPanelTitle}><FiTrendingUp /> Produtos por Marca</h3>
              <div className={styles.barChart}>
                {dashboard.brandStats.map(b => (
                  <div key={b.name} className={styles.barRow}>
                    <span className={styles.barLabel}>{b.name}</span>
                    <div className={styles.barTrack}>
                      <motion.div className={styles.barFill} initial={{ width: 0 }} animate={{ width: `${(b.count / maxBrand) * 100}%` }} transition={{ duration: 0.8 }} />
                    </div>
                    <span className={styles.barValue}>{b.count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Alerts */}
            <div className={styles.dashPanel}>
              <h3 className={styles.dashPanelTitle}><FiAlertTriangle /> Alertas</h3>
              <div className={styles.alertList}>
                {dashboard.cards.outOfStock > 0 && (
                  <div className={`${styles.alertItem} ${styles.alertDanger}`}>
                    <FiBox /> {dashboard.cards.outOfStock} produto(s) sem estoque
                  </div>
                )}
                {dashboard.cards.pendingOrders > 0 && (
                  <div className={`${styles.alertItem} ${styles.alertWarning}`}>
                    <FiShoppingBag /> {dashboard.cards.pendingOrders} pedido(s) pendente(s)
                  </div>
                )}
                {dashboard.cards.pendingReviews > 0 && (
                  <div className={`${styles.alertItem} ${styles.alertWarning}`}>
                    <FiStar /> {dashboard.cards.pendingReviews} review(s) aguardando moderação
                  </div>
                )}
                {dashboard.lowStock.length > 0 && (
                  <div className={`${styles.alertItem} ${styles.alertInfo}`}>
                    <FiAlertTriangle /> {dashboard.lowStock.length} produto(s) com estoque baixo (≤5)
                  </div>
                )}
                {dashboard.cards.outOfStock === 0 && dashboard.cards.pendingOrders === 0 && dashboard.cards.pendingReviews === 0 && dashboard.lowStock.length === 0 && (
                  <div className={`${styles.alertItem} ${styles.alertOk}`}>
                    <FiCheck /> Tudo em ordem!
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Recent reviews */}
          <div className={styles.dashPanel}>
            <h3 className={styles.dashPanelTitle}><FiStar /> Últimas Reviews</h3>
            {dashboard.recentReviews.length > 0 ? (
              <div className={styles.recentList}>
                {dashboard.recentReviews.map(r => (
                  <div key={r.id} className={styles.recentItem}>
                    <div className={styles.recentItemMain}>
                      <span className={styles.recentName}>{r.customer_name}</span>
                      <span className={styles.reviewStars}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                    </div>
                    <span className={styles.recentProd}>{r.product_name}</span>
                    {r.comment && <span className={styles.recentComment}>{r.comment.substring(0, 80)}{r.comment.length > 80 ? '...' : ''}</span>}
                    <span className={`${styles.statusBadge} ${r.status === 'pending' ? styles.statusPending : r.status === 'approved' ? styles.statusApproved : styles.statusRejected}`}>
                      {r.status === 'pending' ? 'Pendente' : r.status === 'approved' ? 'Aprovada' : 'Rejeitada'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className={styles.noData}>Nenhuma review ainda</p>
            )}
          </div>
        </motion.div>
      )}

      {/* ===== PRODUCTS TAB ===== */}
      {activeTab === 'products' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>Produtos ({products.length})</span>
            <button className={styles.addBtn} onClick={() => { setEditingProduct(null); setShowProductForm(true) }}>
              <FiPlus /> Novo Produto
            </button>
          </div>

          <div className={styles.adminGrid}>
            {products.map(p => (
              <motion.div key={p.id} className={styles.adminCard} layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                <img className={styles.adminCardImg} src={getImageUrl(p.image_url, p.name)} alt={p.name} />
                <div className={styles.adminCardBody}>
                  <span className={styles.adminCardBrand}>{p.brand_name}</span>
                  <span className={styles.adminCardName}>{p.name}</span>
                  <span className={styles.adminCardPrice}>{formatPrice(p.price)}</span>
                  <div className={styles.adminCardMeta}>
                    <span>Estoque: {p.stock}</span>
                    <span>Tam: {p.sizes}</span>
                  </div>
                  <div className={styles.adminCardActions}>
                    <button className={styles.editBtn} onClick={() => { setEditingProduct(p); setShowProductForm(true) }}><FiEdit2 /> Editar</button>
                    <button className={styles.deleteBtn} onClick={() => handleDeleteProduct(p.id)}><FiTrash2 /></button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
          {products.length === 0 && <p className={styles.noData}>Nenhum produto cadastrado</p>}

          <AnimatePresence>
            {showProductForm && (
              <ProductFormModal
                product={editingProduct}
                brands={brands}
                onSave={() => { setShowProductForm(false); loadProducts() }}
                onClose={() => setShowProductForm(false)}
              />
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* ===== BANNERS TAB (inline, no modal) ===== */}
      {activeTab === 'banners' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>Banners ({banners.length})</span>
            {!showBannerForm && (
              <button className={styles.addBtn} onClick={() => { setEditingBanner(null); setShowBannerForm(true) }}>
                <FiPlus /> Novo Banner
              </button>
            )}
          </div>

          <AnimatePresence>
            {showBannerForm && (
              <BannerInlineForm
                banner={editingBanner}
                onSave={() => { setShowBannerForm(false); setEditingBanner(null); loadBanners() }}
                onCancel={() => { setShowBannerForm(false); setEditingBanner(null) }}
              />
            )}
          </AnimatePresence>

          <div className={styles.adminGrid}>
            {banners.map(b => (
              <motion.div key={b.id} className={styles.adminCard} layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                <img className={styles.adminCardImg} src={getImageUrl(b.image_url, b.title || 'Banner')} alt={b.title} />
                <div className={styles.adminCardBody}>
                  <span className={styles.adminCardName}>{b.title || 'Sem título'}</span>
                  {b.subtitle && <span className={styles.adminCardMeta}>{b.subtitle}</span>}
                  <div className={styles.bannerBadges}>
                    <span className={styles.bannerBadge}>{b.animation_type}</span>
                    {b.effect_type !== 'none' && <span className={styles.bannerBadge}>{b.effect_type}</span>}
                    <span className={styles.bannerBadge}>{b.effect_speed}</span>
                  </div>
                  <div className={styles.adminCardActions}>
                    <button className={styles.editBtn} onClick={() => { setEditingBanner(b); setShowBannerForm(true) }}><FiEdit2 /> Editar</button>
                    <button className={styles.deleteBtn} onClick={() => handleDeleteBanner(b.id)}><FiTrash2 /></button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
          {banners.length === 0 && !showBannerForm && <p className={styles.noData}>Nenhum banner cadastrado</p>}
        </motion.div>
      )}

      {/* ===== ORDERS TAB ===== */}
      {activeTab === 'orders' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>Pedidos ({orders.length})</span>
          </div>

          {orders.length > 0 ? (
            <div className={styles.ordersList}>
              {orders.map(o => (
                <motion.div key={o.id} className={styles.orderCard} layout>
                  <div className={styles.orderHeader} onClick={() => handleExpandOrder(o.id)}>
                    <div className={styles.orderMainInfo}>
                      <span className={styles.orderId}>#{o.id}</span>
                      <span className={styles.orderCustomer}>{o.customer_name || 'Cliente'}</span>
                      <span className={styles.orderTotal}>{formatPrice(o.total || 0)}</span>
                    </div>
                    <div className={styles.orderRightInfo}>
                      <span className={`${styles.statusBadge} ${statusColors[o.status]}`}>
                        {statusLabels[o.status]}
                      </span>
                      <span className={styles.orderDate}>{new Date(o.created_at).toLocaleDateString('pt-BR')}</span>
                      {expandedOrder === o.id ? <FiChevronUp /> : <FiChevronDown />}
                    </div>
                  </div>

                  <AnimatePresence>
                    {expandedOrder === o.id && (
                      <motion.div className={styles.orderExpanded}
                        initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                        <div className={styles.orderContactInfo}>
                          {o.customer_email && <span>Email: {o.customer_email}</span>}
                          {o.customer_phone && <span>Telefone: {o.customer_phone}</span>}
                        </div>

                        {orderDetails[o.id]?.items?.length > 0 && (
                          <div className={styles.orderItems}>
                            {orderDetails[o.id].items.map((item, idx) => (
                              <div key={idx} className={styles.orderItem}>
                                <img className={styles.orderItemImg} src={getImageUrl(item.image_url, item.product_name)} alt={item.product_name} />
                                <div className={styles.orderItemInfo}>
                                  <span className={styles.orderItemName}>{item.product_name}</span>
                                  <span className={styles.orderItemDetail}>Tam: {item.size} | Qtd: {item.quantity}</span>
                                </div>
                                <span className={styles.orderItemPrice}>{formatPrice(item.price)}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className={styles.orderStatusActions}>
                          <span className={styles.label}>Alterar status:</span>
                          <div className={styles.statusBtns}>
                            {Object.entries(statusLabels).map(([k, v]) => (
                              <button key={k}
                                className={`${styles.statusChangeBtn} ${o.status === k ? styles.statusChangeActive : ''}`}
                                onClick={() => handleOrderStatus(o.id, k)}
                                disabled={o.status === k}>
                                {v}
                              </button>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </div>
          ) : (
            <p className={styles.noData}>Nenhum pedido encontrado</p>
          )}
        </motion.div>
      )}

      {/* ===== REVIEWS TAB ===== */}
      {activeTab === 'reviews' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>Avaliações</span>
          </div>

          <div className={styles.filterRow}>
            {['all', 'pending', 'approved', 'rejected'].map(f => (
              <button key={f} className={`${styles.filterBtn} ${reviewFilter === f ? styles.activeFilter : ''}`} onClick={() => setReviewFilter(f)}>
                {f === 'all' ? 'Todas' : f === 'pending' ? 'Pendentes' : f === 'approved' ? 'Aprovadas' : 'Rejeitadas'}
              </button>
            ))}
          </div>

          {reviews.length > 0 ? (
            <div className={styles.tableWrap}>
              <table className={styles.reviewsTable}>
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>Cliente</th>
                    <th>Nota</th>
                    <th>Comentário</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {reviews.map(r => (
                    <tr key={r.id}>
                      <td>{r.product_name}</td>
                      <td>{r.customer_name}</td>
                      <td><span className={styles.reviewStars}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span></td>
                      <td>{r.comment?.substring(0, 60)}{r.comment?.length > 60 ? '...' : ''}</td>
                      <td>
                        <span className={`${styles.statusBadge} ${r.status === 'pending' ? styles.statusPending : r.status === 'approved' ? styles.statusApproved : styles.statusRejected}`}>
                          {r.status === 'pending' ? 'Pendente' : r.status === 'approved' ? 'Aprovada' : 'Rejeitada'}
                        </span>
                      </td>
                      <td>
                        {r.status !== 'approved' && (
                          <button className={`${styles.actionBtn} ${styles.approveBtn}`} onClick={() => handleReviewAction(r.id, 'approved')}><FiCheck /></button>
                        )}
                        {r.status !== 'rejected' && (
                          <button className={`${styles.actionBtn} ${styles.rejectBtn}`} onClick={() => handleReviewAction(r.id, 'rejected')}><FiX /></button>
                        )}
                        <button className={`${styles.actionBtn} ${styles.rejectBtn}`} onClick={() => handleDeleteReview(r.id)}><FiTrash2 /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={styles.noData}>Nenhuma avaliação encontrada</p>
          )}
        </motion.div>
      )}

      {/* ===== SETTINGS TAB ===== */}
      {activeTab === 'settings' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>Configurações da Loja</span>
          </div>

          <div className={styles.settingsForm}>
            <div className={styles.settingsGroup}>
              <h4 className={styles.settingsGroupTitle}>Informações da Loja</h4>
              <div className={styles.formRow}>
                <div className={styles.inputGroup}>
                  <label className={styles.label}>Nome da Loja</label>
                  <input className={styles.input} value={settings.store_name || ''} onChange={e => setSettings(p => ({ ...p, store_name: e.target.value }))} placeholder="MJ Sneakers" />
                </div>
                <div className={styles.inputGroup}>
                  <label className={styles.label}>Email</label>
                  <input className={styles.input} type="email" value={settings.store_email || ''} onChange={e => setSettings(p => ({ ...p, store_email: e.target.value }))} placeholder="contato@mjsneakers.com" />
                </div>
              </div>
              <div className={styles.formRow}>
                <div className={styles.inputGroup}>
                  <label className={styles.label}>Telefone</label>
                  <input className={styles.input} value={settings.store_phone || ''} onChange={e => setSettings(p => ({ ...p, store_phone: e.target.value }))} placeholder="(11) 99999-9999" />
                </div>
                <div className={styles.inputGroup}>
                  <label className={styles.label}>WhatsApp</label>
                  <input className={styles.input} value={settings.store_whatsapp || ''} onChange={e => setSettings(p => ({ ...p, store_whatsapp: e.target.value }))} placeholder="5511999999999" />
                </div>
              </div>
            </div>

            <div className={styles.settingsGroup}>
              <h4 className={styles.settingsGroupTitle}>Redes Sociais</h4>
              <div className={styles.formRow}>
                <div className={styles.inputGroup}>
                  <label className={styles.label}>Instagram</label>
                  <input className={styles.input} value={settings.store_instagram || ''} onChange={e => setSettings(p => ({ ...p, store_instagram: e.target.value }))} placeholder="@mjsneakers" />
                </div>
                <div className={styles.inputGroup}>
                  <label className={styles.label}>Facebook</label>
                  <input className={styles.input} value={settings.store_facebook || ''} onChange={e => setSettings(p => ({ ...p, store_facebook: e.target.value }))} placeholder="facebook.com/mjsneakers" />
                </div>
              </div>
            </div>

            <div className={styles.settingsGroup}>
              <h4 className={styles.settingsGroupTitle}>Manutenção</h4>
              <label className={styles.toggleRow}>
                <input type="checkbox" checked={settings.maintenance_mode === 'true'} onChange={e => setSettings(p => ({ ...p, maintenance_mode: e.target.checked ? 'true' : 'false' }))} />
                <span className={styles.toggleSwitch} />
                <span className={styles.toggleLabel}>Modo manutenção (desativa o site para clientes)</span>
              </label>
            </div>

            <button className={styles.saveBtn} onClick={handleSaveSettings} disabled={savingSettings} style={{ maxWidth: 250 }}>
              <FiSave /> {savingSettings ? 'Salvando...' : 'Salvar Configurações'}
            </button>
          </div>
        </motion.div>
      )}
    </div>
  )
}
