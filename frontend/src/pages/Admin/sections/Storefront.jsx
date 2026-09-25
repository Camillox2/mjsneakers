import { useEffect, useMemo, useRef, useState } from 'react'
import { Reorder, useDragControls } from 'framer-motion'
import { FiPlus, FiTrash2, FiMove, FiImage, FiX } from 'react-icons/fi'
import api, { asList, uploadImage } from '../lib/api'
import { useResource, useDebounced } from '../lib/hooks'
import { getImageUrl } from '../../../utils/imageHelper'
import { PageHeader, Panel, Button, ErrorNote, Skeleton, TextField, SelectField, Switch, SearchField, useToast } from '../ui'
import s from './sections.module.css'

const SPEEDS = [
  { value: '35s', label: 'Devagar' },
  { value: '20s', label: 'Normal' },
  { value: '12s', label: 'Rápida' },
]

export default function Storefront() {
  const settings = useResource(() => api.get('/settings/admin').then(r => r.data || {}), [])
  return (
    <div>
      <PageHeader title="Faixa e campanha" description="A faixa corrida no topo da loja e o bloco de campanha no fim da página inicial." />
      <ErrorNote error={settings.error} onRetry={settings.reload} />
      {settings.loading && !settings.data ? <Panel><Skeleton lines={6} height={28} /></Panel> : settings.data && (
        <div className={s.grid}>
          <Ticker settings={settings.data} onSaved={settings.reload} />
          <Campaign settings={settings.data} onSaved={settings.reload} />
        </div>
      )}
    </div>
  )
}

/* ---------- Faixa corrida ---------- */

function TickerRow({ t, onChange, onRemove }) {
  const drag = useDragControls()
  return (
    <Reorder.Item value={t} dragListener={false} dragControls={drag} className={s.bannerRow} style={{ gridTemplateColumns: '40px minmax(0,1fr) auto auto' }}>
      <button type="button" className={s.dragHandle} onPointerDown={e => drag.start(e)} aria-label="Arraste para mudar a ordem"><FiMove aria-hidden="true" /></button>
      <input
        value={t.text}
        onChange={e => onChange({ ...t, text: e.target.value })}
        maxLength={300}
        aria-label="Texto do aviso"
        style={{ minHeight: 42, width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--a-line-strong)', background: 'var(--a-sunken)', color: 'var(--a-text)', fontSize: 16 }}
      />
      <Switch checked={t.active} onChange={v => onChange({ ...t, active: v })} label="Mostrar este aviso" hideLabel />
      <Button size="small" variant="ghost" icon={<FiTrash2 />} aria-label="Apagar aviso" onClick={() => onRemove(t)} />
    </Reorder.Item>
  )
}

function Ticker({ settings, onSaved }) {
  const toast = useToast()
  const tickers = useResource(() => api.get('/tickers/all').then(r => asList(r.data)), [])
  const [items, setItems] = useState(null)
  const [removed, setRemoved] = useState([])
  const [cfg, setCfg] = useState({ enabled: true, speed: '20s', double: false })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setCfg({
      enabled: settings.ticker_enabled !== 'false',
      speed: settings.ticker_speed || '20s',
      double: settings.ticker_double === 'true',
    })
  }, [settings])

  useEffect(() => {
    if (tickers.data) setItems(tickers.data.map(t => ({ ...t, key: `t${t.id}` })))
  }, [tickers.data])

  const add = () => setItems(list => [...(list || []), { key: `n${Date.now()}`, text: '', active: true }])
  const change = (t) => setItems(list => list.map(x => (x.key === t.key ? t : x)))
  const remove = (t) => { setItems(list => list.filter(x => x.key !== t.key)); if (t.id) setRemoved(r => [...r, t.id]) }

  const save = async () => {
    const valid = (items || []).filter(t => t.text.trim())
    setSaving(true)
    try {
      await Promise.all(removed.map(id => api.delete(`/tickers/${id}`)))
      await Promise.all(valid.map((t, i) => {
        const body = { text: t.text.trim(), active: !!t.active, sort_order: i }
        return t.id ? api.put(`/tickers/${t.id}`, body) : api.post('/tickers', body)
      }))
      await api.put('/settings', { settings: { ticker_enabled: String(cfg.enabled), ticker_speed: cfg.speed, ticker_double: String(cfg.double) } })
      toast.good('Faixa salva. A loja mostra a nova versão em alguns minutos.')
      setRemoved([])
      tickers.reload(); onSaved()
    } catch (err) { toast.error(err.message) } finally { setSaving(false) }
  }

  const live = (items || []).filter(t => t.active && t.text.trim())
  const secs = parseFloat(cfg.speed) || 20

  return (
    <Panel title="Faixa de avisos" subtitle="topo da loja">
      <div className={s.formGrid}>
        <Switch checked={cfg.enabled} onChange={v => setCfg(c => ({ ...c, enabled: v }))} label="Mostrar a faixa" description="Desligada, some da loja mas os avisos ficam guardados." />

        <div aria-hidden="true" style={{ overflow: 'hidden', borderRadius: 10, border: '1px solid var(--a-line)', background: '#05060c', opacity: cfg.enabled ? 1 : 0.4 }}>
          {[false, ...(cfg.double ? [true] : [])].map(rev => (
            <div key={String(rev)} style={{ display: 'flex', whiteSpace: 'nowrap', padding: '8px 0', borderTop: rev ? '1px solid #1c2036' : 0 }}>
              <div style={{ display: 'flex', gap: 28, paddingRight: 28, animation: live.length ? `pzTicker ${secs}s linear infinite ${rev ? 'reverse' : ''}` : 'none', color: '#d8dce6', fontSize: 13.5, letterSpacing: '.02em' }}>
                {(live.length ? [...live, ...live, ...live] : [{ key: 'x', text: 'Escreva um aviso abaixo' }]).map((t, i) => <span key={`${t.key}-${i}`}>{t.text}</span>)}
              </div>
            </div>
          ))}
          <style>{'@keyframes pzTicker { from { transform: translateX(0) } to { transform: translateX(-33.333%) } } @media (prefers-reduced-motion: reduce) { [style*="pzTicker"] { animation: none !important } }'}</style>
        </div>

        {tickers.error && <ErrorNote error={tickers.error} onRetry={tickers.reload} />}
        {!items ? <Skeleton lines={3} height={40} /> : (
          <Reorder.Group axis="y" values={items} onReorder={setItems} style={{ margin: 0, padding: 0 }}>
            {items.map(t => <TickerRow key={t.key} t={t} onChange={change} onRemove={remove} />)}
          </Reorder.Group>
        )}
        <div><Button size="small" icon={<FiPlus />} onClick={add}>Novo aviso</Button></div>

        <div className={s.formRow}>
          <SelectField label="Velocidade" value={cfg.speed} onChange={e => setCfg(c => ({ ...c, speed: e.target.value }))} options={SPEEDS.some(o => o.value === cfg.speed) ? SPEEDS : [...SPEEDS, { value: cfg.speed, label: `Personalizada (${cfg.speed})` }]} />
          <div style={{ alignSelf: 'end' }}>
            <Switch checked={cfg.double} onChange={v => setCfg(c => ({ ...c, double: v }))} label="Duas linhas" description="A segunda corre no sentido contrário." />
          </div>
        </div>
        <div><Button variant="primary" onClick={save} loading={saving}>Salvar faixa</Button></div>
      </div>
    </Panel>
  )
}

