import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FiPlus, FiEdit2, FiTrash2, FiSave, FiInfo, FiDollarSign, FiGift,
  FiPackage, FiMenu,
} from 'react-icons/fi'
import { FaWhatsapp } from 'react-icons/fa'
import api from '../../../services/api'
import { useToast } from '../../../components/Toast/Toast'
import styles from './ShippingManager.module.css'

const BR_STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]
const SUB_TABS = [
  { key: 'zones', label: 'Zonas de Entrega' },
  { key: 'rules', label: 'Regras de Frete' },
  { key: 'whatsapp', label: 'Notificações WhatsApp' },
]
const TYPE_META = {
  fixed: { label: 'Fixo', cls: 'fixed' },
  free: { label: 'Grátis', cls: 'free' },
  by_weight: { label: 'Por Peso', cls: 'by_weight' },
}
const fmtPrice = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0)
const fmtDate = (d) => { const x = new Date(d); return isNaN(x) ? '—' : x.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) }
const splitStates = (s) => (Array.isArray(s) ? s : String(s || '').split(',').map(x => x.trim()).filter(Boolean))

export default function ShippingManager() {
  const [sub, setSub] = useState('zones')
  const [zones, setZones] = useState([])

  const loadZones = useCallback(async () => {
    try {
      const { data } = await api.get('/shipping/zones')
      setZones(Array.isArray(data) ? data : [])
    } catch { setZones([]) }
  }, [])
  useEffect(() => { loadZones() }, [loadZones])

  return (
    <motion.div className={styles.container} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className={styles.subTabs}>
        {SUB_TABS.map(t => (
          <button key={t.key} className={`${styles.subTab} ${sub === t.key ? styles.active : ''}`} onClick={() => setSub(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {sub === 'zones' && <ZonesTab zones={zones} reload={loadZones} />}
      {sub === 'rules' && <RulesTab zones={zones} />}
      {sub === 'whatsapp' && <WhatsAppTab />}
    </motion.div>
  )
}

/* ============================================================
   ZONAS
   ============================================================ */
function ZonesTab({ zones, reload }) {
  const addToast = useToast()
  const [modal, setModal] = useState(null) // {zone} | {zone:null}

  const remove = async (zone) => {
    if (!window.confirm('Tem certeza? As regras desta zona precisam ser removidas primeiro.')) return
    try {
      await api.delete(`/shipping/zones/${zone.id}`)
      addToast('Zona removida.', 'success')
      reload()
    } catch (err) {
      addToast(err?.response?.data?.error || 'Não foi possível remover a zona.', 'error')
    }
  }

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.spacer} />
        <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setModal({ zone: null })}>
          <FiPlus /> Nova Zona
        </button>
      </div>

      {zones.length === 0 ? (
        <div className={styles.empty}><FiPackage className={styles.ic} /><p>Nenhuma zona cadastrada.</p></div>
      ) : (
        <div className={styles.zonesGrid}>
          {zones.map(z => (
            <div key={z.id} className={styles.zoneCard}>
              <h4>{z.name}</h4>
              <div className={styles.statesChips}>
                {splitStates(z.states).map(uf => <span key={uf} className={styles.stateChip}>{uf}</span>)}
              </div>
              <div className={styles.zoneActions}>
                <button className={`${styles.btn} ${styles.btnSm}`} onClick={() => setModal({ zone: z })}><FiEdit2 /> Editar</button>
                <button className={`${styles.btn} ${styles.btnSm} ${styles.btnDanger}`} onClick={() => remove(z)}><FiTrash2 /> Excluir</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {modal && <ZoneModal zone={modal.zone} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload() }} />}
      </AnimatePresence>
    </>
  )
}

function ZoneModal({ zone, onClose, onSaved }) {
  const addToast = useToast()
  const [name, setName] = useState(zone?.name || '')
  const [selected, setSelected] = useState(() => new Set(splitStates(zone?.states)))
  const [saving, setSaving] = useState(false)

  const toggle = (uf) => setSelected(prev => {
    const next = new Set(prev)
    next.has(uf) ? next.delete(uf) : next.add(uf)
    return next
  })

  const save = async () => {
    if (!name.trim()) { addToast('Informe o nome da zona.', 'error'); return }
    if (selected.size === 0) { addToast('Selecione ao menos uma UF.', 'error'); return }
    setSaving(true)
    const payload = { name: name.trim(), states: [...selected] }
    try {
      if (zone?.id) await api.put(`/shipping/zones/${zone.id}`, { ...payload, active: zone.active ?? true })
      else await api.post('/shipping/zones', payload)
      addToast('Zona salva!', 'success')
      onSaved()
    } catch (err) {
      addToast(err?.response?.data?.error || 'Não foi possível salvar a zona.', 'error')
    } finally { setSaving(false) }
  }

  return (
    <motion.div className={styles.modalOverlay} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className={styles.modal} initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }} onClick={e => e.stopPropagation()}>
        <div className={styles.modalTitle}>{zone ? 'Editar' : 'Nova'} Zona de Entrega</div>
        <div className={styles.field}>
          <label>Nome da zona</label>
          <input className={styles.input} value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Sudeste" />
        </div>
        <div className={styles.field}>
          <label>Estados cobertos</label>
          <div className={styles.selectAllBtns}>
            <button type="button" onClick={() => setSelected(new Set(BR_STATES))}>Selecionar todos</button>
            <button type="button" onClick={() => setSelected(new Set())}>Limpar</button>
          </div>
          <div className={styles.statesCheckGrid}>
            {BR_STATES.map(uf => (
              <label key={uf}>
                <input type="checkbox" checked={selected.has(uf)} onChange={() => toggle(uf)} /> {uf}
              </label>
            ))}
          </div>
        </div>
        <div className={styles.modalActions}>
          <button className={styles.btn} onClick={onClose}>Cancelar</button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={save} disabled={saving}>
            <FiSave /> {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

/* ============================================================
   REGRAS
   ============================================================ */
function RulesTab({ zones }) {
  const addToast = useToast()
  const [zoneFilter, setZoneFilter] = useState('')
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const dragIdx = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/shipping/rules', { params: zoneFilter ? { zone_id: zoneFilter } : {} })
      setRules(Array.isArray(data) ? data : [])
    } catch { setRules([]) } finally { setLoading(false) }
  }, [zoneFilter])
  useEffect(() => { load() }, [load])

  const remove = async (rule) => {
    if (!window.confirm(`Excluir a regra "${rule.name}"?`)) return
    try {
      await api.delete(`/shipping/rules/${rule.id}`)
      addToast('Regra removida.', 'success')
      load()
    } catch { addToast('Não foi possível remover a regra.', 'error') }
  }

  const rulePayload = (r) => ({
    zone_id: r.zone_id ?? null,
    name: r.name,
    type: r.type,
    price: (r.type === 'fixed' || r.type === 'by_weight') ? Number(r.price) || 0 : 0,
    free_above: r.type === 'free' ? Number(r.free_above) || 0 : null,
    estimated_days_min: Number(r.estimated_days_min ?? 3),
    estimated_days_max: Number(r.estimated_days_max ?? 10),
    max_weight_g: r.type === 'by_weight' && r.max_weight_g ? Number(r.max_weight_g) : null,
    sort_order: Number(r.sort_order) || 0,
    active: r.active === undefined ? true : !!r.active,
  })

  const onDrop = async (targetIdx) => {
    const from = dragIdx.current
    dragIdx.current = null
    if (from === null || from === targetIdx) return
    const reordered = [...rules]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(targetIdx, 0, moved)
    // recalcula sort_order e persiste apenas o que mudou
    const changed = []
    reordered.forEach((r, i) => { if (Number(r.sort_order) !== i) changed.push({ ...r, sort_order: i }) })
    setRules(reordered.map((r, i) => ({ ...r, sort_order: i })))
    try {
      await Promise.all(changed.map(r => api.put(`/shipping/rules/${r.id}`, rulePayload(r))))
      addToast('Ordem atualizada.', 'success')
    } catch { addToast('Não foi possível salvar a nova ordem.', 'error'); load() }
  }

  return (
    <>
      <div className={styles.toolbar}>
        <select className={styles.select} value={zoneFilter} onChange={e => setZoneFilter(e.target.value)}>
          <option value="">Todas as zonas</option>
          {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
        </select>
        <div className={styles.spacer} />
        <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setModal({ rule: null })}>
          <FiPlus /> Nova Regra
        </button>
      </div>

      {loading ? (
        <div>{[...Array(3)].map((_, i) => <div key={i} className={styles.skeletonCard} style={{ height: 48 }} />)}</div>
      ) : rules.length === 0 ? (
        <div className={styles.empty}><FiPackage className={styles.ic} /><p>Nenhuma regra de frete cadastrada.</p></div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th></th><th>Nome</th><th>Zona</th><th>Tipo</th><th>Preço</th><th>Prazo</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {rules.map((r, i) => {
                const meta = TYPE_META[r.type] || { label: r.type, cls: 'fixed' }
                return (
                  <tr key={r.id} className={styles.dragRow}
                    draggable
                    onDragStart={() => { dragIdx.current = i }}
                    onDragOver={e => e.preventDefault()}
                    onDrop={() => onDrop(i)}>
                    <td><FiMenu className={styles.dragHandle} title="Arraste para reordenar" /></td>
                    <td>{r.name}</td>
                    <td className={styles.muted}>{r.zone_name || 'Nacional (padrão)'}</td>
                    <td><span className={`${styles.typeBadge} ${styles[meta.cls]}`}>{meta.label}</span></td>
                    <td>{r.type === 'free' ? `Grátis acima ${fmtPrice(r.free_above)}` : r.type === 'by_weight' ? `${fmtPrice(r.price)}/kg` : fmtPrice(r.price)}</td>
                    <td className={styles.muted}>{r.estimated_days_min}-{r.estimated_days_max} dias</td>
                    <td><span className={`${styles.statusBadge} ${r.active ? styles.sent : styles.failed}`}>{r.active ? 'Ativo' : 'Inativo'}</span></td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className={styles.btnIcon} onClick={() => setModal({ rule: r })} title="Editar"><FiEdit2 /></button>{' '}
                      <button className={`${styles.btnIcon} ${styles.btnDanger}`} onClick={() => remove(r)} title="Excluir"><FiTrash2 /></button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <AnimatePresence>
        {modal && <RuleModal rule={modal.rule} zones={zones} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} />}
      </AnimatePresence>
    </>
  )
}

const EMPTY_RULE = {
  zone_id: '', name: '', type: 'fixed', price: '', free_above: '',
  estimated_days_min: 3, estimated_days_max: 10, max_weight_g: '', sort_order: 0, active: true,
}
const RULE_TYPES = [
  { value: 'fixed', label: 'Fixo', icon: <FiDollarSign /> },
  { value: 'free', label: 'Grátis', icon: <FiGift /> },
  { value: 'by_weight', label: 'Por Peso', icon: <FiPackage /> },
]

function RuleModal({ rule, zones, onClose, onSaved }) {
  const addToast = useToast()
  const [form, setForm] = useState(() => rule ? {
    zone_id: rule.zone_id ?? '', name: rule.name || '', type: rule.type || 'fixed',
    price: rule.price ?? '', free_above: rule.free_above ?? '',
    estimated_days_min: rule.estimated_days_min ?? 3, estimated_days_max: rule.estimated_days_max ?? 10,
    max_weight_g: rule.max_weight_g ?? '', sort_order: rule.sort_order ?? 0, active: rule.active ?? true,
  } : { ...EMPTY_RULE })
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    if (!form.name.trim()) { addToast('Informe o nome da regra.', 'error'); return }
    if (Number(form.estimated_days_min) > Number(form.estimated_days_max)) {
      addToast('Prazo mínimo deve ser menor ou igual ao máximo.', 'error'); return
    }
    const payload = {
      zone_id: form.zone_id ? Number(form.zone_id) : null,
      name: form.name.trim(),
      type: form.type,
      price: (form.type === 'fixed' || form.type === 'by_weight') ? Number(form.price) || 0 : 0,
      free_above: form.type === 'free' ? Number(form.free_above) || 0 : null,
      estimated_days_min: Number(form.estimated_days_min),
      estimated_days_max: Number(form.estimated_days_max),
      max_weight_g: form.type === 'by_weight' && form.max_weight_g ? Number(form.max_weight_g) : null,
      sort_order: Number(form.sort_order) || 0,
      active: !!form.active,
    }
    setSaving(true)
    try {
      if (rule?.id) await api.put(`/shipping/rules/${rule.id}`, payload)
      else await api.post('/shipping/rules', payload)
      addToast('Regra salva!', 'success')
      onSaved()
    } catch (err) {
      addToast(err?.response?.data?.error || 'Não foi possível salvar a regra.', 'error')
    } finally { setSaving(false) }
  }

  return (
    <motion.div className={styles.modalOverlay} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className={styles.modal} initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }} onClick={e => e.stopPropagation()}>
        <div className={styles.modalTitle}>{rule ? 'Editar' : 'Nova'} Regra de Frete</div>

        <div className={styles.field}>
          <label>Zona</label>
          <select className={styles.input} value={form.zone_id} onChange={set('zone_id')}>
            <option value="">Sem zona (padrão nacional)</option>
            {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
        </div>

        <div className={styles.field}>
          <label>Nome</label>
          <input className={styles.input} value={form.name} onChange={set('name')} placeholder="Ex: SEDEX" />
        </div>

        <div className={styles.field}>
          <label>Tipo</label>
          <div className={styles.radioGroup}>
            {RULE_TYPES.map(t => (
              <div key={t.value} className={`${styles.radioOpt} ${form.type === t.value ? styles.active : ''}`}
                onClick={() => setForm(f => ({ ...f, type: t.value }))}>
                <input type="radio" name="ruleType" checked={form.type === t.value} onChange={() => setForm(f => ({ ...f, type: t.value }))} />
                {t.icon} {t.label}
              </div>
            ))}
          </div>
        </div>

        {form.type === 'fixed' && (
          <div className={styles.field}>
            <label>Preço (R$)</label>
            <input type="number" min="0" step="0.01" className={styles.input} value={form.price} onChange={set('price')} placeholder="0.00" />
          </div>
        )}
        {form.type === 'free' && (
          <div className={styles.field}>
            <label>Grátis acima de (R$)</label>
            <input type="number" min="0" step="0.01" className={styles.input} value={form.free_above} onChange={set('free_above')} placeholder="299.00" />
          </div>
        )}
        {form.type === 'by_weight' && (
          <div className={styles.row2}>
            <div className={styles.field}>
              <label>Preço por Kg (R$)</label>
              <input type="number" min="0" step="0.01" className={styles.input} value={form.price} onChange={set('price')} placeholder="0.00" />
            </div>
            <div className={styles.field}>
              <label>Peso máximo (g)</label>
              <input type="number" min="1" className={styles.input} value={form.max_weight_g} onChange={set('max_weight_g')} placeholder="ex: 30000" />
            </div>
          </div>
        )}

        <div className={styles.row2}>
          <div className={styles.field}>
            <label>Prazo mínimo (dias)</label>
            <input type="number" min="0" className={styles.input} value={form.estimated_days_min} onChange={set('estimated_days_min')} />
          </div>
          <div className={styles.field}>
            <label>Prazo máximo (dias)</label>
            <input type="number" min="0" className={styles.input} value={form.estimated_days_max} onChange={set('estimated_days_max')} />
          </div>
        </div>

        <div className={styles.field}>
          <label>Ordem de exibição</label>
          <input type="number" className={styles.input} value={form.sort_order} onChange={set('sort_order')} />
        </div>

        <div className={styles.field}>
          <label>Status</label>
          <div className={styles.switchRow}>
            <button type="button" className={`${styles.switch} ${form.active ? styles.on : ''}`} onClick={() => setForm(f => ({ ...f, active: !f.active }))}>
              <span className={styles.switchKnob} />
            </button>
            <span>{form.active ? 'Ativo' : 'Inativo'}</span>
          </div>
        </div>

        <div className={styles.modalActions}>
          <button className={styles.btn} onClick={onClose}>Cancelar</button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={save} disabled={saving}>
            <FiSave /> {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

/* ============================================================
   NOTIFICAÇÕES WHATSAPP
   ============================================================ */
const WA_STATUS = {
  pending: { label: 'Aguardando', cls: 'pending' },
  sent: { label: 'Enviado', cls: 'sent' },
  failed: { label: 'Falhou', cls: 'failed' },
}

function WhatsAppTab() {
  const addToast = useToast()
  const [rows, setRows] = useState(null)

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/shipping/whatsapp')
      setRows(Array.isArray(data) ? data : [])
    } catch { setRows([]) }
  }, [])
  useEffect(() => { load() }, [load])

  const openWa = async (n) => {
    if (n.wa_link) window.open(n.wa_link, '_blank', 'noopener')
    try {
      await api.put(`/shipping/whatsapp/${n.id}/sent`)
      setRows(prev => prev.map(r => r.id === n.id ? { ...r, status: 'sent', sent_at: new Date().toISOString() } : r))
    } catch { addToast('Não foi possível atualizar o status.', 'error') }
  }

  return (
    <>
      <div className={styles.infoCard}>
        <FiInfo size={20} />
        <span>
          As notificações são enviadas via link do WhatsApp Web. Ao clicar em "Abrir WhatsApp",
          a mensagem é aberta pré-preenchida para você enviar ao cliente com um clique.
        </span>
      </div>

      {rows === null ? (
        <div>{[...Array(4)].map((_, i) => <div key={i} className={styles.skeletonCard} style={{ height: 48 }} />)}</div>
      ) : rows.length === 0 ? (
        <div className={styles.empty}><FaWhatsapp className={styles.ic} /><p>Nenhuma notificação enviada ainda.</p></div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>#Pedido</th><th>Cliente</th><th>Telefone</th><th>Status</th><th>Data</th><th>Ações</th></tr>
            </thead>
            <tbody>
              {rows.map(n => {
                const st = WA_STATUS[n.status] || WA_STATUS.pending
                return (
                  <tr key={n.id}>
                    <td className={styles.num}>#{n.order_id}</td>
                    <td>{n.customer_name || '—'}</td>
                    <td className={styles.muted}>{n.phone || '—'}</td>
                    <td><span className={`${styles.statusBadge} ${styles[st.cls]}`}>{st.label}</span></td>
                    <td className={styles.muted}>{fmtDate(n.created_at)}</td>
                    <td>
                      <button className={styles.waBtnOpen} onClick={() => openWa(n)} disabled={!n.wa_link}>
                        <FaWhatsapp /> Abrir WhatsApp
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
