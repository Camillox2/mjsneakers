import { useRef, useState } from 'react'
import { Reorder, useDragControls } from 'framer-motion'
import { FiPlus, FiEdit2, FiTrash2, FiImage, FiMove } from 'react-icons/fi'
import api, { asList, uploadImage } from '../lib/api'
import { useResource } from '../lib/hooks'
import { date, toLocalInput } from '../lib/format'
import { getImageUrl } from '../../../utils/imageHelper'
import { PageHeader, Panel, Button, ErrorNote, Skeleton, EmptyState, Dialog, TextField, SelectField, Segmented, Switch, Badge, useConfirm, useToast } from '../ui'
import { ChartSketch } from '../art/Art'
import s from './sections.module.css'

const ANIMATIONS = [
  { value: 'fade', label: 'Surgir' }, { value: 'slide', label: 'Deslizar' }, { value: 'zoom', label: 'Aproximar' },
  { value: 'wave', label: 'Onda' }, { value: 'flip', label: 'Virar' },
]
const EFFECTS = [
  { value: 'none', label: 'Nenhum' }, { value: 'sparkle', label: 'Brilhos' }, { value: 'comet', label: 'Cometa' },
  { value: 'glow_pulse', label: 'Brilho pulsando' }, { value: 'neon_border', label: 'Borda neon' }, { value: 'light_sweep', label: 'Faixa de luz' },
]
const SPEEDS = [
  { value: 'ultra_slow', label: 'Bem devagar' }, { value: 'slow', label: 'Devagar' }, { value: 'fast', label: 'Rápido' }, { value: 'super_fast', label: 'Bem rápido' },
]

const EMPTY = { title: '', subtitle: '', link: '', media_type: 'image', image_url: '', image_url_mobile: '', video_url: '', animation_type: 'fade', effect_type: 'none', effect_speed: 'slow', active: true, active_from: '', active_until: '' }

function when(b) {
  const now = new Date()
  if (!b.active) return { label: 'Desligado', tone: 'neutral' }
  if (b.active_from && new Date(b.active_from) > now) return { label: `Entra em ${date(b.active_from)}`, tone: 'info' }
  if (b.active_until && new Date(b.active_until) < now) return { label: 'Encerrado', tone: 'critical' }
  return { label: 'No ar', tone: 'good' }
}

const payloadOf = (b, sort) => ({
  title: b.title || '', subtitle: b.subtitle || '', link: b.link || '', media_type: b.media_type || 'image',
  image_url: b.image_url || null, image_url_mobile: b.image_url_mobile || null, video_url: b.video_url || null, animation_type: b.animation_type || 'fade',
  effect_type: b.effect_type || 'none', effect_speed: b.effect_speed || 'slow', sort_order: sort ?? b.sort_order ?? 0,
  active: !!b.active, active_from: b.active_from || null, active_until: b.active_until || null,
})

function BannerRow({ b, onEdit, onRemove, onToggle }) {
  const drag = useDragControls()
  const st = when(b)
  return (
    <Reorder.Item value={b} dragListener={false} dragControls={drag} className={s.bannerRow}>
      <button type="button" className={s.dragHandle} onPointerDown={e => drag.start(e)} aria-label="Arraste para mudar a ordem">
        <FiMove aria-hidden="true" />
      </button>
      <img className={s.bannerThumb} src={b.media_type === 'video' ? getImageUrl(null, 'video') : getImageUrl(b.image_url, b.title || 'Banner')} alt="" loading="lazy" />
      <button type="button" className={s.bannerMain} onClick={() => onEdit(b)}>
        <span className={s.listTitle}>{b.title || 'Sem título'}</span>
        <span className={s.listSub}>{b.subtitle || (b.link ? `Leva para ${b.link}` : 'Sem link')}</span>
        <Badge tone={st.tone}>{st.label}</Badge>
      </button>
      <SwitchMini checked={!!b.active} onChange={() => onToggle(b)} label={`${b.active ? 'Desligar' : 'Ligar'} ${b.title || 'banner'}`} />
      <span className={s.hideSm}><Button size="small" variant="ghost" icon={<FiEdit2 />} aria-label="Editar banner" onClick={() => onEdit(b)} /></span>
      <span className={s.hideSm}><Button size="small" variant="ghost" icon={<FiTrash2 />} aria-label="Apagar banner" onClick={() => onRemove(b)} /></span>
    </Reorder.Item>
  )
}

const SwitchMini = ({ checked, onChange, label }) => <Switch checked={checked} onChange={onChange} label={label} hideLabel />

