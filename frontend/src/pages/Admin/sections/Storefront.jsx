import { useEffect, useMemo, useRef, useState } from 'react'
import { Reorder, useDragControls } from 'framer-motion'
import { FiPlus, FiTrash2, FiMove, FiImage, FiX } from 'react-icons/fi'
import api, { asList, uploadImage } from '../lib/api'
import { useResource, useDebounced, useUnsavedGuard } from '../lib/hooks'
import { getImageUrl } from '../../../utils/imageHelper'
import { PageHeader, Panel, Button, ErrorNote, Skeleton, TextField, SelectField, Switch, SearchField, useToast } from '../ui'
import { imageProblem, validLink, IMAGE_ACCEPT } from './formInput'
import s from './sections.module.css'
import sf from './Storefront.module.css'

const SPEEDS = [
  { value: '35s', label: 'Devagar' },
  { value: '20s', label: 'Normal' },
  { value: '12s', label: 'Rápida' },
]

// Cor da campanha quando nenhuma foi escolhida (o campo de cor precisa de uma).
const DEFAULT_BG = '#0c1020'
const HEX = /^#[0-9a-f]{6}$/i

// Cada painel lê as configurações uma vez e depois cuida do próprio estado:
// salvar um não recarrega nem apaga o que está sendo editado no outro.
export default function Storefront() {
  const settings = useResource(() => api.get('/settings/admin').then(r => r.data || {}), [])
  return (
    <div>
      <PageHeader title="Faixa e campanha" description="A faixa corrida no topo da loja e o bloco de campanha no fim da página inicial." />
      <ErrorNote error={settings.error} onRetry={settings.reload} />
      {settings.loading && !settings.data ? <Panel><Skeleton lines={6} height={28} /></Panel> : settings.data && (
        <div className={s.grid}>
          <Ticker settings={settings.data} />
          <Campaign settings={settings.data} />
        </div>
      )}
    </div>
  )
}

function SaveBar({ dirty, children }) {
  return (
    <div className={sf.saveBar}>
      {children}
      {dirty && <span className={sf.unsaved} role="status">Alterações sem salvar</span>}
    </div>
  )
}

/* ---------- Faixa corrida ---------- */

function TickerRow({ t, index, total, onChange, onRemove, onMove }) {
  const drag = useDragControls()
  const onKeyDown = (e) => {
    if (e.key === 'ArrowUp' && index > 0) { e.preventDefault(); onMove(t, -1) }
    if (e.key === 'ArrowDown' && index < total - 1) { e.preventDefault(); onMove(t, 1) }
  }
  return (
    <Reorder.Item value={t} dragListener={false} dragControls={drag} className={sf.row}>
      <button type="button" className={s.dragHandle} onPointerDown={e => drag.start(e)} onKeyDown={onKeyDown} aria-label={`Mudar a posição do aviso ${index + 1}: arraste ou use as setas`}>
        <FiMove aria-hidden="true" />
      </button>
      <input
        className={sf.input}
        value={t.text}
        onChange={e => onChange({ ...t, text: e.target.value })}
        maxLength={300}
        aria-label={`Texto do aviso ${index + 1}`}
        placeholder="Ex.: Frete grátis acima de R$ 499"
        // aviso novo já abre com o cursor no campo
        autoFocus={!t.id && !t.text}
      />
      <Switch checked={t.active} onChange={v => onChange({ ...t, active: v })} label={`Mostrar o aviso ${index + 1}`} hideLabel />
      <Button size="small" variant="ghost" icon={<FiTrash2 />} aria-label={`Apagar o aviso ${index + 1}`} onClick={() => onRemove(t)} />
    </Reorder.Item>
  )
}

const tickerCfgOf = (st) => ({
  enabled: st.ticker_enabled !== 'false',
  speed: st.ticker_speed || '20s',
  double: st.ticker_double === 'true',
})

