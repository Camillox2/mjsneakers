import { useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import { Reorder, useDragControls } from 'framer-motion'
import { FiPlus, FiEdit2, FiTrash2, FiMove, FiInfo } from 'react-icons/fi'
import { FaWhatsapp } from 'react-icons/fa'
import api, { asList } from '../lib/api'
import { useResource } from '../lib/hooks'
import { money, dateTime } from '../lib/format'
import { PageHeader, Panel, SubNav, Button, Select, ErrorNote, Skeleton, EmptyState, Dialog, TextField, SelectField, Segmented, Switch, Badge, DataTable, useConfirm, useToast } from '../ui'
import { ShoeBox, Envelope } from '../art/Art'
import s from './sections.module.css'

const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']
const REGIONS = {
  Sul: ['PR', 'RS', 'SC'],
  Sudeste: ['ES', 'MG', 'RJ', 'SP'],
  'Centro-Oeste': ['DF', 'GO', 'MT', 'MS'],
  Nordeste: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'],
  Norte: ['AC', 'AP', 'AM', 'PA', 'RO', 'RR', 'TO'],
}
const TYPES = { fixed: 'Preço fixo', free: 'Grátis acima de', by_weight: 'Por peso' }
const splitUfs = (v) => (Array.isArray(v) ? v : String(v || '').split(',').map(x => x.trim()).filter(Boolean))

export default function Shipping() {
  const zones = useResource(() => api.get('/shipping/zones', { params: { all: 1 } }).then(r => asList(r.data)), [])
  return (
    <div>
      <PageHeader title="Frete" description="A loja mostra, para o CEP do cliente, as regras ativas da zona dele, na ordem abaixo." />
      <SubNav items={[
        { to: '/admin/frete', label: 'Regras', end: true },
        { to: '/admin/frete/zonas', label: 'Zonas' },
        { to: '/admin/frete/whatsapp', label: 'Avisos no WhatsApp' },
      ]} />
      <Routes>
        <Route index element={<Rules zones={zones.data || []} />} />
        <Route path="zonas" element={<Zones zones={zones} />} />
        <Route path="whatsapp" element={<WhatsApp />} />
      </Routes>
    </div>
  )
}

/* ---------- Regras ---------- */

const EMPTY_RULE = { zone_id: '', name: '', type: 'fixed', price: '', free_above: '499', estimated_days_min: '3', estimated_days_max: '10', max_weight_g: '', active: true }

const rulePayload = (r, sort) => ({
  zone_id: r.zone_id ? Number(r.zone_id) : null,
  name: String(r.name).trim(),
  type: r.type,
  // na regra "grátis acima de", price é o que se cobra abaixo do limite
  price: Number(String(r.price).replace(',', '.')) || 0,
  free_above: r.type === 'free' ? Number(String(r.free_above).replace(',', '.')) || 0 : null,
  estimated_days_min: parseInt(r.estimated_days_min, 10) || 0,
  estimated_days_max: parseInt(r.estimated_days_max, 10) || 0,
  max_weight_g: r.type === 'by_weight' && r.max_weight_g ? parseInt(r.max_weight_g, 10) : null,
  sort_order: sort ?? (Number(r.sort_order) || 0),
  active: !!r.active,
})

function priceText(r) {
  if (r.type === 'free') return Number(r.price) > 0 ? `Grátis acima de ${money(r.free_above)} (abaixo, ${money(r.price)})` : `Grátis acima de ${money(r.free_above)}`
  if (r.type === 'by_weight') return `${money(r.price)} por kg`
  return money(r.price)
}

function RuleRow({ r, onEdit }) {
  const drag = useDragControls()
  return (
    <Reorder.Item value={r} dragListener={false} dragControls={drag} className={s.bannerRow} style={{ gridTemplateColumns: '40px minmax(0,1fr) auto auto' }}>
      <button type="button" className={s.dragHandle} onPointerDown={e => drag.start(e)} aria-label="Arraste para mudar a ordem"><FiMove aria-hidden="true" /></button>
      <button type="button" className={s.bannerMain} onClick={() => onEdit(r)}>
        <span className={s.listTitle}>{r.name}</span>
        <span className={s.listSub}>{r.zone_name || 'Todo o Brasil'}, {r.estimated_days_min} a {r.estimated_days_max} dias úteis</span>
      </button>
      <span className={s.strong} style={{ textAlign: 'right' }}>{priceText(r)}</span>
      {r.active ? <Badge tone="good">Ativa</Badge> : <Badge>Pausada</Badge>}
    </Reorder.Item>
  )
}

function Rules({ zones }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [zone, setZone] = useState('')
  const list = useResource(() => api.get('/shipping/rules', { params: { all: 1, zone_id: zone || undefined } }).then(r => asList(r.data).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))), [zone])
  const [order, setOrder] = useState(null)
  const [edit, setEdit] = useState(null)
  const [saving, setSaving] = useState(false)
  const rows = order || list.data || []

  const saveOrder = async () => {
    try {
      await Promise.all(rows.map((r, i) => (Number(r.sort_order) !== i ? api.put(`/shipping/rules/${r.id}`, rulePayload(r, i)) : null)))
      toast.good('Ordem salva.')
      setOrder(null); list.reload()
    } catch (err) { toast.error(err.message) }
  }

  const open = (r) => setEdit(r ? { ...EMPTY_RULE, ...r, zone_id: r.zone_id ? String(r.zone_id) : '', price: String(r.price ?? ''), free_above: String(r.free_above ?? ''), estimated_days_min: String(r.estimated_days_min ?? 3), estimated_days_max: String(r.estimated_days_max ?? 10), max_weight_g: r.max_weight_g ? String(r.max_weight_g) : '', active: !!r.active } : { ...EMPTY_RULE, zone_id: zone })
  const set = (k) => (e) => setEdit(x => ({ ...x, [k]: e?.target ? e.target.value : e }))

  const save = async () => {
    if (!edit.name.trim()) { toast.error('Dê um nome à regra, como PAC ou Motoboy.'); return }
    if ((parseInt(edit.estimated_days_min, 10) || 0) > (parseInt(edit.estimated_days_max, 10) || 0)) { toast.error('O prazo mínimo não pode passar do máximo.'); return }
    setSaving(true)
    try {
      const body = rulePayload(edit, edit.id ? edit.sort_order : rows.length)
      if (edit.id) await api.put(`/shipping/rules/${edit.id}`, body)
      else await api.post('/shipping/rules', body)
      toast.good('Regra de frete salva.')
      setEdit(null); setOrder(null); list.reload()
    } catch (err) { toast.error(err.message) } finally { setSaving(false) }
  }

  const remove = async () => {
    if (!(await confirm({ title: `Excluir a regra ${edit.name}?`, message: 'Pedidos antigos continuam com o frete que tiveram.', confirmLabel: 'Excluir', tone: 'danger' }))) return
    try { await api.delete(`/shipping/rules/${edit.id}`); toast.good('Regra excluída.'); setEdit(null); list.reload() } catch (err) { toast.error(err.message) }
  }

  return (
    <div className={s.grid}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <Select aria-label="Zona" style={{ width: 'auto', minWidth: 200 }} placeholder="Todas as zonas" value={zone} onChange={e => { setZone(e.target.value); setOrder(null) }} options={zones.map(z => ({ value: String(z.id), label: z.name }))} />
        <span style={{ flex: 1 }} />
        <Button variant="primary" icon={<FiPlus />} onClick={() => open(null)}>Nova regra</Button>
      </div>
      {order && (
        <div className={s.bulk}>
          <strong>A ordem mudou.</strong><span style={{ flex: 1 }} />
          <Button size="small" variant="ghost" onClick={() => setOrder(null)}>Desfazer</Button>
          <Button size="small" variant="primary" onClick={saveOrder}>Salvar ordem</Button>
        </div>
      )}
      <ErrorNote error={list.error} onRetry={list.reload} />
      <Panel flush>
        {list.loading && !list.data ? <div style={{ padding: 18 }}><Skeleton lines={4} height={40} /></div> : rows.length ? (
          <Reorder.Group axis="y" values={rows} onReorder={setOrder} style={{ margin: 0, padding: '0 16px' }}>
            {rows.map(r => <RuleRow key={r.id} r={r} onEdit={open} />)}
          </Reorder.Group>
        ) : (
          <EmptyState art={<ShoeBox />} title="Nenhuma regra de frete" action={<Button variant="primary" icon={<FiPlus />} onClick={() => open(null)}>Criar regra</Button>}>
            Sem regras, o cliente não consegue escolher o frete no checkout.
          </EmptyState>
        )}
      </Panel>

      <Dialog
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? `Regra ${edit.name}` : 'Nova regra de frete'}
        footer={<>
          {edit?.id && <Button variant="danger" icon={<FiTrash2 />} onClick={remove}>Excluir</Button>}
          <span style={{ flex: 1 }} />
          <Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button>
          <Button variant="primary" onClick={save} loading={saving}>Salvar regra</Button>
        </>}
      >
        {edit && (
          <div className={s.formGrid}>
            <TextField label="Nome que o cliente vê" value={edit.name} onChange={set('name')} placeholder="Ex.: PAC, SEDEX, Motoboy" data-autofocus maxLength={100} />
            <SelectField label="Zona" placeholder="Todo o Brasil" value={edit.zone_id} onChange={set('zone_id')} options={zones.map(z => ({ value: String(z.id), label: z.name }))} />
            <Segmented label="Como cobra" value={edit.type} onChange={set('type')} options={Object.entries(TYPES).map(([value, label]) => ({ value, label }))} />
            {edit.type === 'fixed' && <TextField label="Preço" prefix="R$" inputMode="decimal" value={edit.price} onChange={set('price')} />}
            {edit.type === 'free' && (
              <div className={s.formRow}>
                <TextField label="Grátis a partir de" prefix="R$" inputMode="decimal" value={edit.free_above} onChange={set('free_above')} placeholder="499,00" />
                <TextField label="Preço abaixo desse valor" prefix="R$" inputMode="decimal" value={edit.price} onChange={set('price')} placeholder="0,00" hint="O que o cliente paga quando o pedido não chega ao mínimo." />
              </div>
            )}
            {edit.type === 'by_weight' && (
              <div className={s.formRow}>
                <TextField label="Preço por kg" prefix="R$" inputMode="decimal" value={edit.price} onChange={set('price')} />
                <TextField label="Peso máximo" suffix="g" inputMode="numeric" value={edit.max_weight_g} onChange={set('max_weight_g')} hint="Vazio: sem limite" />
              </div>
            )}
            <div className={s.formRow}>
              <TextField label="Prazo mínimo" suffix="dias" inputMode="numeric" value={edit.estimated_days_min} onChange={set('estimated_days_min')} />
              <TextField label="Prazo máximo" suffix="dias" inputMode="numeric" value={edit.estimated_days_max} onChange={set('estimated_days_max')} />
            </div>
            <Switch checked={edit.active} onChange={set('active')} label="Regra ativa" description="Pausada, não aparece no checkout." />
          </div>
        )}
      </Dialog>
    </div>
  )
}