export default function Banners() {
  const toast = useToast()
  const confirm = useConfirm()
  const fileRef = useRef(null)
  const mobileRef = useRef(null)
  const list = useResource(() => api.get('/banners/all').then(r => asList(r.data).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))), [])
  const [edit, setEdit] = useState(null)
  const [saving, setSaving] = useState(false)
  const [order, setOrder] = useState(null)

  const rows = order || list.data || []

  const saveOrder = async () => {
    try {
      await Promise.all(rows.map((b, i) => (Number(b.sort_order) !== i ? api.put(`/banners/${b.id}`, payloadOf(b, i)) : null)))
      toast.good('Ordem dos banners salva.')
      setOrder(null)
      list.reload()
    } catch (err) { toast.error(err.message) }
  }

  const toggle = async (b) => {
    try {
      await api.put(`/banners/${b.id}`, payloadOf({ ...b, active: !b.active }))
      list.mutate(d => d.map(x => (x.id === b.id ? { ...x, active: !b.active } : x)))
      setOrder(o => o && o.map(x => (x.id === b.id ? { ...x, active: !b.active } : x)))
    } catch (err) { toast.error(err.message) }
  }

  const remove = async (b) => {
    if (!(await confirm({ title: 'Apagar este banner?', message: b.title || undefined, confirmLabel: 'Apagar', tone: 'danger' }))) return
    try { await api.delete(`/banners/${b.id}`); toast.good('Banner apagado.'); setOrder(null); list.reload() } catch (err) { toast.error(err.message) }
  }

  const open = (b) => setEdit(b ? { ...EMPTY, ...b, active: !!b.active, active_from: toLocalInput(b.active_from), active_until: toLocalInput(b.active_until) } : { ...EMPTY })
  const set = (k) => (e) => setEdit(x => ({ ...x, [k]: e?.target ? e.target.value : e }))

  const save = async () => {
    if (edit.media_type === 'image' && !edit.image_url && !edit.file) { toast.error('Escolha a imagem do banner.'); return }
    if (edit.media_type === 'video' && !/^https:\/\//.test(edit.video_url || '')) { toast.error('Cole o endereço do vídeo começando com https://'); return }
    if (edit.active_from && edit.active_until && edit.active_until <= edit.active_from) { toast.error('O fim tem que vir depois do início.'); return }
    setSaving(true)
    try {
      const image = edit.file ? await uploadImage(edit.file, 'banners') : edit.image_url
      const imageMobile = edit.fileMobile ? await uploadImage(edit.fileMobile, 'banners') : edit.image_url_mobile
      const payload = payloadOf({ ...edit, image_url: image, image_url_mobile: imageMobile }, edit.id ? edit.sort_order : rows.length)
      if (edit.id) await api.put(`/banners/${edit.id}`, payload)
      else await api.post('/banners', payload)
      toast.good('Banner salvo.')
      setEdit(null); setOrder(null)
      list.reload()
    } catch (err) { toast.error(err.message) } finally { setSaving(false) }
  }

  const preview = edit?.preview || (edit?.image_url ? getImageUrl(edit.image_url, 'banner') : '')

  return (
    <div>
      <PageHeader
        title="Banners"
        description="O carrossel da página inicial. Arraste para mudar a ordem."
        actions={<Button variant="primary" icon={<FiPlus />} onClick={() => open(null)}>Novo banner</Button>}
      />
      <ErrorNote error={list.error} onRetry={list.reload} />
      {order && (
        <div className={s.bulk}>
          <strong>A ordem mudou.</strong>
          <span style={{ flex: 1 }} />
          <Button size="small" variant="ghost" onClick={() => setOrder(null)}>Desfazer</Button>
          <Button size="small" variant="primary" onClick={saveOrder}>Salvar ordem</Button>
        </div>
      )}
      <Panel flush>
        {list.loading && !list.data ? <div style={{ padding: 18 }}><Skeleton lines={4} height={50} /></div> : rows.length ? (
          <Reorder.Group axis="y" values={rows} onReorder={setOrder} style={{ margin: 0, padding: '0 16px' }}>
            {rows.map(b => <BannerRow key={b.id} b={b} onEdit={open} onRemove={remove} onToggle={toggle} />)}
          </Reorder.Group>
        ) : (
          <EmptyState art={<ChartSketch />} title="Nenhum banner" action={<Button variant="primary" icon={<FiPlus />} onClick={() => open(null)}>Criar banner</Button>}>
            Banners aparecem em sequência no topo da vitrine. Use imagem larga (1920 x 800).
          </EmptyState>
        )}
      </Panel>

      <Dialog
        open={!!edit}
        onClose={() => setEdit(null)}
        size="l"
        title={edit?.id ? 'Editar banner' : 'Novo banner'}
        footer={<>
          {edit?.id && <Button variant="danger" icon={<FiTrash2 />} onClick={() => { const b = edit; setEdit(null); remove(b) }}>Apagar</Button>}
          <span style={{ flex: 1 }} />
          <Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button>
          <Button variant="primary" onClick={save} loading={saving}>Salvar banner</Button>
        </>}
      >
        {edit && (
          <div className={s.formGrid}>
            <div style={{ position: 'relative', aspectRatio: '12 / 5', borderRadius: 12, overflow: 'hidden', background: 'var(--a-sunken)', border: '1px solid var(--a-line)' }}>
              {edit.media_type === 'image' && preview
                ? <img src={preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--a-muted)' }}>{edit.media_type === 'video' ? 'O vídeo aparece na loja' : 'Prévia do banner'}</div>}
              {(edit.title || edit.subtitle) && (
                <div style={{ position: 'absolute', inset: 'auto 0 0 0', padding: '28px 18px 16px', background: 'linear-gradient(transparent, rgba(0,0,0,.72))', color: '#fff' }}>
                  <div style={{ fontWeight: 800, fontSize: 'clamp(18px, 3vw, 28px)', fontStretch: '112%' }}>{edit.title}</div>
                  <div style={{ opacity: 0.85 }}>{edit.subtitle}</div>
                </div>
              )}
            </div>
            <Segmented label="Tipo" value={edit.media_type} onChange={set('media_type')} options={[{ value: 'image', label: 'Imagem' }, { value: 'video', label: 'Vídeo' }]} />
            {edit.media_type === 'image' ? (
              <>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <Button icon={<FiImage />} onClick={() => fileRef.current?.click()}>{preview ? 'Trocar imagem' : 'Escolher imagem'}</Button>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) setEdit(x => ({ ...x, file: f, preview: URL.createObjectURL(f) })); e.target.value = '' }} />
                <Button variant="ghost" icon={<FiImage />} onClick={() => mobileRef.current?.click()}>{edit.previewMobile || edit.image_url_mobile ? 'Trocar a do celular' : 'Imagem só para celular'}</Button>
                <input ref={mobileRef} type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) setEdit(x => ({ ...x, fileMobile: f, previewMobile: URL.createObjectURL(f) })); e.target.value = '' }} />
                {(edit.previewMobile || edit.image_url_mobile) && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <img src={edit.previewMobile || getImageUrl(edit.image_url_mobile, 'celular')} alt="Prévia no celular" style={{ width: 44, height: 56, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--a-line)' }} />
                    <Button size="small" variant="ghost" onClick={() => setEdit(x => ({ ...x, fileMobile: null, previewMobile: '', image_url_mobile: '' }))}>Tirar</Button>
                  </span>
                )}
              </div>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--a-muted)' }}>No celular, uma imagem em pé (4:5, ex.: 1080 x 1350) fica melhor que a larga cortada. Sem ela, o celular usa a larga.</p>
              </>
            ) : (
              <TextField label="Endereço do vídeo" value={edit.video_url || ''} onChange={set('video_url')} placeholder="https://" inputMode="url" />
            )}
            <div className={s.formRow}>
              <TextField label="Título" value={edit.title || ''} onChange={set('title')} maxLength={255} />
              <TextField label="Subtítulo" value={edit.subtitle || ''} onChange={set('subtitle')} maxLength={500} />
            </div>
            <TextField label="Ao tocar, leva para" value={edit.link || ''} onChange={set('link')} placeholder="/produto/12 ou https://" hint="Vazio: o banner não é clicável." />
            <div className={s.formRow}>
              <SelectField label="Entrada" value={edit.animation_type} onChange={set('animation_type')} options={ANIMATIONS} />
              <SelectField label="Efeito de luz" value={edit.effect_type} onChange={set('effect_type')} options={EFFECTS} />
              <SelectField label="Velocidade do efeito" value={edit.effect_speed} onChange={set('effect_speed')} options={SPEEDS} />
            </div>
            <Switch checked={edit.active} onChange={set('active')} label="Banner ligado" />
            <div className={s.formRow}>
              <TextField label="Entra no ar em" type="datetime-local" value={edit.active_from} onChange={set('active_from')} hint="Vazio: já entra." />
              <TextField label="Sai do ar em" type="datetime-local" value={edit.active_until} onChange={set('active_until')} hint="Vazio: fica até desligar." />
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}