function Ticker({ settings }) {
  const toast = useToast()
  const tickers = useResource(() => api.get('/tickers/all').then(r => asList(r.data)), [])
  const [items, setItems] = useState(null)
  const [removed, setRemoved] = useState([])
  const [cfg, setCfg] = useState(() => tickerCfgOf(settings))
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  useUnsavedGuard(dirty)

  useEffect(() => {
    if (tickers.data) setItems(tickers.data.map(t => ({ ...t, key: `t${t.id}` })))
  }, [tickers.data])

  const touch = (fn) => (...args) => { fn(...args); setDirty(true) }
  const add = touch(() => setItems(list => [...(list || []), { key: `n${Date.now()}`, text: '', active: true }]))
  const change = touch((t) => setItems(list => list.map(x => (x.key === t.key ? t : x))))
  const remove = touch((t) => { setItems(list => list.filter(x => x.key !== t.key)); if (t.id) setRemoved(r => [...r, t.id]) })
  const reorder = touch(setItems)
  const move = touch((t, dir) => setItems(list => {
    const next = [...list]
    const i = next.findIndex(x => x.key === t.key)
    const j = i + dir
    if (i < 0 || j < 0 || j >= next.length) return list
    ;[next[i], next[j]] = [next[j], next[i]]
    return next
  }))
  const setOption = touch((patch) => setCfg(c => ({ ...c, ...patch })))

  const save = async () => {
    if (saving) return
    const list = items || []
    // aviso que já existia e ficou sem texto sai de vez (antes o texto velho voltava)
    const gone = [...removed, ...list.filter(t => t.id && !t.text.trim()).map(t => t.id)]
    const valid = list.filter(t => t.text.trim())
    setSaving(true)
    try {
      // já apagado numa tentativa anterior não é erro
      await Promise.all(gone.map(id => api.delete(`/tickers/${id}`).catch(err => { if (err.status !== 404) throw err })))
      setRemoved([])
      // um por vez: o aviso novo guarda o id assim que é criado, e tentar de novo não duplica
      for (const [i, t] of valid.entries()) {
        const body = { text: t.text.trim(), active: !!t.active, sort_order: i }
        if (t.id) await api.put(`/tickers/${t.id}`, body)
        else {
          const { data } = await api.post('/tickers', body)
          if (data?.id) setItems(cur => cur.map(x => (x.key === t.key ? { ...x, id: data.id } : x)))
        }
      }
      await api.put('/settings', { settings: { ticker_enabled: String(cfg.enabled), ticker_speed: cfg.speed, ticker_double: String(cfg.double) } })
      toast.good('Faixa salva. A loja mostra a nova versão em alguns minutos.')
      setDirty(false)
      tickers.reload()
    } catch (err) { toast.error(err.message) } finally { setSaving(false) }
  }

  const live = (items || []).filter(t => t.active && t.text.trim())
  const secs = parseFloat(cfg.speed) || 20

  return (
    <Panel title="Faixa de avisos" subtitle="topo da loja">
      <div className={s.formGrid}>
        <Switch checked={cfg.enabled} onChange={v => setOption({ enabled: v })} label="Mostrar a faixa" description="Desligada, some da loja mas os avisos ficam guardados." />

        <div aria-hidden="true" className={`${sf.ticker} ${cfg.enabled ? '' : sf.off}`}>
          {[false, ...(cfg.double ? [true] : [])].map(rev => (
            <div key={String(rev)} className={`${sf.tickerLine} ${rev ? sf.reverse : ''}`}>
              <div className={`${sf.tickerTrack} ${live.length ? '' : sf.still}`} style={{ animationDuration: `${secs}s` }}>
                {(live.length ? [...live, ...live, ...live] : [{ key: 'x', text: 'Escreva um aviso abaixo' }]).map((t, i) => <span key={`${t.key}-${i}`}>{t.text}</span>)}
              </div>
            </div>
          ))}
        </div>

        <ErrorNote error={tickers.error} onRetry={tickers.reload} />
        {!items ? (!tickers.error && <Skeleton lines={3} height={40} />) : items.length ? (
          <Reorder.Group axis="y" values={items} onReorder={reorder} className={sf.rows}>
            {items.map((t, i) => <TickerRow key={t.key} t={t} index={i} total={items.length} onChange={change} onRemove={remove} onMove={move} />)}
          </Reorder.Group>
        ) : (
          <p className={sf.note}>Nenhum aviso ainda. Ex.: frete grátis, parcelamento, drop novo.</p>
        )}
        <div><Button size="small" icon={<FiPlus />} onClick={add} disabled={!items}>Novo aviso</Button></div>

        <div className={s.formRow}>
          <SelectField label="Velocidade" value={cfg.speed} onChange={e => setOption({ speed: e.target.value })} options={SPEEDS.some(o => o.value === cfg.speed) ? SPEEDS : [...SPEEDS, { value: cfg.speed, label: `Personalizada (${cfg.speed})` }]} />
          <div className={sf.alignEnd}>
            <Switch checked={cfg.double} onChange={v => setOption({ double: v })} label="Duas linhas" description="A segunda corre no sentido contrário." />
          </div>
        </div>
        <SaveBar dirty={dirty}>
          <Button variant="primary" onClick={save} loading={saving} disabled={!items}>Salvar faixa</Button>
        </SaveBar>
      </div>
    </Panel>
  )
}