/* ---------- Zonas ---------- */

function Zones({ zones }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [edit, setEdit] = useState(null)
  const [saving, setSaving] = useState(false)
  const list = zones.data || []

  const toggleUf = (uf) => setEdit(x => ({ ...x, states: x.states.includes(uf) ? x.states.filter(u => u !== uf) : [...x.states, uf] }))
  const toggleRegion = (ufs) => setEdit(x => {
    const all = ufs.every(u => x.states.includes(u))
    return { ...x, states: all ? x.states.filter(u => !ufs.includes(u)) : [...new Set([...x.states, ...ufs])] }
  })

  const save = async () => {
    if (!edit.name.trim()) { toast.error('Dê um nome à zona.'); return }
    if (!edit.states.length) { toast.error('Escolha pelo menos um estado.'); return }
    setSaving(true)
    try {
      const body = { name: edit.name.trim(), states: edit.states, active: !!edit.active }
      if (edit.id) await api.put(`/shipping/zones/${edit.id}`, body)
      else await api.post('/shipping/zones', body)
      toast.good('Zona salva.')
      setEdit(null); zones.reload()
    } catch (err) { toast.error(err.message) } finally { setSaving(false) }
  }

  const remove = async () => {
    if (!(await confirm({ title: `Excluir a zona ${edit.name}?`, message: 'Tire antes as regras de frete dela.', confirmLabel: 'Excluir', tone: 'danger' }))) return
    try { await api.delete(`/shipping/zones/${edit.id}`); toast.good('Zona excluída.'); setEdit(null); zones.reload() } catch (err) { toast.error(err.message) }
  }

  return (
    <div className={s.grid}>
      <div><Button variant="primary" icon={<FiPlus />} onClick={() => setEdit({ name: '', states: [], active: true })}>Nova zona</Button></div>
      <ErrorNote error={zones.error} onRetry={zones.reload} />
      {zones.loading && !zones.data ? <Panel><Skeleton lines={3} height={40} /></Panel> : list.length ? (
        <div className={s.cardGrid}>
          {list.map(z => (
            <Panel key={z.id} title={z.name} actions={<Button size="small" variant="ghost" icon={<FiEdit2 />} aria-label={`Editar ${z.name}`} onClick={() => setEdit({ ...z, states: splitUfs(z.states), active: z.active !== 0 && z.active !== false })} />}>
              <div className={s.chips}>{splitUfs(z.states).map(uf => <span key={uf} className={s.chip}>{uf}</span>)}</div>
              {(z.active === 0 || z.active === false) && <div style={{ marginTop: 10 }}><Badge>Pausada</Badge></div>}
            </Panel>
          ))}
        </div>
      ) : <Panel><EmptyState art={<ShoeBox />} title="Nenhuma zona">Sem zonas, as regras valem para o Brasil inteiro. Crie zonas para cobrar diferente por região.</EmptyState></Panel>}

      <Dialog
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? `Zona ${edit.name}` : 'Nova zona'}
        footer={<>
          {edit?.id && <Button variant="danger" icon={<FiTrash2 />} onClick={remove}>Excluir</Button>}
          <span style={{ flex: 1 }} />
          <Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button>
          <Button variant="primary" onClick={save} loading={saving}>Salvar zona</Button>
        </>}
      >
        {edit && (
          <div className={s.formGrid}>
            <TextField label="Nome" value={edit.name} onChange={e => setEdit(x => ({ ...x, name: e.target.value }))} placeholder="Ex.: Sudeste" data-autofocus />
            <div>
              <p className={s.sectionTitle}>Estados <span className={s.muted} style={{ fontWeight: 500 }}>({edit.states.length} escolhidos)</span></p>
              <div className={s.chips} style={{ marginBottom: 10 }}>
                {Object.entries(REGIONS).map(([name, ufs]) => (
                  <Button key={name} size="small" variant={ufs.every(u => edit.states.includes(u)) ? 'primary' : 'secondary'} onClick={() => toggleRegion(ufs)}>{name}</Button>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))', gap: 6 }}>
                {UFS.map(uf => {
                  const on = edit.states.includes(uf)
                  return (
                    <button key={uf} type="button" aria-pressed={on} onClick={() => toggleUf(uf)}
                      style={{ minHeight: 44, borderRadius: 8, border: `1px solid ${on ? 'var(--a-series-1)' : 'var(--a-line-strong)'}`, background: on ? 'var(--a-info-wash)' : 'transparent', color: 'var(--a-text)', fontWeight: on ? 700 : 500, cursor: 'pointer', fontSize: 14.5 }}>
                      {uf}
                    </button>
                  )
                })}
              </div>
            </div>
            <Switch checked={edit.active} onChange={v => setEdit(x => ({ ...x, active: v }))} label="Zona ativa" />
          </div>
        )}
      </Dialog>
    </div>
  )
}