/* ---------- Campanha no fim da página ---------- */

function Campaign({ settings, onSaved }) {
  const toast = useToast()
  const fileRef = useRef(null)
  const [form, setForm] = useState(null)
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim(), 300)

  useEffect(() => {
    let ids = []
    try { ids = JSON.parse(settings.bottom_banner_product_ids || '[]') } catch { ids = [] }
    setForm({
      enabled: settings.bottom_banner_enabled === 'true',
      title: settings.bottom_banner_title || '',
      subtitle: settings.bottom_banner_subtitle || '',
      image: settings.bottom_banner_image || '',
      bg: settings.bottom_banner_bg_color || '#0c1020',
      button_text: settings.bottom_banner_button_text || '',
      button_link: settings.bottom_banner_button_link || '',
      product_ids: Array.isArray(ids) ? ids.map(Number).filter(Boolean) : [],
    })
    setFile(null)
  }, [settings])

  const picked = useResource(() => (form?.product_ids?.length
    ? api.get('/products/admin', { params: { status: 'all', limit: 100 } }).then(r => asList(r.data))
    : Promise.resolve([])), [form?.product_ids?.join(',')])
  const found = useResource(() => (q ? api.get('/products/admin', { params: { search: q, status: 'active', limit: 8 } }).then(r => asList(r.data)) : Promise.resolve([])), [q])

  const pickedList = useMemo(() => (form?.product_ids || []).map(id => (picked.data || []).find(x => x.id === id) || { id, name: `Produto ${id}` }), [form?.product_ids, picked.data])
  const localPreview = useMemo(() => (file ? URL.createObjectURL(file) : ''), [file])
  useEffect(() => () => { if (localPreview) URL.revokeObjectURL(localPreview) }, [localPreview])

  if (!form) return null
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e?.target ? e.target.value : e }))
  const preview = localPreview || (form.image ? getImageUrl(form.image, 'campanha') : '')

  const save = async () => {
    setSaving(true)
    try {
      const image = file ? await uploadImage(file, 'banners') : form.image
      await api.put('/settings', { settings: {
        bottom_banner_enabled: String(form.enabled),
        bottom_banner_title: form.title,
        bottom_banner_subtitle: form.subtitle,
        bottom_banner_image: image || '',
        bottom_banner_bg_color: /^#[0-9a-f]{6}$/i.test(form.bg) ? form.bg : '',
        bottom_banner_button_text: form.button_text,
        bottom_banner_button_link: form.button_link,
        bottom_banner_product_ids: JSON.stringify(form.product_ids.slice(0, 6)),
      } })
      toast.good('Campanha salva.')
      onSaved()
    } catch (err) { toast.error(err.message) } finally { setSaving(false) }
  }

  return (
    <Panel title="Campanha" subtitle="fim da página inicial">
      <div className={s.formGrid}>
        <Switch checked={form.enabled} onChange={set('enabled')} label="Mostrar a campanha" />
        <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', minHeight: 150, padding: 22, display: 'grid', alignContent: 'end', gap: 6, color: '#fff',
          background: preview ? `linear-gradient(90deg, rgba(0,0,0,.75), rgba(0,0,0,.2)), url(${preview}) center/cover` : form.bg, border: '1px solid var(--a-line)', opacity: form.enabled ? 1 : 0.45 }}>
          <strong style={{ fontSize: 'clamp(20px, 3vw, 30px)', fontStretch: '115%', lineHeight: 1.1 }}>{form.title || 'Promoção especial'}</strong>
          {form.subtitle && <span style={{ opacity: 0.85 }}>{form.subtitle}</span>}
          <span style={{ justifySelf: 'start', marginTop: 8, padding: '8px 14px', borderRadius: 999, background: '#f2f3f5', color: '#0c1020', fontWeight: 700, fontSize: 14 }}>{form.button_text || 'Ver ofertas'}</span>
        </div>
        <div className={s.formRow}>
          <TextField label="Título" value={form.title} onChange={set('title')} maxLength={120} placeholder="Promoção especial" />
          <TextField label="Texto" value={form.subtitle} onChange={set('subtitle')} maxLength={240} />
        </div>
        <div className={s.formRow}>
          <TextField label="Texto do botão" value={form.button_text} onChange={set('button_text')} placeholder="Ver ofertas" maxLength={40} />
          <TextField label="O botão leva para" value={form.button_link} onChange={set('button_link')} placeholder="#loja ou /produto/12" hint="#loja rola até a vitrine." />
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button icon={<FiImage />} onClick={() => fileRef.current?.click()}>{preview ? 'Trocar imagem de fundo' : 'Imagem de fundo'}</Button>
          {preview && <Button variant="ghost" onClick={() => { setFile(null); setForm(f => ({ ...f, image: '' })) }}>Tirar imagem</Button>}
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
            Cor de fundo
            <input type="color" value={/^#[0-9a-f]{6}$/i.test(form.bg) ? form.bg : '#0c1020'} onChange={set('bg')} style={{ width: 44, height: 36, border: 0, background: 'none', cursor: 'pointer' }} />
          </label>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f); e.target.value = '' }} />
        </div>

        <div>
          <p className={s.sectionTitle}>Produtos da campanha <span className={s.muted} style={{ fontWeight: 500 }}>(até 6)</span></p>
          <div className={s.chips} style={{ marginBottom: 10 }}>
            {pickedList.map(x => (
              <span key={x.id} className={s.chip} style={{ gap: 6, paddingRight: 2 }}>
                {x.name}
                <Button size="small" variant="ghost" icon={<FiX />} aria-label={`Tirar ${x.name}`} onClick={() => setForm(f => ({ ...f, product_ids: f.product_ids.filter(i => i !== x.id) }))} />
              </span>
            ))}
            {!pickedList.length && <span className={`${s.small} ${s.muted}`}>Nenhum escolhido.</span>}
          </div>
          {form.product_ids.length < 6 && (
            <>
              <SearchField value={search} onChange={setSearch} placeholder="Buscar produto para incluir" />
              {q && (
                <div className={s.list} style={{ marginTop: 6 }}>
                  {(found.data || []).filter(x => !form.product_ids.includes(x.id)).map(x => (
                    <button key={x.id} type="button" className={s.listItem} style={{ border: 0, background: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', color: 'inherit', font: 'inherit' }}
                      onClick={() => { setForm(f => ({ ...f, product_ids: [...f.product_ids, x.id].slice(0, 6) })); setSearch('') }}>
                      <img className={s.thumb} src={getImageUrl(x.image_url, x.name)} alt="" />
                      <span className={`${s.listMain} ${s.listTitle}`}>{x.name}</span>
                      <FiPlus aria-hidden="true" />
                    </button>
                  ))}
                  {found.data && !found.data.length && <span className={`${s.small} ${s.muted}`}>Nada encontrado.</span>}
                </div>
              )}
            </>
          )}
        </div>
        <div><Button variant="primary" onClick={save} loading={saving}>Salvar campanha</Button></div>
      </div>
    </Panel>
  )
}