/* ---------- Campanha no fim da página ---------- */

function campaignOf(st) {
  let ids = []
  try { ids = JSON.parse(st.bottom_banner_product_ids || '[]') } catch { ids = [] }
  return {
    enabled: st.bottom_banner_enabled === 'true',
    title: st.bottom_banner_title || '',
    subtitle: st.bottom_banner_subtitle || '',
    image: st.bottom_banner_image || '',
    bg: HEX.test(st.bottom_banner_bg_color || '') ? st.bottom_banner_bg_color : '',
    button_text: st.bottom_banner_button_text || '',
    button_link: st.bottom_banner_button_link || '',
    product_ids: Array.isArray(ids) ? ids.map(Number).filter(Boolean) : [],
  }
}

function Campaign({ settings }) {
  const toast = useToast()
  const fileRef = useRef(null)
  const [form, setForm] = useState(() => campaignOf(settings))
  const [file, setFile] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [linkError, setLinkError] = useState('')
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim(), 300)
  // nome e situação de cada produto escolhido (null: não existe mais)
  const [known, setKnown] = useState({})
  useUnsavedGuard(dirty)

  const firstIds = useRef(form.product_ids)
  useEffect(() => {
    let live = true
    const ids = firstIds.current
    Promise.all(ids.map(id => api.get(`/products/admin/${id}`).then(r => r.data).catch(() => null)))
      .then(list => { if (live) setKnown(k => ({ ...k, ...Object.fromEntries(ids.map((id, i) => [id, list[i]])) })) })
    return () => { live = false }
  }, [])

  const found = useResource(() => (q ? api.get('/products/admin', { params: { search: q, status: 'active', limit: 8 } }).then(r => asList(r.data)) : Promise.resolve([])), [q])

  const localPreview = useMemo(() => (file ? URL.createObjectURL(file) : ''), [file])
  useEffect(() => () => { if (localPreview) URL.revokeObjectURL(localPreview) }, [localPreview])

  const update = (patch) => { setForm(f => ({ ...f, ...patch })); setDirty(true) }
  const set = (k) => (e) => update({ [k]: e?.target ? e.target.value : e })
  const preview = localPreview || (form.image ? getImageUrl(form.image, 'campanha') : '')

  const pick = (f) => {
    if (!f) return
    const problem = imageProblem(f)
    if (problem) { toast.error(problem); return }
    setFile(f); setDirty(true)
  }

  const addProduct = (x) => {
    setKnown(k => ({ ...k, [x.id]: x }))
    setForm(f => ({ ...f, product_ids: [...f.product_ids, x.id].slice(0, 6) }))
    setDirty(true)
    setSearch('')
  }

  const save = async () => {
    if (saving) return
    if (!validLink(form.button_link)) { setLinkError('Comece com # (parte da página), / (página da loja) ou https:// (outro site).'); return }
    setSaving(true)
    try {
      let image = form.image
      if (file) {
        image = await uploadImage(file, 'banners')
        setForm(f => ({ ...f, image }))
        setFile(null)
      }
      await api.put('/settings', { settings: {
        bottom_banner_enabled: String(form.enabled),
        bottom_banner_title: form.title,
        bottom_banner_subtitle: form.subtitle,
        bottom_banner_image: image || '',
        bottom_banner_bg_color: HEX.test(form.bg) ? form.bg : '',
        bottom_banner_button_text: form.button_text,
        bottom_banner_button_link: form.button_link.trim(),
        bottom_banner_product_ids: JSON.stringify(form.product_ids.slice(0, 6)),
      } })
      toast.good('Campanha salva.')
      setDirty(false)
    } catch (err) { toast.error(err.message) } finally { setSaving(false) }
  }

  const bg = form.bg || DEFAULT_BG
  const pickedList = form.product_ids.map(id => ({ id, product: known[id] }))
  const nameOf = ({ id, product }) => (product === null ? `Produto ${id} (não existe mais)` : product ? `${product.name}${product.active === false ? ' (fora da loja)' : ''}` : `Produto ${id}`)

  return (
    <Panel title="Campanha" subtitle="fim da página inicial">
      <div className={s.formGrid}>
        <Switch checked={form.enabled} onChange={set('enabled')} label="Mostrar a campanha" />
        <div
          className={`${sf.campaign} ${form.enabled ? '' : sf.off}`}
          style={{ background: preview ? `linear-gradient(90deg, rgba(0,0,0,.75), rgba(0,0,0,.2)), url(${JSON.stringify(preview)}) center/cover` : bg }}
        >
          <strong className={sf.campaignTitle}>{form.title || 'Promoção especial'}</strong>
          {form.subtitle && <span className={sf.campaignSub}>{form.subtitle}</span>}
          <span className={sf.campaignBtn}>{form.button_text || 'Ver ofertas'}</span>
        </div>
        <div className={s.formRow}>
          <TextField label="Título" value={form.title} onChange={set('title')} maxLength={120} placeholder="Promoção especial" />
          <TextField label="Texto" value={form.subtitle} onChange={set('subtitle')} maxLength={240} />
        </div>
        <div className={s.formRow}>
          <TextField label="Texto do botão" value={form.button_text} onChange={set('button_text')} placeholder="Ver ofertas" maxLength={40} />
          <TextField
            label="O botão leva para"
            value={form.button_link}
            onChange={e => { setLinkError(''); set('button_link')(e) }}
            placeholder="#loja ou /produto/12"
            inputMode="url"
            maxLength={500}
            error={linkError || undefined}
            hint="#loja rola até a vitrine. Vazio: também vai para a vitrine."
          />
        </div>
        <div className={sf.saveBar}>
          <Button icon={<FiImage />} onClick={() => fileRef.current?.click()}>{preview ? 'Trocar imagem de fundo' : 'Imagem de fundo'}</Button>
          {preview && <Button variant="ghost" icon={<FiX />} onClick={() => { setFile(null); update({ image: '' }) }}>Tirar imagem</Button>}
          <label className={sf.color}>
            Cor de fundo
            <input type="color" className={sf.colorInput} value={bg} onChange={set('bg')} />
          </label>
          <input ref={fileRef} type="file" accept={IMAGE_ACCEPT} hidden onChange={e => { pick(e.target.files?.[0]); e.target.value = '' }} />
        </div>
        <p className={sf.note}>A cor aparece quando não há imagem. Imagem larga, JPG, PNG ou WebP de até 10 MB.</p>

        <div>
          <p className={s.sectionTitle}>Produtos da campanha <span className={s.muted}>(até 6)</span></p>
          <div className={`${s.chips} ${sf.chips}`}>
            {pickedList.map(x => (
              <span key={x.id} className={`${s.chip} ${sf.chip}`}>
                {nameOf(x)}
                <Button size="small" variant="ghost" icon={<FiX />} aria-label={`Tirar ${nameOf(x)} da campanha`} onClick={() => update({ product_ids: form.product_ids.filter(i => i !== x.id) })} />
              </span>
            ))}
            {!pickedList.length && <span className={`${s.small} ${s.muted}`}>Nenhum escolhido.</span>}
          </div>
          {form.product_ids.length < 6 && (
            <>
              <SearchField value={search} onChange={setSearch} placeholder="Buscar produto para incluir" />
              {q && (
                <div className={`${s.list} ${sf.results}`}>
                  {(found.data || []).filter(x => !form.product_ids.includes(x.id)).map(x => (
                    <button key={x.id} type="button" className={`${s.listItem} ${sf.result}`} onClick={() => addProduct(x)} aria-label={`Incluir ${x.name} na campanha`}>
                      <img className={s.thumb} src={getImageUrl(x.image_url, x.name)} alt="" />
                      <span className={`${s.listMain} ${s.listTitle}`}>{x.name}</span>
                      <FiPlus aria-hidden="true" />
                    </button>
                  ))}
                  {found.error && <ErrorNote error={found.error} onRetry={found.reload} />}
                  {found.data && !found.data.length && <span className={`${s.small} ${s.muted}`}>Nada encontrado.</span>}
                </div>
              )}
            </>
          )}
        </div>
        <SaveBar dirty={dirty}>
          <Button variant="primary" onClick={save} loading={saving}>Salvar campanha</Button>
        </SaveBar>
      </div>
    </Panel>
  )
}