/* ---------- WhatsApp ---------- */

function WhatsApp() {
  const toast = useToast()
  const list = useResource(() => api.get('/shipping/whatsapp').then(r => asList(r.data)), [])

  const openWa = async (n) => {
    if (n.wa_link) window.open(n.wa_link, '_blank', 'noopener')
    try {
      await api.put(`/shipping/whatsapp/${n.id}/sent`)
      list.mutate(d => d.map(x => (x.id === n.id ? { ...x, status: 'sent', sent_at: new Date().toISOString() } : x)))
    } catch (err) { toast.error(err.message) }
  }

  const ST = { pending: { label: 'Para mandar', tone: 'warning' }, sent: { label: 'Mandado', tone: 'good' }, failed: { label: 'Falhou', tone: 'critical' } }

  return (
    <div className={s.grid}>
      <p className={`${s.small} ${s.muted}`} style={{ margin: 0, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <FiInfo aria-hidden="true" style={{ marginTop: 3, flexShrink: 0 }} />
        Quando você salva o rastreio de um pedido, a mensagem pronta entra aqui. Toque em "Abrir WhatsApp" e é só enviar.
      </p>
      <ErrorNote error={list.error} onRetry={list.reload} />
      <Panel flush>
        {list.loading && !list.data ? <div style={{ padding: 18 }}><Skeleton lines={4} height={30} /></div> : (
          <DataTable
            rows={list.data || []}
            columns={[
              { key: 'order', header: 'Pedido', primary: true, render: n => <strong>#{n.order_id}</strong> },
              { key: 'who', header: 'Cliente', render: n => n.customer_name || '' },
              { key: 'phone', header: 'Telefone', render: n => n.phone || '' },
              { key: 'st', header: 'Situação', render: n => <Badge tone={ST[n.status]?.tone}>{ST[n.status]?.label || n.status}</Badge> },
              { key: 'when', header: 'Criado', render: n => <span className={s.nowrap}>{dateTime(n.created_at)}</span> },
              { key: 'act', header: '', render: n => <Button size="small" icon={<FaWhatsapp />} onClick={() => openWa(n)} disabled={!n.wa_link}>Abrir WhatsApp</Button> },
            ]}
            empty={<EmptyState art={<Envelope />} title="Nenhum aviso na fila">Os avisos aparecem quando você salva um código de rastreio.</EmptyState>}
          />
        )}
      </Panel>
    </div>
  )
}
