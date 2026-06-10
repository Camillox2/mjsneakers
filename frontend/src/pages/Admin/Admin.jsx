import { useState, useContext, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { FiPlus, FiEdit2, FiTrash2, FiLogOut, FiPackage, FiImage, FiStar, FiCheck, FiX, FiBarChart2, FiShoppingBag, FiSettings, FiChevronDown, FiChevronUp, FiAlertTriangle, FiTrendingUp, FiBox, FiUsers, FiDollarSign, FiSave, FiTag, FiPercent, FiType, FiFileText, FiShield, FiSliders, FiMenu, FiMessageSquare, FiGift, FiPieChart, FiHome, FiList, FiZap, FiActivity, FiBell, FiMail } from 'react-icons/fi'
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
    discount_percentage: product?.discount_percentage ?? 0,
    brand_id: product?.brand_id || '',
    sizes: product?.sizes || '38,39,40,41,42,43,44',
    stock: product?.stock || 10,
    active: product?.active ?? true,
    featured: product?.featured ?? false,
    feature_order: product?.feature_order ?? 0,
    meta_title: product?.meta_title || '',
    meta_description: product?.meta_description || '',
    tags: product?.tags || '',
    promo_start: product?.promo_start ? product.promo_start.slice(0, 16) : '',
    promo_end: product?.promo_end ? product.promo_end.slice(0, 16) : '',
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
      // Upload images that are base64 (new uploads)
      const uploadedImages = [...images]
      for (let i = 0; i < uploadedImages.length; i++) {
        if (uploadedImages[i] && uploadedImages[i].startsWith('data:')) {
          try {
            const blob = await (await fetch(uploadedImages[i])).blob()
            const formData = new FormData()
            formData.append('image', blob, `product-${Date.now()}-${i}.jpg`)
            formData.append('category', 'products')
            const { data: uploadResult } = await api.post('/upload/single', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
            uploadedImages[i] = uploadResult.url
          } catch {
            // Keep as-is if upload fails
          }
        }
      }

      const payload = {
        ...form,
        price: parseFloat(form.price),
        discount_percentage: Math.max(0, Math.min(90, parseFloat(form.discount_percentage) || 0)),
        brand_id: parseInt(form.brand_id) || null,
        stock: parseInt(form.stock) || 0,
        featured: form.featured ? 1 : 0,
        feature_order: parseInt(form.feature_order) || 0,
        promo_start: form.promo_start || null,
        promo_end: form.promo_end || null,
        image_url: uploadedImages[0] || null,
        image_url_2: uploadedImages[1] || null,
        image_url_3: uploadedImages[2] || null,
        image_url_4: uploadedImages[3] || null,
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
  const previewDiscount = Math.max(0, Math.min(90, parseFloat(form.discount_percentage) || 0))
  const previewFinalPrice = form.price ? Number(form.price) * (1 - previewDiscount / 100) : 0

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
          <label className={styles.label}>Desconto (%)</label>
          <input
            className={styles.input}
            type="number"
            min="0"
            max="90"
            step="0.1"
            value={form.discount_percentage}
            onChange={e => handleChange('discount_percentage', e.target.value)}
            placeholder="0"
          />
        </div>

        <div className={styles.inputGroup}>
          <label className={styles.label}>Tamanhos (separados por vírgula)</label>
          <input className={styles.input} value={form.sizes} onChange={e => handleChange('sizes', e.target.value)} placeholder="38,39,40,41,42,43,44" />
        </div>

        {/* Featured & SEO */}
        <div className={styles.formRow}>
          <div className={styles.inputGroup}>
            <label className={styles.toggleRow}>
              <input type="checkbox" checked={form.featured} onChange={e => handleChange('featured', e.target.checked)} />
              <span className={styles.toggleSwitch} />
              <span className={styles.toggleLabel}>Produto em Destaque</span>
            </label>
          </div>
          {form.featured && (
            <div className={styles.inputGroup}>
              <label className={styles.label}>Ordem destaque</label>
              <input className={styles.input} type="number" value={form.feature_order} onChange={e => handleChange('feature_order', e.target.value)} />
            </div>
          )}
        </div>

        <div className={styles.formRow}>
          <div className={styles.inputGroup}>
            <label className={styles.label}>Tags (SEO, vírgula)</label>
            <input className={styles.input} value={form.tags} onChange={e => handleChange('tags', e.target.value)} placeholder="nike, air max, corrida" />
          </div>
        </div>

        <div className={styles.formRow}>
          <div className={styles.inputGroup}>
            <label className={styles.label}>Meta Title (SEO)</label>
            <input className={styles.input} value={form.meta_title} onChange={e => handleChange('meta_title', e.target.value)} placeholder="Título para SEO" />
          </div>
          <div className={styles.inputGroup}>
            <label className={styles.label}>Meta Description (SEO)</label>
            <input className={styles.input} value={form.meta_description} onChange={e => handleChange('meta_description', e.target.value)} placeholder="Descrição para SEO" />
          </div>
        </div>

        <div className={styles.formRow}>
          <div className={styles.inputGroup}>
            <label className={styles.label}>Início Promoção</label>
            <input className={styles.input} type="datetime-local" value={form.promo_start} onChange={e => handleChange('promo_start', e.target.value)} />
          </div>
          <div className={styles.inputGroup}>
            <label className={styles.label}>Fim Promoção</label>
            <input className={styles.input} type="datetime-local" value={form.promo_end} onChange={e => handleChange('promo_end', e.target.value)} />
          </div>
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
                {form.price && previewDiscount > 0 && (
                  <span className={styles.adminCardMeta} style={{ textDecoration: 'line-through' }}>{formatPrice(form.price)}</span>
                )}
                {form.price && <span className={styles.previewCardPrice}>{formatPrice(previewFinalPrice || form.price)}</span>}
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

/* ========================================================
   LOYALTY PANEL
   ======================================================== */
function LoyaltyPanel() {
  const [customers, setCustomers] = useState([])
  const [bonusForm, setBonusForm] = useState({ email: '', points: '', description: '' })
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/loyalty')
      setCustomers(data)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleBonus = async (e) => {
    e.preventDefault()
    try {
      await api.post('/loyalty/bonus', bonusForm)
      setBonusForm({ email: '', points: '', description: '' })
      load()
    } catch { alert('Erro ao adicionar bônus') }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>Programa de Fidelidade</span>
      </div>

      <div className={styles.settingsGroup} style={{ marginBottom: '1.5rem' }}>
        <h4 className={styles.settingsGroupTitle}>Adicionar Pontos Bônus</h4>
        <form onSubmit={handleBonus} className={styles.formRow}>
          <div className={styles.inputGroup}>
            <label className={styles.label}>Email do cliente</label>
            <input className={styles.input} type="email" placeholder="cliente@email.com" value={bonusForm.email}
              onChange={e => setBonusForm(p => ({ ...p, email: e.target.value }))} required />
          </div>
          <div className={styles.inputGroup}>
            <label className={styles.label}>Pontos</label>
            <input className={styles.input} type="number" min="1" placeholder="100" value={bonusForm.points}
              onChange={e => setBonusForm(p => ({ ...p, points: e.target.value }))} required />
          </div>
          <div className={styles.inputGroup}>
            <label className={styles.label}>Motivo</label>
            <input className={styles.input} placeholder="Bônus de aniversário" value={bonusForm.description}
              onChange={e => setBonusForm(p => ({ ...p, description: e.target.value }))} />
          </div>
          <button type="submit" className={styles.saveBtn} style={{ alignSelf: 'flex-end', minWidth: 120 }}>Adicionar</button>
        </form>
      </div>

      {loading ? <div className={styles.loadingState}><div className={styles.loadingSpinner} /><span>Carregando...</span></div> : (
        <div className={styles.tableWrap}>
          <table className={styles.reviewsTable}>
            <thead><tr><th>Cliente</th><th>Email</th><th>Pontos</th><th>Total Ganho</th><th>Total Resgatado</th></tr></thead>
            <tbody>
              {customers.map(c => (
                <tr key={c.id}>
                  <td>{c.customer_name || '-'}</td>
                  <td>{c.customer_email}</td>
                  <td><strong style={{ color: '#22C55E' }}>{c.points}</strong></td>
                  <td>{c.total_earned}</td>
                  <td>{c.total_redeemed}</td>
                </tr>
              ))}
              {customers.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: '#666', padding: '2rem' }}>Nenhum cliente com pontos ainda</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  )
}

/* ========================================================
   LIVE CHAT PANEL
   ======================================================== */
function LiveChatPanel() {
  const [sessions, setSessions] = useState([])
  const [activeSession, setActiveSession] = useState(null)
  const [messages, setMessages] = useState([])
  const [reply, setReply] = useState('')
  const [socket, setSocket] = useState(null)
  const msgEndRef = useRef(null)

  useEffect(() => {
    let ioInst = null
    import('socket.io-client').then(({ io }) => {
      ioInst = io(import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3305')
      ioInst.emit('admin:join')
      ioInst.on('sessions:list', setSessions)
      ioInst.on('session:new', s => setSessions(prev => [s, ...prev.filter(x => x.session_id !== s.session_id)]))
      ioInst.on('session:closed', ({ sessionId }) => setSessions(prev => prev.map(s => s.session_id === sessionId ? { ...s, status: 'closed' } : s)))
      ioInst.on('chat:message', msg => setMessages(prev => [...prev, msg]))
      ioInst.on('chat:history', setMessages)
      setSocket(ioInst)
    }).catch(() => {})
    return () => ioInst?.disconnect()
  }, [])

  useEffect(() => { msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const openSession = (s) => {
    setActiveSession(s)
    setMessages([])
    socket?.emit('admin:join-session', { sessionId: s.session_id })
  }

  const sendReply = () => {
    if (!reply.trim() || !activeSession) return
    socket?.emit('admin:message', { sessionId: activeSession.session_id, message: reply })
    setReply('')
  }

  const closeSession = () => {
    if (!activeSession) return
    socket?.emit('session:close', { sessionId: activeSession.session_id })
    setActiveSession(null)
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>Chat ao Vivo</span>
      </div>
      <div className={styles.chatLayout}>
        <div className={styles.chatSessions}>
          <div className={styles.chatSessionsHeader}>Conversas</div>
          {sessions.length === 0 && <p className={styles.noData} style={{ padding: '1rem', fontSize: '0.8rem' }}>Nenhuma conversa ativa</p>}
          {sessions.map(s => (
            <div key={s.session_id}
              className={`${styles.chatSessionItem} ${activeSession?.session_id === s.session_id ? styles.chatSessionActive : ''} ${s.status === 'closed' ? styles.chatSessionClosed : ''}`}
              onClick={() => openSession(s)}>
              <div className={styles.chatSessionName}>{s.customer_name || 'Cliente'}</div>
              <div className={styles.chatSessionEmail}>{s.customer_email || s.session_id.slice(0, 8)}</div>
              <span className={`${styles.chatSessionStatus} ${s.status === 'open' ? styles.chatStatusOpen : ''}`}>{s.status}</span>
            </div>
          ))}
        </div>

        <div className={styles.chatMain}>
          {!activeSession ? (
            <div className={styles.chatEmpty}>
              <FiMessageSquare size={40} style={{ opacity: 0.2 }} />
              <p>Selecione uma conversa</p>
            </div>
          ) : (
            <>
              <div className={styles.chatHeader}>
                <span>{activeSession.customer_name || 'Cliente'} — {activeSession.customer_email}</span>
                {activeSession.status === 'open' && <button className={styles.cancelBtn} onClick={closeSession}>Encerrar</button>}
              </div>
              <div className={styles.chatMessages}>
                {messages.map(m => (
                  <div key={m.id} className={`${styles.chatMsg} ${m.sender === 'admin' ? styles.chatMsgAdmin : styles.chatMsgCustomer}`}>
                    <span className={styles.chatMsgSender}>{m.sender === 'admin' ? 'Você' : (activeSession.customer_name || 'Cliente')}</span>
                    <div className={styles.chatMsgBubble}>{m.message}</div>
                    <span className={styles.chatMsgTime}>{new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                ))}
                <div ref={msgEndRef} />
              </div>
              {activeSession.status === 'open' && (
                <div className={styles.chatInput}>
                  <input className={styles.input} placeholder="Digite uma resposta..." value={reply}
                    onChange={e => setReply(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendReply()} />
                  <button className={styles.saveBtn} onClick={sendReply} style={{ minWidth: 80 }}>Enviar</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </motion.div>
  )
}

/* ========================================================
   REPORTS PANEL
   ======================================================== */
function ReportsPanel() {
  const [data, setData] = useState({})
  const [loading, setLoading] = useState(true)
  const formatPrice = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [brand, monthly, top, funnel] = await Promise.all([
          api.get('/reports/revenue-by-brand'),
          api.get('/reports/monthly-revenue'),
          api.get('/reports/top-products'),
          api.get('/reports/funnel'),
        ])
        setData({ brand: brand.data, monthly: monthly.data, top: top.data, funnel: funnel.data })
      } catch (e) { console.error(e) }
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className={styles.loadingState}><div className={styles.loadingSpinner} /><span>Carregando relatórios...</span></div>

  const maxBrand = data.brand?.length ? Math.max(...data.brand.map(b => b.revenue), 1) : 1
  const maxMonthly = data.monthly?.length ? Math.max(...data.monthly.map(m => m.revenue), 1) : 1
  const maxFunnel = data.funnel?.[0]?.value || 1

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>Analytics & Relatórios</span>
      </div>

      <div className={styles.reportsGrid}>
        {/* Revenue by Brand */}
        <div className={styles.reportCard}>
          <h3 className={styles.reportCardTitle}><FiBarChart2 /> Receita por Marca</h3>
          <div className={styles.barChart}>
            {(data.brand || []).map(b => (
              <div key={b.name} className={styles.barRow}>
                <span className={styles.barLabel}>{b.name}</span>
                <div className={styles.barTrack}>
                  <motion.div className={styles.barFill} style={{ background: 'linear-gradient(90deg, #e31837, #ff6b35)' }}
                    initial={{ width: 0 }} animate={{ width: `${(b.revenue / maxBrand) * 100}%` }} transition={{ duration: 0.8 }} />
                </div>
                <span className={styles.barValue}>{formatPrice(b.revenue)}</span>
              </div>
            ))}
            {!data.brand?.length && <p className={styles.noData}>Sem dados de receita por marca</p>}
          </div>
        </div>

        {/* Monthly Revenue */}
        <div className={styles.reportCard}>
          <h3 className={styles.reportCardTitle}><FiTrendingUp /> Receita Mensal (12m)</h3>
          <div className={styles.monthlyChart}>
            {(data.monthly || []).map(m => (
              <div key={m.month} className={styles.monthBar}>
                <div className={styles.monthBarFill} style={{ height: `${(m.revenue / maxMonthly) * 100}%` }}>
                  <span className={styles.monthBarTip}>{formatPrice(m.revenue)}</span>
                </div>
                <span className={styles.monthBarLabel}>{m.month?.slice(5)}</span>
              </div>
            ))}
            {!data.monthly?.length && <p className={styles.noData}>Sem dados mensais</p>}
          </div>
        </div>

        {/* Top Products */}
        <div className={styles.reportCard}>
          <h3 className={styles.reportCardTitle}><FiStar /> Top 10 Produtos</h3>
          <div className={styles.tableWrap} style={{ maxHeight: 300 }}>
            <table className={styles.reviewsTable}>
              <thead><tr><th>#</th><th>Produto</th><th>Vendas</th><th>Receita</th></tr></thead>
              <tbody>
                {(data.top || []).map((p, i) => (
                  <tr key={i}>
                    <td style={{ color: i < 3 ? '#FBBF24' : '#666', fontWeight: 700 }}>{i + 1}</td>
                    <td>{p.name}</td>
                    <td>{p.sales}</td>
                    <td>{formatPrice(p.revenue)}</td>
                  </tr>
                ))}
                {!data.top?.length && <tr><td colSpan={4} style={{ textAlign: 'center', color: '#666', padding: '1rem' }}>Sem dados</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* Conversion Funnel */}
        <div className={styles.reportCard}>
          <h3 className={styles.reportCardTitle}><FiActivity /> Funil de Conversão</h3>
          <div className={styles.funnelChart}>
            {(data.funnel || []).map((step, i) => (
              <div key={step.stage} className={styles.funnelStep}>
                <div className={styles.funnelBar} style={{ width: `${Math.max((step.value / maxFunnel) * 100, 10)}%` }}>
                  <span className={styles.funnelLabel}>{step.stage}</span>
                  <span className={styles.funnelValue}>{step.value.toLocaleString()}</span>
                </div>
                {i < (data.funnel.length - 1) && data.funnel[i + 1] && step.value > 0 && (
                  <span className={styles.funnelRate}>{((data.funnel[i+1].value / step.value) * 100).toFixed(1)}% conversão</span>
                )}
              </div>
            ))}
            {!data.funnel?.length && <p className={styles.noData}>Sem dados de funil</p>}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export default function Admin() {
  const { user, login, logout } = useContext(AuthContext)
  const navigate = useNavigate()

  const [sidebarOpen, setSidebarOpen] = useState(true)
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
  const [savingPromotions, setSavingPromotions] = useState(false)
  const [savingDiscountId, setSavingDiscountId] = useState(null)

  /* NEW: Tickers, Coupons, Admins, Audit, Appearance */
  const [tickers, setTickers] = useState([])
  const [tickerForm, setTickerForm] = useState(null)
  const [coupons, setCoupons] = useState([])
  const [couponForm, setCouponForm] = useState(null)
  const [admins, setAdmins] = useState([])
  const [adminForm, setAdminForm] = useState({ username: '', password: '' })
  const [auditLogs, setAuditLogs] = useState([])
  const [auditPage, setAuditPage] = useState(1)
  const [auditTotal, setAuditTotal] = useState(0)
  const [appearance, setAppearance] = useState({})
  const [savingAppearance, setSavingAppearance] = useState(false)
  const [changePasswordForm, setChangePasswordForm] = useState({ current: '', new_password: '', confirm: '' })

  /* NEW: Customers, Categories, Bulk, Inline edit, Order notes/tracking */
  const [customers, setCustomers] = useState([])
  const [customerPage, setCustomerPage] = useState(1)
  const [customerTotal, setCustomerTotal] = useState(0)
  const [customerSearch, setCustomerSearch] = useState('')
  const [categories, setCategories] = useState([])
  const [categoryForm, setCategoryForm] = useState(null)
  const [selectedProducts, setSelectedProducts] = useState([])
  const [inlineEdit, setInlineEdit] = useState({}) // { productId: { field, value } }
  const [orderNote, setOrderNote] = useState({}) // { orderId: text }
  const [orderTracking, setOrderTracking] = useState({}) // { orderId: code }
  const [orderSearch, setOrderSearch] = useState('')
  const [orderStatusFilter, setOrderStatusFilter] = useState('')
  const [exportingCsv, setExportingCsv] = useState(false)
  const [orderPage, setOrderPage] = useState(1)
  const [orderTotal, setOrderTotal] = useState(0)

  const loadProducts = useCallback(async () => {
    try {
      const { data } = await api.get('/products', { params: { limit: 200 } })
      const items = data.data || data
      setProducts(Array.isArray(items) ? items : [])
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
      setAppearance({
        primary_color: data.primary_color || '#e31837',
        bg_color: data.bg_color || '#111111',
        card_color: data.card_color || '#1a1a1a',
        text_color: data.text_color || '#ffffff',
        footer_email: data.footer_email || '',
        footer_credit: data.footer_credit || '',
        footer_phone: data.footer_phone || '',
        footer_instagram: data.footer_instagram || '',
        footer_address: data.footer_address || '',
      })
    } catch {}
  }, [])

  const loadTickers = useCallback(async () => {
    try { const { data } = await api.get('/tickers/all'); setTickers(data) } catch {}
  }, [])

  const loadCoupons = useCallback(async () => {
    try { const { data } = await api.get('/coupons'); setCoupons(data) } catch {}
  }, [])

  const loadAdmins = useCallback(async () => {
    try { const { data } = await api.get('/auth/admins'); setAdmins(data) } catch {}
  }, [])

  const loadAuditLogs = useCallback(async () => {
    try {
      const { data } = await api.get('/audit', { params: { page: auditPage, limit: 30 } })
      setAuditLogs(data.data || data)
      setAuditTotal(data.pages || 1)
    } catch {}
  }, [auditPage])

  const loadCustomers = useCallback(async () => {
    try {
      const { data } = await api.get('/customers', { params: { page: customerPage, limit: 20, search: customerSearch || undefined } })
      const items = data.data || data
      setCustomers(Array.isArray(items) ? items : [])
      setCustomerTotal(data.pages || 1)
    } catch {}
  }, [customerPage, customerSearch])

  const loadCategories = useCallback(async () => {
    try {
      const { data } = await api.get('/categories')
      setCategories(data)
    } catch {}
  }, [])

  const loadOrders = useCallback(async () => {
    try {
      const params = { page: orderPage, limit: 20 }
      if (orderSearch) params.search = orderSearch
      if (orderStatusFilter) params.status = orderStatusFilter
      const { data } = await api.get('/orders', { params })
      const items = data.data || data
      setOrders(Array.isArray(items) ? items : [])
      setOrderTotal(data.pages || 1)
    } catch {}
  }, [orderPage, orderSearch, orderStatusFilter])

  useEffect(() => {
    if (!user) return
    loadDashboard()
    loadProducts()
    loadBrands()
    loadBanners()
    loadReviews()
    loadOrders()
    loadSettings()
    loadTickers()
    loadCoupons()
    loadAdmins()
    loadAuditLogs()
    loadCustomers()
    loadCategories()
  }, [user, loadProducts, loadBrands, loadBanners, loadReviews, loadOrders, loadDashboard, loadSettings, loadTickers, loadCoupons, loadAdmins, loadAuditLogs, loadCustomers, loadCategories])

  useEffect(() => { if (user) loadCustomers() }, [user, customerPage, customerSearch, loadCustomers])
  useEffect(() => { if (user) loadOrders() }, [user, orderPage, orderSearch, orderStatusFilter, loadOrders])

  useEffect(() => {
    if (user) loadAuditLogs()
  }, [auditPage, loadAuditLogs, user])

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
      const keys = [
        'store_name',
        'store_email',
        'store_phone',
        'store_whatsapp',
        'store_instagram',
        'store_facebook',
        'maintenance_mode',
        'home_promo_enabled',
        'home_promo_tag',
        'home_promo_text',
        'home_promo_button_text',
        'home_promo_button_link',
      ]
      for (const key of keys) {
        if (settings[key] !== undefined) {
          await api.put('/settings', { key, value: settings[key] })
        }
      }
      alert('Configurações salvas!')
    } catch {
      alert('Erro ao salvar configurações')
    } finally {
      setSavingSettings(false)
    }
  }

  const handleSavePromotions = async () => {
    setSavingPromotions(true)
    try {
      const keys = [
        'home_promo_enabled',
        'home_promo_tag',
        'home_promo_text',
        'home_promo_button_text',
        'home_promo_button_link',
      ]
      for (const key of keys) {
        await api.put('/settings', { key, value: settings[key] || '' })
      }
      alert('Campanha da home salva!')
    } catch {
      alert('Erro ao salvar campanha')
    } finally {
      setSavingPromotions(false)
    }
  }

  const handleQuickDiscountChange = (productId, value) => {
    setProducts(prev => prev.map(p => p.id === productId ? { ...p, discount_percentage: value } : p))
  }

  const handleSaveQuickDiscount = async (productId) => {
    const product = products.find(p => p.id === productId)
    if (!product) return

    setSavingDiscountId(productId)
    try {
      const discount = Math.max(0, Math.min(90, parseFloat(product.discount_percentage) || 0))
      await api.put(`/products/${productId}`, {
        name: product.name,
        description: product.description,
        price: parseFloat(product.price),
        discount_percentage: discount,
        brand_id: product.brand_id || null,
        image_url: product.image_url || null,
        image_url_2: product.image_url_2 || null,
        image_url_3: product.image_url_3 || null,
        image_url_4: product.image_url_4 || null,
        sizes: product.sizes,
        stock: parseInt(product.stock) || 0,
        active: product.active ?? true,
      })
      loadProducts()
    } catch {
      alert('Erro ao salvar desconto')
    } finally {
      setSavingDiscountId(null)
    }
  }

  /* ---- Ticker Handlers ---- */
  const handleSaveTicker = async () => {
    if (!tickerForm) return
    try {
      if (tickerForm.id) {
        await api.put(`/tickers/${tickerForm.id}`, tickerForm)
      } else {
        await api.post('/tickers', tickerForm)
      }
      setTickerForm(null)
      loadTickers()
    } catch { alert('Erro ao salvar ticker') }
  }
  const handleDeleteTicker = async (id) => {
    if (!confirm('Remover este ticker?')) return
    try { await api.delete(`/tickers/${id}`); loadTickers() } catch {}
  }

  /* ---- Coupon Handlers ---- */
  const handleSaveCoupon = async () => {
    if (!couponForm) return
    try {
      const payload = {
        ...couponForm,
        value: parseFloat(couponForm.value) || 0,
        min_order: parseFloat(couponForm.min_order) || 0,
        max_uses: parseInt(couponForm.max_uses) || 0,
      }
      if (couponForm.id) {
        await api.put(`/coupons/${couponForm.id}`, payload)
      } else {
        await api.post('/coupons', payload)
      }
      setCouponForm(null)
      loadCoupons()
    } catch { alert('Erro ao salvar cupom') }
  }
  const handleDeleteCoupon = async (id) => {
    if (!confirm('Remover este cupom?')) return
    try { await api.delete(`/coupons/${id}`); loadCoupons() } catch {}
  }

  /* ---- Admin User Handlers ---- */
  const handleCreateAdmin = async () => {
    if (!adminForm.username || !adminForm.password) return
    try {
      await api.post('/auth/admins', adminForm)
      setAdminForm({ username: '', password: '' })
      loadAdmins()
    } catch (err) { alert(err.response?.data?.error || 'Erro ao criar administrador') }
  }
  const handleToggleAdmin = async (id) => {
    try { await api.put(`/auth/admins/${id}/toggle`); loadAdmins() } catch (err) { alert(err.response?.data?.error || 'Erro') }
  }
  const handleChangePassword = async () => {
    if (changePasswordForm.new_password !== changePasswordForm.confirm) { alert('Senhas não conferem'); return }
    try {
      await api.put('/auth/change-password', { currentPassword: changePasswordForm.current, newPassword: changePasswordForm.new_password })
      setChangePasswordForm({ current: '', new_password: '', confirm: '' })
      alert('Senha alterada com sucesso!')
    } catch (err) { alert(err.response?.data?.error || 'Erro ao alterar senha') }
  }

  /* ---- Appearance Handlers ---- */
  const handleSaveAppearance = async () => {
    setSavingAppearance(true)
    try {
      const keys = Object.keys(appearance)
      for (const key of keys) {
        if (appearance[key] !== undefined) {
          await api.put('/settings', { key, value: appearance[key] || '' })
        }
      }
      alert('Aparência salva!')
    } catch { alert('Erro ao salvar') } finally { setSavingAppearance(false) }
  }

  /* ---- Bulk Product Actions ---- */
  const handleBulkAction = async (action) => {
    if (!selectedProducts.length) return
    if (action === 'delete' && !confirm(`Remover ${selectedProducts.length} produto(s)?`)) return
    try {
      await api.post('/products/bulk', { action, ids: selectedProducts })
      setSelectedProducts([])
      loadProducts()
    } catch { alert('Erro na ação em massa') }
  }

  const handleCloneProduct = async (id) => {
    try {
      await api.post(`/products/${id}/clone`)
      loadProducts()
    } catch { alert('Erro ao clonar produto') }
  }

  /* ---- Inline Edit ---- */
  const handleInlineEdit = (productId, field, value) => {
    setInlineEdit(prev => ({ ...prev, [productId]: { field, value } }))
  }
  const handleInlineSave = async (productId) => {
    const edit = inlineEdit[productId]
    if (!edit) return
    try {
      await api.put(`/products/${productId}/inline`, { field: edit.field, value: edit.value })
      setInlineEdit(prev => { const n = { ...prev }; delete n[productId]; return n })
      loadProducts()
    } catch { alert('Erro ao salvar') }
  }

  /* ---- Order Notes & Tracking ---- */
  const handleAddNote = async (orderId) => {
    const text = orderNote[orderId]
    if (!text?.trim()) return
    try {
      await api.post(`/orders/${orderId}/notes`, { note: text.trim() })
      setOrderNote(prev => ({ ...prev, [orderId]: '' }))
      const { data } = await api.get(`/orders/${orderId}`)
      setOrderDetails(prev => ({ ...prev, [orderId]: data }))
    } catch { alert('Erro ao salvar nota') }
  }

  const handleSaveTracking = async (orderId) => {
    const code = orderTracking[orderId]
    if (!code?.trim()) return
    try {
      await api.put(`/orders/${orderId}/tracking`, { tracking_code: code.trim() })
      loadOrders()
    } catch { alert('Erro ao salvar rastreio') }
  }

  /* ---- CSV Export ---- */
  const handleExportCsv = async () => {
    setExportingCsv(true)
    try {
      const params = {}
      if (orderStatusFilter) params.status = orderStatusFilter
      const { data } = await api.get('/orders/export/csv', { params, responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([data], { type: 'text/csv;charset=utf-8' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `pedidos-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch { alert('Erro ao exportar') } finally { setExportingCsv(false) }
  }

  /* ---- Category Handlers ---- */
  const handleSaveCategory = async () => {
    if (!categoryForm) return
    try {
      if (categoryForm.id) {
        await api.put(`/categories/${categoryForm.id}`, categoryForm)
      } else {
        await api.post('/categories', categoryForm)
      }
      setCategoryForm(null)
      loadCategories()
    } catch { alert('Erro ao salvar categoria') }
  }
  const handleDeleteCategory = async (id) => {
    if (!confirm('Remover esta categoria?')) return
    try { await api.delete(`/categories/${id}`); loadCategories() } catch {}
  }

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  if (!user) return <LoginScreen onLogin={login} />

  const navGroups = [
    {
      label: 'Principal',
      items: [
        { key: 'dashboard', label: 'Dashboard', icon: <FiHome /> },
      ]
    },
    {
      label: 'Catálogo',
      items: [
        { key: 'products', label: 'Produtos', icon: <FiPackage /> },
        { key: 'categories', label: 'Categorias', icon: <FiList /> },
        { key: 'promotions', label: 'Promoções', icon: <FiTag /> },
      ]
    },
    {
      label: 'Vendas',
      items: [
        { key: 'orders', label: 'Pedidos', icon: <FiShoppingBag />, badge: orders.filter(o => o.status === 'pending').length || 0 },
        { key: 'customers', label: 'Clientes', icon: <FiUsers /> },
        { key: 'coupons', label: 'Cupons', icon: <FiPercent /> },
        { key: 'loyalty', label: 'Fidelidade', icon: <FiGift /> },
      ]
    },
    {
      label: 'Marketing',
      items: [
        { key: 'banners', label: 'Banners', icon: <FiImage /> },
        { key: 'tickers', label: 'Ticker', icon: <FiZap /> },
        { key: 'newsletter', label: 'Newsletter', icon: <FiMail /> },
      ]
    },
    {
      label: 'Comunidade',
      items: [
        { key: 'reviews', label: 'Reviews', icon: <FiStar />, badge: pendingCount },
        { key: 'livechat', label: 'Chat ao Vivo', icon: <FiMessageSquare /> },
      ]
    },
    {
      label: 'Relatórios',
      items: [
        { key: 'reports', label: 'Analytics', icon: <FiActivity /> },
      ]
    },
    {
      label: 'Sistema',
      items: [
        { key: 'admins', label: 'Admins', icon: <FiShield /> },
        { key: 'appearance', label: 'Aparência', icon: <FiSliders /> },
        { key: 'settings', label: 'Config', icon: <FiSettings /> },
        { key: 'audit', label: 'Logs', icon: <FiFileText /> },
      ]
    },
  ]

  const allNavItems = navGroups.flatMap(g => g.items)

  const statusLabels = {
    pending: 'Pendente', confirmed: 'Confirmado', shipped: 'Enviado', delivered: 'Entregue', cancelled: 'Cancelado'
  }
  const statusColors = {
    pending: styles.statusPending, confirmed: styles.statusConfirmed, shipped: styles.statusShipped, delivered: styles.statusApproved, cancelled: styles.statusRejected
  }

  const maxBrand = dashboard?.brandStats?.length ? Math.max(...dashboard.brandStats.map(b => b.count), 1) : 1

  const activeLabel = allNavItems.find(i => i.key === activeTab)?.label || ''

  return (
    <div className={styles.adminRoot}>
      {/* Top bar */}
      <header className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <button className={styles.sidebarToggle} onClick={() => setSidebarOpen(o => !o)} title="Toggle menu">
            <FiMenu size={20} />
          </button>
          <h1 className={styles.panelTitle}><span>MJ</span> Admin</h1>
        </div>
        <div className={styles.topBarRight}>
          <span className={styles.topBarSection}>{activeLabel}</span>
          <button className={styles.logoutBtn} onClick={handleLogout}><FiLogOut /> Sair</button>
        </div>
      </header>

      <div className={styles.adminBody}>
        {/* Sidebar */}
        <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : styles.sidebarClosed}`}>
          <nav className={styles.sidebarNav}>
            {navGroups.map(group => (
              <div key={group.label} className={styles.navGroup}>
                {sidebarOpen && <span className={styles.navGroupLabel}>{group.label}</span>}
                {group.items.map(item => (
                  <button
                    key={item.key}
                    className={`${styles.navItem} ${activeTab === item.key ? styles.navItemActive : ''}`}
                    onClick={() => setActiveTab(item.key)}
                    title={!sidebarOpen ? item.label : undefined}
                  >
                    <span className={styles.navIcon}>{item.icon}</span>
                    {sidebarOpen && <span className={styles.navLabel}>{item.label}</span>}
                    {sidebarOpen && item.badge > 0 && <span className={styles.navBadge}>{item.badge}</span>}
                    {!sidebarOpen && item.badge > 0 && <span className={styles.navBadgeDot} />}
                  </button>
                ))}
              </div>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className={styles.mainContent}>

      {/* ===== DASHBOARD TAB ===== */}
      {activeTab === 'dashboard' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {!dashboard && (
            <div className={styles.loadingState}>
              <div className={styles.loadingSpinner} />
              <span>Carregando dashboard...</span>
            </div>
          )}
          {dashboard && <div className={styles.dashGrid}>
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
          </div>}

          {dashboard && <div className={styles.dashRow}>
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
          </div>}

          {dashboard && <div className={styles.dashPanel}>
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
          </div>}
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

          {/* Bulk action bar */}
          {selectedProducts.length > 0 && (
            <div className={styles.bulkBar}>
              <span>{selectedProducts.length} selecionado(s)</span>
              <button className={styles.bulkBtn} onClick={() => handleBulkAction('activate')}>Ativar</button>
              <button className={styles.bulkBtn} onClick={() => handleBulkAction('deactivate')}>Desativar</button>
              <button className={styles.bulkBtn} onClick={() => handleBulkAction('feature')}>Destacar</button>
              <button className={styles.bulkBtn} onClick={() => handleBulkAction('unfeature')}>Remover destaque</button>
              <button className={`${styles.bulkBtn} ${styles.bulkBtnDanger}`} onClick={() => handleBulkAction('delete')}>Excluir</button>
              <button className={styles.bulkBtnClear} onClick={() => setSelectedProducts([])}>Limpar</button>
            </div>
          )}

          <div className={styles.adminGrid}>
            {products.map(p => {
              const isSelected = selectedProducts.includes(p.id)
              const editing = inlineEdit[p.id]
              return (
                <motion.div
                  key={p.id}
                  className={`${styles.adminCard} ${isSelected ? styles.adminCardSelected : ''} ${!p.active ? styles.adminCardInactive : ''}`}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  {/* Checkbox */}
                  <div className={styles.adminCardCheckbox}>
                    <input type="checkbox" checked={isSelected} onChange={e => {
                      setSelectedProducts(prev => e.target.checked ? [...prev, p.id] : prev.filter(id => id !== p.id))
                    }} />
                  </div>
                  <img className={styles.adminCardImg} src={getImageUrl(p.image_url, p.name)} alt={p.name} />
                  <div className={styles.adminCardBody}>
                    <span className={styles.adminCardBrand}>{p.brand_name}</span>
                    <span className={styles.adminCardName}>{p.name}</span>

                    {/* Inline edit price */}
                    {editing?.field === 'price' ? (
                      <div className={styles.inlineEditRow}>
                        <input className={styles.inlineInput} type="number" value={editing.value} onChange={e => handleInlineEdit(p.id, 'price', e.target.value)} autoFocus />
                        <button className={styles.inlineSave} onClick={() => handleInlineSave(p.id)}><FiCheck /></button>
                        <button className={styles.inlineCancel} onClick={() => setInlineEdit(prev => { const n = {...prev}; delete n[p.id]; return n })}><FiX /></button>
                      </div>
                    ) : (
                      <span className={styles.adminCardPrice} title="Clique para editar" onClick={() => handleInlineEdit(p.id, 'price', p.price)} style={{ cursor: 'pointer' }}>
                        {formatPrice(Number(p.price) * (1 - (Math.max(0, Math.min(90, Number(p.discount_percentage || 0))) / 100)))}
                      </span>
                    )}

                    {/* Inline edit stock */}
                    {editing?.field === 'stock' ? (
                      <div className={styles.inlineEditRow}>
                        <input className={styles.inlineInput} type="number" value={editing.value} onChange={e => handleInlineEdit(p.id, 'stock', e.target.value)} autoFocus />
                        <button className={styles.inlineSave} onClick={() => handleInlineSave(p.id)}><FiCheck /></button>
                        <button className={styles.inlineCancel} onClick={() => setInlineEdit(prev => { const n = {...prev}; delete n[p.id]; return n })}><FiX /></button>
                      </div>
                    ) : (
                      <div className={styles.adminCardMeta}>
                        <span title="Clique para editar estoque" onClick={() => handleInlineEdit(p.id, 'stock', p.stock)} style={{ cursor: 'pointer' }}>Estoque: <strong>{p.stock}</strong></span>
                        <span>Tam: {p.sizes}</span>
                        {!p.active && <span style={{ color: '#f44336' }}>Inativo</span>}
                      </div>
                    )}

                    <div className={styles.adminCardActions}>
                      <button className={styles.editBtn} onClick={() => { setEditingProduct(p); setShowProductForm(true) }}><FiEdit2 /> Editar</button>
                      <button className={styles.cloneBtn} onClick={() => handleCloneProduct(p.id)} title="Clonar produto"><FiPlus /></button>
                      <button className={styles.deleteBtn} onClick={() => handleDeleteProduct(p.id)}><FiTrash2 /></button>
                    </div>
                  </div>
                </motion.div>
              )
            })}
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

      {/* ===== PROMOTIONS TAB ===== */}
      {activeTab === 'promotions' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>Promoções e Descontos</span>
          </div>

          <div className={styles.promoLayout}>
            <section className={styles.promoCard}>
              <div className={styles.promoCardHeader}>
                <div>
                  <h4 className={styles.settingsGroupTitle}>Campanha Home</h4>
                  <p className={styles.promoDescription}>Configure a faixa promocional da página principal com CTA e link.</p>
                </div>
                <label className={styles.toggleRow}>
                  <input
                    type="checkbox"
                    checked={settings.home_promo_enabled === 'true'}
                    onChange={e => setSettings(p => ({ ...p, home_promo_enabled: e.target.checked ? 'true' : 'false' }))}
                  />
                  <span className={styles.toggleSwitch} />
                  <span className={styles.toggleLabel}>Ativar campanha</span>
                </label>
              </div>

              <div className={styles.promoFieldsGrid}>
                <div className={styles.inputGroup}>
                  <label className={styles.label}>Tag da Campanha</label>
                  <input className={styles.input} value={settings.home_promo_tag || ''} onChange={e => setSettings(p => ({ ...p, home_promo_tag: e.target.value }))} placeholder="Oferta Especial" />
                </div>
                <div className={styles.inputGroup}>
                  <label className={styles.label}>Texto Principal</label>
                  <input className={styles.input} value={settings.home_promo_text || ''} onChange={e => setSettings(p => ({ ...p, home_promo_text: e.target.value }))} placeholder="Ex: Semana do Sneaker com até 30% OFF" />
                </div>
                <div className={styles.inputGroup}>
                  <label className={styles.label}>Texto do Botão</label>
                  <input className={styles.input} value={settings.home_promo_button_text || ''} onChange={e => setSettings(p => ({ ...p, home_promo_button_text: e.target.value }))} placeholder="Conferir ofertas" />
                </div>
                <div className={styles.inputGroup}>
                  <label className={styles.label}>Link do Botão</label>
                  <input className={styles.input} value={settings.home_promo_button_link || ''} onChange={e => setSettings(p => ({ ...p, home_promo_button_link: e.target.value }))} placeholder="#catalogo ou https://..." />
                </div>
              </div>

              <div className={styles.promoActions}>
                <button className={styles.saveBtn} onClick={handleSavePromotions} disabled={savingPromotions}>
                  <FiSave /> {savingPromotions ? 'Salvando...' : 'Salvar Campanha'}
                </button>
              </div>
            </section>

            <section className={styles.promoCard}>
              <div className={styles.promoCardHeader}>
                <div>
                  <h4 className={styles.settingsGroupTitle}>Desconto Rápido por Produto</h4>
                  <p className={styles.promoDescription}>Ajuste percentual e salve individualmente, sem abrir o modal do produto.</p>
                </div>
              </div>

              <div className={styles.quickDiscountList}>
                {products.map(p => (
                  <div key={p.id} className={styles.quickDiscountRow}>
                    <div className={styles.quickDiscountInfo}>
                      <span className={styles.quickDiscountName}>{p.name}</span>
                      <span className={styles.quickDiscountMeta}>{p.brand_name} • {formatPrice(p.price)}</span>
                    </div>

                    <div className={styles.quickDiscountControls}>
                      <div className={styles.discountInputWrap}>
                        <input
                          className={`${styles.input} ${styles.discountInput}`}
                          type="number"
                          min="0"
                          max="90"
                          step="0.1"
                          value={p.discount_percentage ?? 0}
                          onChange={e => handleQuickDiscountChange(p.id, e.target.value)}
                        />
                        <span className={styles.discountSuffix}>%</span>
                      </div>

                      <button
                        className={styles.quickSaveBtn}
                        onClick={() => handleSaveQuickDiscount(p.id)}
                        disabled={savingDiscountId === p.id}
                      >
                        <FiSave /> {savingDiscountId === p.id ? 'Salvando...' : 'Salvar'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </motion.div>
      )}

      {/* ===== ORDERS TAB ===== */}
      {activeTab === 'orders' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>Pedidos ({orders.length})</span>
            <button className={styles.exportBtn} onClick={handleExportCsv} disabled={exportingCsv}>
              {exportingCsv ? 'Exportando...' : '⬇ CSV'}
            </button>
          </div>

          {/* Search + filter */}
          <div className={styles.orderFilterRow}>
            <input
              className={styles.orderSearchInput}
              placeholder="Buscar por nome ou email..."
              value={orderSearch}
              onChange={e => { setOrderSearch(e.target.value); setOrderPage(1) }}
            />
            <select className={styles.orderStatusSel} value={orderStatusFilter} onChange={e => { setOrderStatusFilter(e.target.value); setOrderPage(1) }}>
              <option value="">Todos os status</option>
              {Object.entries(statusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
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

                        {/* Tracking code */}
                        <div className={styles.trackingRow}>
                          <span className={styles.label}>Código de rastreio:</span>
                          <input
                            className={styles.trackingInput}
                            placeholder={o.tracking_code || 'Ex: BR123456789BR'}
                            value={orderTracking[o.id] ?? o.tracking_code ?? ''}
                            onChange={e => setOrderTracking(prev => ({ ...prev, [o.id]: e.target.value }))}
                          />
                          <button className={styles.trackingBtn} onClick={() => handleSaveTracking(o.id)}><FiSave /></button>
                        </div>

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

                        {/* Notes */}
                        <div className={styles.notesSection}>
                          <span className={styles.label}>Notas internas:</span>
                          {orderDetails[o.id]?.notes?.map((n, i) => (
                            <div key={i} className={styles.noteItem}>
                              <span className={styles.noteText}>{n.note}</span>
                              <span className={styles.noteDate}>{new Date(n.created_at).toLocaleString('pt-BR')}</span>
                            </div>
                          ))}
                          <div className={styles.noteAdd}>
                            <input
                              className={styles.noteInput}
                              placeholder="Adicionar nota..."
                              value={orderNote[o.id] || ''}
                              onChange={e => setOrderNote(prev => ({ ...prev, [o.id]: e.target.value }))}
                              onKeyDown={e => e.key === 'Enter' && handleAddNote(o.id)}
                            />
                            <button className={styles.noteSaveBtn} onClick={() => handleAddNote(o.id)}><FiCheck /></button>
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

          {/* Pagination */}
          {orderTotal > 1 && (
            <div className={styles.pagination}>
              <button className={styles.pageBtn} disabled={orderPage <= 1} onClick={() => setOrderPage(p => p - 1)}>Anterior</button>
              <span className={styles.pageInfo}>{orderPage} / {orderTotal}</span>
              <button className={styles.pageBtn} disabled={orderPage >= orderTotal} onClick={() => setOrderPage(p => p + 1)}>Próxima</button>
            </div>
          )}
        </motion.div>
      )}

      {/* ===== CUSTOMERS TAB ===== */}
      {activeTab === 'customers' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>CRM — Clientes ({customerTotal > 1 ? `pág. ${customerPage}/${customerTotal}` : customers.length})</span>
          </div>
          <div className={styles.orderFilterRow}>
            <input
              className={styles.orderSearchInput}
              placeholder="Buscar por nome ou email..."
              value={customerSearch}
              onChange={e => { setCustomerSearch(e.target.value); setCustomerPage(1) }}
            />
          </div>
          {customers.length > 0 ? (
            <div className={styles.tableWrap}>
              <table className={styles.reviewsTable}>
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Email</th>
                    <th>Pedidos</th>
                    <th>Total gasto</th>
                    <th>Último pedido</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c, i) => (
                    <tr key={i}>
                      <td>{c.customer_name || '—'}</td>
                      <td>{c.customer_email}</td>
                      <td>{c.order_count}</td>
                      <td>{formatPrice(c.total_spent || 0)}</td>
                      <td>{c.last_order ? new Date(c.last_order).toLocaleDateString('pt-BR') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={styles.noData}>Nenhum cliente encontrado</p>
          )}
          {customerTotal > 1 && (
            <div className={styles.pagination}>
              <button className={styles.pageBtn} disabled={customerPage <= 1} onClick={() => setCustomerPage(p => p - 1)}>Anterior</button>
              <span className={styles.pageInfo}>{customerPage} / {customerTotal}</span>
              <button className={styles.pageBtn} disabled={customerPage >= customerTotal} onClick={() => setCustomerPage(p => p + 1)}>Próxima</button>
            </div>
          )}
        </motion.div>
      )}

      {/* ===== CATEGORIES TAB ===== */}
      {activeTab === 'categories' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>Categorias ({categories.length})</span>
            <button className={styles.addBtn} onClick={() => setCategoryForm({ name: '', description: '' })}>
              <FiPlus /> Nova Categoria
            </button>
          </div>

          {categoryForm && (
            <div className={styles.inlineFormBox}>
              <input
                className={styles.inlineFormInput}
                placeholder="Nome da categoria"
                value={categoryForm.name}
                onChange={e => setCategoryForm(prev => ({ ...prev, name: e.target.value }))}
              />
              <input
                className={styles.inlineFormInput}
                placeholder="Descrição (opcional)"
                value={categoryForm.description || ''}
                onChange={e => setCategoryForm(prev => ({ ...prev, description: e.target.value }))}
              />
              <button className={styles.addBtn} onClick={handleSaveCategory}><FiSave /> Salvar</button>
              <button className={styles.deleteBtn} onClick={() => setCategoryForm(null)}><FiX /></button>
            </div>
          )}

          {categories.length > 0 ? (
            <div className={styles.tableWrap}>
              <table className={styles.reviewsTable}>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Slug</th>
                    <th>Descrição</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map(c => (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td style={{ fontFamily: 'monospace', color: '#888' }}>{c.slug}</td>
                      <td>{c.description || '—'}</td>
                      <td>
                        <button className={`${styles.actionBtn} ${styles.approveBtn}`} onClick={() => setCategoryForm(c)}><FiEdit2 /></button>
                        <button className={`${styles.actionBtn} ${styles.rejectBtn}`} onClick={() => handleDeleteCategory(c.id)}><FiTrash2 /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={styles.noData}>Nenhuma categoria cadastrada</p>
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
              <h4 className={styles.settingsGroupTitle}>Campanha Home</h4>
              <label className={styles.toggleRow} style={{ marginBottom: 14 }}>
                <input
                  type="checkbox"
                  checked={settings.home_promo_enabled === 'true'}
                  onChange={e => setSettings(p => ({ ...p, home_promo_enabled: e.target.checked ? 'true' : 'false' }))}
                />
                <span className={styles.toggleSwitch} />
                <span className={styles.toggleLabel}>Exibir faixa de campanha na página principal</span>
              </label>

              <div className={styles.formRow}>
                <div className={styles.inputGroup}>
                  <label className={styles.label}>Tag da Campanha</label>
                  <input className={styles.input} value={settings.home_promo_tag || ''} onChange={e => setSettings(p => ({ ...p, home_promo_tag: e.target.value }))} placeholder="Oferta Especial" />
                </div>
                <div className={styles.inputGroup}>
                  <label className={styles.label}>Texto Principal</label>
                  <input className={styles.input} value={settings.home_promo_text || ''} onChange={e => setSettings(p => ({ ...p, home_promo_text: e.target.value }))} placeholder="Ex: Semana do Sneaker com até 30% OFF" />
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.inputGroup}>
                  <label className={styles.label}>Texto do Botão</label>
                  <input className={styles.input} value={settings.home_promo_button_text || ''} onChange={e => setSettings(p => ({ ...p, home_promo_button_text: e.target.value }))} placeholder="Conferir ofertas" />
                </div>
                <div className={styles.inputGroup}>
                  <label className={styles.label}>Link do Botão</label>
                  <input className={styles.input} value={settings.home_promo_button_link || ''} onChange={e => setSettings(p => ({ ...p, home_promo_button_link: e.target.value }))} placeholder="#catalogo ou https://..." />
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

      {/* ===== TICKERS TAB ===== */}
      {activeTab === 'tickers' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>Ticker Marquee ({tickers.length})</span>
            <button className={styles.addBtn} onClick={() => setTickerForm({ text: '', active: true, sort_order: 0 })}>
              <FiPlus /> Novo Ticker
            </button>
          </div>

          {tickerForm && (
            <div className={styles.settingsGroup} style={{ marginBottom: '1.5rem' }}>
              <h4 className={styles.settingsGroupTitle}>{tickerForm.id ? 'Editar Ticker' : 'Novo Ticker'}</h4>
              <div className={styles.formRow}>
                <div className={styles.inputGroup}>
                  <label className={styles.label}>Texto</label>
                  <input className={styles.input} value={tickerForm.text} onChange={e => setTickerForm(p => ({ ...p, text: e.target.value }))} placeholder="🔥 Frete grátis acima de R$300!" />
                </div>
                <div className={styles.inputGroup}>
                  <label className={styles.label}>Ordem</label>
                  <input className={styles.input} type="number" value={tickerForm.sort_order} onChange={e => setTickerForm(p => ({ ...p, sort_order: parseInt(e.target.value) || 0 }))} />
                </div>
              </div>
              <label className={styles.toggleRow}>
                <input type="checkbox" checked={tickerForm.active} onChange={e => setTickerForm(p => ({ ...p, active: e.target.checked }))} />
                <span className={styles.toggleSwitch} />
                <span className={styles.toggleLabel}>Ativo</span>
              </label>
              <div className={styles.formActions}>
                <button className={styles.cancelBtn} onClick={() => setTickerForm(null)}>Cancelar</button>
                <button className={styles.saveBtn} onClick={handleSaveTicker}>Salvar</button>
              </div>
            </div>
          )}

          <div className={styles.ordersList}>
            {tickers.map(t => (
              <div key={t.id} className={styles.orderCard}>
                <div className={styles.orderHeader}>
                  <div className={styles.orderMainInfo}>
                    <span className={styles.orderId}>#{t.id}</span>
                    <span className={styles.orderCustomer}>{t.text}</span>
                  </div>
                  <div className={styles.orderRightInfo}>
                    <span className={`${styles.statusBadge} ${t.active ? styles.statusApproved : styles.statusRejected}`}>
                      {t.active ? 'Ativo' : 'Inativo'}
                    </span>
                    <button className={styles.editBtn} onClick={() => setTickerForm(t)}><FiEdit2 /></button>
                    <button className={styles.deleteBtn} onClick={() => handleDeleteTicker(t.id)}><FiTrash2 /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {tickers.length === 0 && !tickerForm && <p className={styles.noData}>Nenhum ticker cadastrado</p>}
        </motion.div>
      )}

      {/* ===== COUPONS TAB ===== */}
      {activeTab === 'coupons' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>Cupons de Desconto ({coupons.length})</span>
            <button className={styles.addBtn} onClick={() => setCouponForm({ code: '', type: 'percentage', value: 10, min_order: 0, max_uses: 0, expires_at: '', active: true })}>
              <FiPlus /> Novo Cupom
            </button>
          </div>

          {couponForm && (
            <div className={styles.settingsGroup} style={{ marginBottom: '1.5rem' }}>
              <h4 className={styles.settingsGroupTitle}>{couponForm.id ? 'Editar Cupom' : 'Novo Cupom'}</h4>
              <div className={styles.formRow}>
                <div className={styles.inputGroup}>
                  <label className={styles.label}>Código</label>
                  <input className={styles.input} value={couponForm.code} onChange={e => setCouponForm(p => ({ ...p, code: e.target.value.toUpperCase() }))} placeholder="DESCONTO10" maxLength={30} />
                </div>
                <div className={styles.inputGroup}>
                  <label className={styles.label}>Tipo</label>
                  <select className={styles.select} value={couponForm.type} onChange={e => setCouponForm(p => ({ ...p, type: e.target.value }))}>
                    <option value="percentage">Porcentagem (%)</option>
                    <option value="fixed">Valor fixo (R$)</option>
                  </select>
                </div>
                <div className={styles.inputGroup}>
                  <label className={styles.label}>Valor</label>
                  <input className={styles.input} type="number" step="0.01" value={couponForm.value} onChange={e => setCouponForm(p => ({ ...p, value: e.target.value }))} />
                </div>
              </div>
              <div className={styles.formRow}>
                <div className={styles.inputGroup}>
                  <label className={styles.label}>Pedido mínimo (R$)</label>
                  <input className={styles.input} type="number" step="0.01" value={couponForm.min_order} onChange={e => setCouponForm(p => ({ ...p, min_order: e.target.value }))} />
                </div>
                <div className={styles.inputGroup}>
                  <label className={styles.label}>Máx usos (0 = ilimitado)</label>
                  <input className={styles.input} type="number" value={couponForm.max_uses} onChange={e => setCouponForm(p => ({ ...p, max_uses: e.target.value }))} />
                </div>
                <div className={styles.inputGroup}>
                  <label className={styles.label}>Expira em</label>
                  <input className={styles.input} type="datetime-local" value={couponForm.expires_at ? couponForm.expires_at.slice(0, 16) : ''} onChange={e => setCouponForm(p => ({ ...p, expires_at: e.target.value }))} />
                </div>
              </div>
              <label className={styles.toggleRow}>
                <input type="checkbox" checked={couponForm.active} onChange={e => setCouponForm(p => ({ ...p, active: e.target.checked }))} />
                <span className={styles.toggleSwitch} />
                <span className={styles.toggleLabel}>Ativo</span>
              </label>
              <div className={styles.formActions}>
                <button className={styles.cancelBtn} onClick={() => setCouponForm(null)}>Cancelar</button>
                <button className={styles.saveBtn} onClick={handleSaveCoupon}>Salvar</button>
              </div>
            </div>
          )}

          <div className={styles.tableWrap}>
            <table className={styles.reviewsTable}>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Tipo</th>
                  <th>Valor</th>
                  <th>Mín.</th>
                  <th>Usos</th>
                  <th>Expira</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {coupons.map(c => (
                  <tr key={c.id}>
                    <td><strong>{c.code}</strong></td>
                    <td>{c.type === 'percentage' ? '%' : 'R$'}</td>
                    <td>{c.type === 'percentage' ? `${c.value}%` : formatPrice(c.value)}</td>
                    <td>{formatPrice(c.min_order || 0)}</td>
                    <td>{c.used_count}/{c.max_uses || '∞'}</td>
                    <td>{c.expires_at ? new Date(c.expires_at).toLocaleDateString('pt-BR') : 'Sem limite'}</td>
                    <td>
                      <span className={`${styles.statusBadge} ${c.active ? styles.statusApproved : styles.statusRejected}`}>
                        {c.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td>
                      <button className={styles.editBtn} onClick={() => setCouponForm(c)}><FiEdit2 /></button>
                      <button className={`${styles.actionBtn} ${styles.rejectBtn}`} onClick={() => handleDeleteCoupon(c.id)}><FiTrash2 /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {coupons.length === 0 && !couponForm && <p className={styles.noData}>Nenhum cupom cadastrado</p>}
        </motion.div>
      )}

      {/* ===== ADMINS TAB ===== */}
      {activeTab === 'admins' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>Gestão de Admins</span>
          </div>

          <div className={styles.settingsGroup}>
            <h4 className={styles.settingsGroupTitle}>Criar Novo Admin</h4>
            <div className={styles.formRow}>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Usuário</label>
                <input className={styles.input} value={adminForm.username} onChange={e => setAdminForm(p => ({ ...p, username: e.target.value }))} placeholder="Novo usuário" />
              </div>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Senha (min 6 caracteres)</label>
                <input className={styles.input} type="password" value={adminForm.password} onChange={e => setAdminForm(p => ({ ...p, password: e.target.value }))} placeholder="Senha" />
              </div>
              <div className={styles.inputGroup} style={{ justifyContent: 'flex-end' }}>
                <button className={styles.saveBtn} onClick={handleCreateAdmin}><FiPlus /> Criar</button>
              </div>
            </div>
          </div>

          <div className={styles.settingsGroup}>
            <h4 className={styles.settingsGroupTitle}>Admins Ativos</h4>
            <div className={styles.ordersList}>
              {admins.map(a => (
                <div key={a.id} className={styles.orderCard}>
                  <div className={styles.orderHeader}>
                    <div className={styles.orderMainInfo}>
                      <span className={styles.orderId}><FiShield /></span>
                      <span className={styles.orderCustomer}>{a.username}</span>
                      {a.last_login && <span className={styles.orderDate}>Último login: {new Date(a.last_login).toLocaleString('pt-BR')}</span>}
                    </div>
                    <div className={styles.orderRightInfo}>
                      <span className={`${styles.statusBadge} ${a.active ? styles.statusApproved : styles.statusRejected}`}>
                        {a.active ? 'Ativo' : 'Desativado'}
                      </span>
                      <button className={a.active ? styles.deleteBtn : styles.editBtn} onClick={() => handleToggleAdmin(a.id)}>
                        {a.active ? 'Desativar' : 'Ativar'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.settingsGroup}>
            <h4 className={styles.settingsGroupTitle}>Alterar Minha Senha</h4>
            <div className={styles.formRow}>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Senha Atual</label>
                <input className={styles.input} type="password" value={changePasswordForm.current} onChange={e => setChangePasswordForm(p => ({ ...p, current: e.target.value }))} />
              </div>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Nova Senha</label>
                <input className={styles.input} type="password" value={changePasswordForm.new_password} onChange={e => setChangePasswordForm(p => ({ ...p, new_password: e.target.value }))} />
              </div>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Confirmar Nova Senha</label>
                <input className={styles.input} type="password" value={changePasswordForm.confirm} onChange={e => setChangePasswordForm(p => ({ ...p, confirm: e.target.value }))} />
              </div>
            </div>
            <button className={styles.saveBtn} onClick={handleChangePassword} style={{ maxWidth: 200 }}>
              <FiSave /> Alterar Senha
            </button>
          </div>
        </motion.div>
      )}

      {/* ===== APPEARANCE TAB ===== */}
      {activeTab === 'appearance' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>Aparência e Textos</span>
          </div>

          <div className={styles.settingsForm}>
            <div className={styles.settingsGroup}>
              <h4 className={styles.settingsGroupTitle}>Cores do Site</h4>
              <div className={styles.formRow}>
                <div className={styles.inputGroup}>
                  <label className={styles.label}>Cor Primária</label>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input type="color" value={appearance.primary_color || '#e31837'} onChange={e => setAppearance(p => ({ ...p, primary_color: e.target.value }))} style={{ width: 40, height: 36, border: 'none', cursor: 'pointer' }} />
                    <input className={styles.input} value={appearance.primary_color || ''} onChange={e => setAppearance(p => ({ ...p, primary_color: e.target.value }))} placeholder="#e31837" />
                  </div>
                </div>
                <div className={styles.inputGroup}>
                  <label className={styles.label}>Cor de Fundo</label>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input type="color" value={appearance.bg_color || '#111111'} onChange={e => setAppearance(p => ({ ...p, bg_color: e.target.value }))} style={{ width: 40, height: 36, border: 'none', cursor: 'pointer' }} />
                    <input className={styles.input} value={appearance.bg_color || ''} onChange={e => setAppearance(p => ({ ...p, bg_color: e.target.value }))} placeholder="#111111" />
                  </div>
                </div>
              </div>
              <div className={styles.formRow}>
                <div className={styles.inputGroup}>
                  <label className={styles.label}>Cor dos Cards</label>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input type="color" value={appearance.card_color || '#1a1a1a'} onChange={e => setAppearance(p => ({ ...p, card_color: e.target.value }))} style={{ width: 40, height: 36, border: 'none', cursor: 'pointer' }} />
                    <input className={styles.input} value={appearance.card_color || ''} onChange={e => setAppearance(p => ({ ...p, card_color: e.target.value }))} placeholder="#1a1a1a" />
                  </div>
                </div>
                <div className={styles.inputGroup}>
                  <label className={styles.label}>Cor do Texto</label>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input type="color" value={appearance.text_color || '#ffffff'} onChange={e => setAppearance(p => ({ ...p, text_color: e.target.value }))} style={{ width: 40, height: 36, border: 'none', cursor: 'pointer' }} />
                    <input className={styles.input} value={appearance.text_color || ''} onChange={e => setAppearance(p => ({ ...p, text_color: e.target.value }))} placeholder="#ffffff" />
                  </div>
                </div>
              </div>
              {/* Preview */}
              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem' }}>
                <div style={{ flex: 1, background: appearance.bg_color || '#111', borderRadius: 12, padding: '1.5rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <p style={{ color: appearance.text_color || '#fff', fontSize: '0.85rem', marginBottom: '0.5rem' }}>Preview do texto</p>
                  <div style={{ background: appearance.card_color || '#1a1a1a', borderRadius: 10, padding: '1rem' }}>
                    <p style={{ color: appearance.primary_color || '#e31837', fontWeight: 700 }}>Cor Primária</p>
                    <p style={{ color: appearance.text_color || '#fff', fontSize: '0.8rem' }}>Texto normal num card</p>
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.settingsGroup}>
              <h4 className={styles.settingsGroupTitle}>Textos do Footer</h4>
              <div className={styles.formRow}>
                <div className={styles.inputGroup}>
                  <label className={styles.label}>Email</label>
                  <input className={styles.input} value={appearance.footer_email || ''} onChange={e => setAppearance(p => ({ ...p, footer_email: e.target.value }))} placeholder="contato@mjsneakers.com.br" />
                </div>
                <div className={styles.inputGroup}>
                  <label className={styles.label}>Telefone</label>
                  <input className={styles.input} value={appearance.footer_phone || ''} onChange={e => setAppearance(p => ({ ...p, footer_phone: e.target.value }))} placeholder="(11) 99999-9999" />
                </div>
              </div>
              <div className={styles.formRow}>
                <div className={styles.inputGroup}>
                  <label className={styles.label}>Instagram</label>
                  <input className={styles.input} value={appearance.footer_instagram || ''} onChange={e => setAppearance(p => ({ ...p, footer_instagram: e.target.value }))} placeholder="@mjsneakers" />
                </div>
                <div className={styles.inputGroup}>
                  <label className={styles.label}>Crédito</label>
                  <input className={styles.input} value={appearance.footer_credit || ''} onChange={e => setAppearance(p => ({ ...p, footer_credit: e.target.value }))} placeholder="Feito por..." />
                </div>
              </div>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Endereço</label>
                <input className={styles.input} value={appearance.footer_address || ''} onChange={e => setAppearance(p => ({ ...p, footer_address: e.target.value }))} placeholder="Rua..." />
              </div>
            </div>

            <button className={styles.saveBtn} onClick={handleSaveAppearance} disabled={savingAppearance} style={{ maxWidth: 250 }}>
              <FiSave /> {savingAppearance ? 'Salvando...' : 'Salvar Aparência'}
            </button>
          </div>
        </motion.div>
      )}

      {/* ===== AUDIT TAB ===== */}
      {activeTab === 'audit' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>Logs de Auditoria</span>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.reviewsTable}>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Usuário</th>
                  <th>Ação</th>
                  <th>Entidade</th>
                  <th>ID</th>
                  <th>Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map(log => (
                  <tr key={log.id}>
                    <td>{new Date(log.created_at).toLocaleString('pt-BR')}</td>
                    <td>{log.admin_username || `ID:${log.admin_id}`}</td>
                    <td><span className={styles.statusBadge}>{log.action}</span></td>
                    <td>{log.entity}</td>
                    <td>{log.entity_id || '-'}</td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.details || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {auditTotal > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', padding: '1rem' }}>
              <button className={styles.cancelBtn} disabled={auditPage <= 1} onClick={() => setAuditPage(p => p - 1)}>Anterior</button>
              <span style={{ color: '#999', fontSize: '0.85rem', display: 'flex', alignItems: 'center' }}>{auditPage} / {auditTotal}</span>
              <button className={styles.cancelBtn} disabled={auditPage >= auditTotal} onClick={() => setAuditPage(p => p + 1)}>Próxima</button>
            </div>
          )}

          {auditLogs.length === 0 && <p className={styles.noData}>Nenhum log encontrado</p>}
        </motion.div>
      )}

      {/* ===== NEWSLETTER TAB ===== */}
      {activeTab === 'newsletter' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>Newsletter</span>
          </div>
          <div className={styles.tableWrap}>
            <p className={styles.noData} style={{padding:'2rem'}}>Gerencie assinantes da newsletter via configurações de email.</p>
          </div>
        </motion.div>
      )}

      {/* ===== LOYALTY TAB ===== */}
      {activeTab === 'loyalty' && (
        <LoyaltyPanel />
      )}

      {/* ===== LIVE CHAT TAB ===== */}
      {activeTab === 'livechat' && (
        <LiveChatPanel />
      )}

      {/* ===== REPORTS TAB ===== */}
      {activeTab === 'reports' && (
        <ReportsPanel />
      )}

        </main>
      </div>
    </div>
  )
}
