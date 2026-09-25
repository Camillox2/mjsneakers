import { useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import { FiPlus, FiEdit2, FiPause, FiInfo, FiAlertTriangle } from 'react-icons/fi'
import { FaWhatsapp } from 'react-icons/fa'
import api, { asList } from '../lib/api'
import { useResource } from '../lib/hooks'
import { money, plural, dateTime } from '../lib/format'
import { PageHeader, Panel, SubNav, Button, Select, ErrorNote, Skeleton, EmptyState, Dialog, TextField, SelectField, Segmented, Switch, Badge, DataTable, useConfirm, useToast } from '../ui'
import { ShoeBox, Envelope } from '../art/Art'
import { parseDecimal, decimalInput } from './formInput'
import s from './sections.module.css'
import sh from './Shipping.module.css'

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
const zoneActive = (z) => z.active !== 0 && z.active !== false
const listText = (items) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}` : items[0] || '')

export default function Shipping() {
  const zones = useResource(() => api.get('/shipping/zones', { params: { all: 1 } }).then(r => asList(r.data)), [])
  return (
    <div>
      <PageHeader
        title="Frete"
        description="Para o CEP do cliente, o checkout mostra as regras ativas da zona do estado dele, da mais barata para a mais cara. Estado fora de qualquer zona usa as regras de Todo o Brasil."
      />
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
  price: parseDecimal(r.price) || 0,
  free_above: r.type === 'free' ? parseDecimal(r.free_above) || 0 : null,
  estimated_days_min: parseInt(r.estimated_days_min, 10) || 0,
  estimated_days_max: parseInt(r.estimated_days_max, 10) || 0,
  max_weight_g: r.type === 'by_weight' && String(r.max_weight_g).trim() ? parseInt(r.max_weight_g, 10) : null,
  sort_order: sort ?? (Number(r.sort_order) || 0),
  active: !!r.active,
})

// O mesmo que o servidor recusa, com a mensagem no campo certo.
function ruleErrors(r) {
  const e = {}
  const isMoney = (v) => String(v).trim() !== '' && parseDecimal(v) >= 0 && parseDecimal(v) <= 100000
  if (!r.name.trim()) e.name = 'Dê um nome à regra, como PAC ou Motoboy.'
  if (r.type === 'free') {
    if (!isMoney(r.free_above)) e.free_above = 'Informe a partir de quanto o frete sai grátis.'
    if (String(r.price).trim() && !isMoney(r.price)) e.price = 'Use um valor em reais, ou deixe vazio para 0.'
  } else if (!isMoney(r.price)) {
    e.price = r.type === 'by_weight' ? 'Informe o preço por kg.' : 'Informe o preço (0 para grátis).'
  }
  const min = String(r.estimated_days_min).trim()
  const max = String(r.estimated_days_max).trim()
  if (!/^\d{1,3}$/.test(min)) e.days_min = 'Use um número de dias.'
  if (!/^\d{1,3}$/.test(max)) e.days_max = 'Use um número de dias.'
  else if (!e.days_min && Number(min) > Number(max)) e.days_max = 'O prazo máximo não pode ser menor que o mínimo.'
  const weight = String(r.max_weight_g).trim()
  if (r.type === 'by_weight' && weight && !(/^\d{1,7}$/.test(weight) && Number(weight) >= 1)) e.max_weight_g = 'Use o peso em gramas, maior que zero.'
  return e
}

function priceText(r) {
  if (r.type === 'free') return Number(r.price) > 0 ? `Grátis acima de ${money(r.free_above)} (abaixo, ${money(r.price)})` : `Grátis acima de ${money(r.free_above)}`
  if (r.type === 'by_weight') return `${money(r.price)} por kg`
  return Number(r.price) > 0 ? money(r.price) : 'Grátis'
}

function Rules({ zones }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [zone, setZone] = useState('')
  const list = useResource(() => api.get('/shipping/rules', { params: { all: 1, zone_id: zone || undefined } }).then(r => asList(r.data)), [zone])
  const [edit, setEdit] = useState(null)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const rows = list.data || []

  const open = (r) => {
    setErrors({})
    setEdit(r
      ? {
        ...EMPTY_RULE, ...r, zone_id: r.zone_id ? String(r.zone_id) : '', price: decimalInput(r.price), free_above: decimalInput(r.free_above),
        estimated_days_min: String(r.estimated_days_min ?? 3), estimated_days_max: String(r.estimated_days_max ?? 10),
        max_weight_g: r.max_weight_g ? String(r.max_weight_g) : '', active: !!r.active,
      }
      : { ...EMPTY_RULE, zone_id: zone })
  }
  const set = (k) => (e) => setEdit(x => ({ ...x, [k]: e?.target ? e.target.value : e }))

  const save = async () => {
    if (saving) return
    const e = ruleErrors(edit)
    setErrors(e)
    if (Object.keys(e).length) return
    setSaving(true)
    try {
      const body = rulePayload(edit, edit.id ? edit.sort_order : rows.length)
      if (edit.id) await api.put(`/shipping/rules/${edit.id}`, body)
      else await api.post('/shipping/rules', body)
      toast.good('Regra de frete salva.')
      setEdit(null); list.reload()
    } catch (err) { toast.error(err.message) } finally { setSaving(false) }
  }

  // O servidor não apaga regra (pedidos antigos apontam para ela): só pausa.
  const pause = async () => {
    if (!(await confirm({ title: `Pausar a regra ${edit.name}?`, message: 'Ela sai do checkout e fica guardada aqui, pausada. Pedidos antigos continuam com o frete que tiveram.', confirmLabel: 'Pausar regra', tone: 'danger' }))) return
    try { await api.delete(`/shipping/rules/${edit.id}`); toast.good('Regra pausada.'); setEdit(null); list.reload() } catch (err) { toast.error(err.message) }
  }

  return (
    <div className={s.grid}>
      <div className={sh.bar}>
        <Select className={sh.zoneSelect} aria-label="Zona" placeholder="Todas as zonas" value={zone} onChange={e => setZone(e.target.value)} options={zones.map(z => ({ value: String(z.id), label: z.name }))} />
        <span className={sh.spacer} />
        <Button variant="primary" icon={<FiPlus />} onClick={() => open(null)}>Nova regra</Button>
      </div>
      <ErrorNote error={list.error} onRetry={list.reload} />
      <Panel flush>
        {list.loading && !list.data ? <div className={sh.pad}><Skeleton lines={4} height={40} /></div> : rows.length ? (
          <ul className={sh.rules}>
            {rows.map(r => (
              <li key={r.id}>
                <button type="button" className={sh.rule} onClick={() => open(r)} aria-label={`Editar a regra ${r.name}`}>
                  <span className={sh.ruleMain}>
                    <span className={sh.ruleName}>{r.name}</span>
                    <span className={sh.ruleSub}>{r.zone_name || 'Todo o Brasil'}, {r.estimated_days_min} a {plural(r.estimated_days_max, 'dia útil', 'dias úteis')}</span>
                  </span>
                  <span className={sh.rulePrice}>{priceText(r)}</span>
                  <span className={sh.ruleBadge}>{r.active ? <Badge tone="good">Ativa</Badge> : <Badge>Pausada</Badge>}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : !list.error && (
          <EmptyState art={<ShoeBox />} title={zone ? 'Nenhuma regra nesta zona' : 'Nenhuma regra de frete'} action={<Button variant="primary" icon={<FiPlus />} onClick={() => open(null)}>Criar regra</Button>}>
            Sem regra ativa para o estado do cliente, o checkout oferece o padrão: PAC por {money(15)} e SEDEX por {money(30)}. Crie as suas para valerem os seus preços e prazos.
          </EmptyState>
        )}
      </Panel>

      <Dialog
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? `Regra ${edit.name}` : 'Nova regra de frete'}
        footer={<>
          {edit?.id && edit.active && <Button variant="danger" icon={<FiPause />} onClick={pause}>Pausar</Button>}
          <span className={sh.spacer} />
          <Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button>
          <Button variant="primary" onClick={save} loading={saving}>Salvar regra</Button>
        </>}
      >
        {edit && (
          <div className={s.formGrid}>
            <TextField label="Nome que o cliente vê" value={edit.name} onChange={set('name')} error={errors.name} placeholder="Ex.: PAC, SEDEX, Motoboy" data-autofocus maxLength={100} />
            <SelectField label="Zona" placeholder="Todo o Brasil" value={edit.zone_id} onChange={set('zone_id')} options={zones.map(z => ({ value: String(z.id), label: z.name }))} hint="Todo o Brasil: vale para os estados que não estão em zona nenhuma." />
            <Segmented label="Como cobra" value={edit.type} onChange={set('type')} options={Object.entries(TYPES).map(([value, label]) => ({ value, label }))} />
            {edit.type === 'fixed' && <TextField label="Preço" prefix="R$" inputMode="decimal" value={edit.price} onChange={set('price')} error={errors.price} placeholder="0,00" />}
            {edit.type === 'free' && (
              <div className={s.formRow}>
                <TextField label="Grátis a partir de" prefix="R$" inputMode="decimal" value={edit.free_above} onChange={set('free_above')} error={errors.free_above} placeholder="499,00" hint="Valor dos produtos no carrinho." />
                <TextField label="Preço abaixo desse valor" prefix="R$" inputMode="decimal" value={edit.price} onChange={set('price')} error={errors.price} placeholder="0,00" hint="O que o cliente paga quando o pedido não chega ao mínimo." />
              </div>
            )}
            {edit.type === 'by_weight' && (
              <div className={s.formRow}>
                <TextField label="Preço por kg" prefix="R$" inputMode="decimal" value={edit.price} onChange={set('price')} error={errors.price} hint="Cobra pelo menos o preço de 1 kg." />
                <TextField label="Peso máximo" suffix="g" inputMode="numeric" value={edit.max_weight_g} onChange={set('max_weight_g')} error={errors.max_weight_g} hint="Acima dele a regra some do checkout. Vazio: sem limite." />
              </div>
            )}
            <div className={s.formRow}>
              <TextField label="Prazo mínimo" suffix="dias" inputMode="numeric" value={edit.estimated_days_min} onChange={set('estimated_days_min')} error={errors.days_min} />
              <TextField label="Prazo máximo" suffix="dias" inputMode="numeric" value={edit.estimated_days_max} onChange={set('estimated_days_max')} error={errors.days_max} hint="Dias úteis, contados do pagamento." />
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
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const list = zones.data || []

  const open = (z) => { setError(''); setEdit(z ? { ...z, states: splitUfs(z.states), active: zoneActive(z) } : { name: '', states: [], active: true }) }
  const toggleUf = (uf) => setEdit(x => ({ ...x, states: x.states.includes(uf) ? x.states.filter(u => u !== uf) : [...x.states, uf] }))
  const toggleRegion = (ufs) => setEdit(x => {
    const all = ufs.every(u => x.states.includes(u))
    return { ...x, states: all ? x.states.filter(u => !ufs.includes(u)) : [...new Set([...x.states, ...ufs])] }
  })

  // Estado que já está em outra zona ativa: o checkout usa só a zona mais antiga.
  const taken = {}
  list.filter(z => z.id !== edit?.id && zoneActive(z)).forEach(z => splitUfs(z.states).forEach(uf => { taken[uf] = taken[uf] || z.name }))
  const conflicts = (edit?.states || []).filter(uf => taken[uf])
  const conflictZones = [...new Set(conflicts.map(uf => taken[uf]))]

  const save = async () => {
    if (saving) return
    if (!edit.name.trim()) { setError('Dê um nome à zona.'); return }
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
    if (!(await confirm({ title: `Excluir a zona ${edit.name}?`, message: 'Só dá para excluir sem regra ativa nela: pause as regras da zona antes. As regras pausadas passam para Todo o Brasil.', confirmLabel: 'Excluir', tone: 'danger' }))) return
    try { await api.delete(`/shipping/zones/${edit.id}`); toast.good('Zona excluída.'); setEdit(null); zones.reload() } catch (err) { toast.error(err.message) }
  }

  return (
    <div className={s.grid}>
      <div className={sh.bar}>
        <p className={sh.note}>Zona junta estados que pagam o mesmo frete. Cada regra de frete vale para uma zona ou para Todo o Brasil.</p>
        <span className={sh.spacer} />
        <Button variant="primary" icon={<FiPlus />} onClick={() => open(null)}>Nova zona</Button>
      </div>
      <ErrorNote error={zones.error} onRetry={zones.reload} />
      {zones.loading && !zones.data ? <Panel><Skeleton lines={3} height={40} /></Panel> : list.length ? (
        <div className={s.cardGrid}>
          {list.map(z => (
            <Panel key={z.id} title={z.name} actions={<Button size="small" variant="ghost" icon={<FiEdit2 />} aria-label={`Editar a zona ${z.name}`} onClick={() => open(z)} />}>
              <div className={s.chips}>{splitUfs(z.states).map(uf => <span key={uf} className={s.chip}>{uf}</span>)}</div>
              {!zoneActive(z) && <div className={sh.paused}><Badge>Pausada</Badge></div>}
            </Panel>
          ))}
        </div>
      ) : !zones.error && (
        <Panel>
          <EmptyState art={<ShoeBox />} title="Nenhuma zona" action={<Button variant="primary" icon={<FiPlus />} onClick={() => open(null)}>Criar zona</Button>}>
            Sem zonas, as regras valem para o Brasil inteiro. Crie zonas para cobrar diferente por região.
          </EmptyState>
        </Panel>
      )}

      <Dialog
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? `Zona ${edit.name}` : 'Nova zona'}
        footer={<>
          {edit?.id && <Button variant="danger" onClick={remove}>Excluir zona</Button>}
          <span className={sh.spacer} />
          <Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button>
          <Button variant="primary" onClick={save} loading={saving}>Salvar zona</Button>
        </>}
      >
        {edit && (
          <div className={s.formGrid}>
            <TextField label="Nome" value={edit.name} onChange={e => { setError(''); setEdit(x => ({ ...x, name: e.target.value })) }} error={error || undefined} placeholder="Ex.: Sudeste" data-autofocus maxLength={100} />
            <div>
              <p className={s.sectionTitle}>Estados <span className={sh.chosen}>({plural(edit.states.length, 'escolhido', 'escolhidos')})</span></p>
              <div className={`${s.chips} ${sh.regions}`}>
                {Object.entries(REGIONS).map(([name, ufs]) => {
                  const on = ufs.every(u => edit.states.includes(u))
                  return <Button key={name} size="small" variant={on ? 'primary' : 'secondary'} aria-pressed={on} onClick={() => toggleRegion(ufs)}>{name}</Button>
                })}
              </div>
              <div className={sh.ufs}>
                {UFS.map(uf => (
                  <button key={uf} type="button" className={sh.uf} aria-pressed={edit.states.includes(uf)} onClick={() => toggleUf(uf)}>{uf}</button>
                ))}
              </div>
            </div>
            {conflicts.length > 0 && (
              <p className={sh.warn} role="status">
                <FiAlertTriangle aria-hidden="true" />
                {listText(conflicts)} {conflicts.length === 1 ? 'já está' : 'já estão'} na zona {listText(conflictZones)}. Estado em duas zonas usa só a zona criada primeiro.
              </p>
            )}
            <Switch checked={edit.active} onChange={v => setEdit(x => ({ ...x, active: v }))} label="Zona ativa" description="Pausada, os estados dela usam as regras de Todo o Brasil." />
          </div>
        )}
      </Dialog>
    </div>
  )
}

/* ---------- WhatsApp ---------- */

const ST = { pending: { label: 'Para mandar', tone: 'warning' }, sent: { label: 'Mandado', tone: 'good' }, failed: { label: 'Falhou', tone: 'critical' } }
// só abre link do próprio WhatsApp (o endereço vem do banco)
const safeWa = (link) => (/^https:\/\/wa\.me\/\d+(\?|$)/.test(String(link || '')) ? link : null)

function WhatsApp() {
  const toast = useToast()
  const list = useResource(() => api.get('/shipping/whatsapp').then(r => asList(r.data)), [])

  const openWa = async (n) => {
    const link = safeWa(n.wa_link)
    if (!link) { toast.error('O link deste aviso não é do WhatsApp. Gere de novo pelo pedido.'); return }
    window.open(link, '_blank', 'noopener,noreferrer')
    if (n.status === 'sent') return
    try {
      await api.put(`/shipping/whatsapp/${n.id}/sent`)
      list.mutate(d => d.map(x => (x.id === n.id ? { ...x, status: 'sent', sent_at: new Date().toISOString() } : x)))
    } catch (err) { toast.error(err.message) }
  }

  return (
    <div className={s.grid}>
      <p className={sh.note}>
        <FiInfo aria-hidden="true" />
        Quando você salva o rastreio de um pedido, a mensagem pronta entra aqui. Toque em "Abrir WhatsApp", confira e envie. O aviso fica marcado como mandado.
      </p>
      <ErrorNote error={list.error} onRetry={list.reload} />
      <Panel flush>
        {list.loading && !list.data ? <div className={sh.pad}><Skeleton lines={4} height={30} /></div> : (
          <DataTable
            rows={list.data || []}
            columns={[
              { key: 'order', header: 'Pedido', primary: true, render: n => <strong>#{n.order_id}</strong> },
              { key: 'who', header: 'Cliente', render: n => n.customer_name || '' },
              { key: 'phone', header: 'Telefone', render: n => n.phone || '' },
              { key: 'st', header: 'Situação', render: n => <Badge tone={ST[n.status]?.tone}>{ST[n.status]?.label || 'Sem situação'}</Badge> },
              { key: 'when', header: 'Criado', render: n => <span className={s.nowrap}>{dateTime(n.created_at)}</span> },
              { key: 'act', header: '', render: n => <Button size="small" icon={<FaWhatsapp />} onClick={() => openWa(n)} disabled={!safeWa(n.wa_link)} aria-label={`Abrir WhatsApp do pedido ${n.order_id}`}>Abrir WhatsApp</Button> },
            ]}
            empty={<EmptyState art={<Envelope />} title="Nenhum aviso na fila">Os avisos aparecem quando você salva um código de rastreio.</EmptyState>}
          />
        )}
      </Panel>
    </div>
  )
}
