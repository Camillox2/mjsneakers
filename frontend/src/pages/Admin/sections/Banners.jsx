import { useRef, useState } from 'react'
import { Reorder, useDragControls } from 'framer-motion'
import { FiPlus, FiEdit2, FiTrash2, FiImage, FiMove, FiX } from 'react-icons/fi'
import api, { asList, uploadImage } from '../lib/api'
import { useResource } from '../lib/hooks'
import { date, toLocalInput } from '../lib/format'
import { getImageUrl } from '../../../utils/imageHelper'
import { PageHeader, Panel, Button, ErrorNote, Skeleton, EmptyState, Dialog, TextField, SelectField, Segmented, Switch, Badge, useConfirm, useToast } from '../ui'
import { ChartSketch } from '../art/Art'
import { imageProblem, validLink, IMAGE_ACCEPT } from './formInput'
import s from './sections.module.css'
import bn from './Banners.module.css'

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

// Só para o formulário: as datas saem do campo datetime-local (hora local).
const payloadOf = (b, sort) => ({
  title: b.title || '', subtitle: b.subtitle || '', link: (b.link || '').trim(), media_type: b.media_type || 'image',
  image_url: b.image_url || null, image_url_mobile: b.image_url_mobile || null, video_url: b.video_url || null, animation_type: b.animation_type || 'fade',
  effect_type: b.effect_type || 'none', effect_speed: b.effect_speed || 'slow', sort_order: sort ?? b.sort_order ?? 0,
  active: !!b.active, active_from: b.active_from || null, active_until: b.active_until || null,
})

function BannerRow({ b, index, total, busy, onEdit, onRemove, onToggle, onMove }) {
  const drag = useDragControls()
  const st = when(b)
  const name = b.title || 'banner sem título'
  // setas do teclado fazem o mesmo que arrastar
  const onKeyDown = (e) => {
    if (e.key === 'ArrowUp' && index > 0) { e.preventDefault(); onMove(b, -1) }
    if (e.key === 'ArrowDown' && index < total - 1) { e.preventDefault(); onMove(b, 1) }
  }
  return (
    <Reorder.Item value={b} dragListener={false} dragControls={drag} className={s.bannerRow}>
      <button type="button" className={s.dragHandle} onPointerDown={e => drag.start(e)} onKeyDown={onKeyDown} aria-label={`Mudar a posição de ${name}: arraste ou use as setas`}>
        <FiMove aria-hidden="true" />
      </button>
      <img className={s.bannerThumb} src={b.media_type === 'video' ? getImageUrl(null, 'video') : getImageUrl(b.image_url, b.title || 'Banner')} alt="" loading="lazy" />
      <button type="button" className={s.bannerMain} onClick={() => onEdit(b)} aria-label={`Editar ${name}`}>
        <span className={s.listTitle}>{b.title || 'Sem título'}</span>
        <span className={s.listSub}>{b.subtitle || (b.link ? `Leva para ${b.link}` : 'Sem link')}</span>
        <Badge tone={st.tone}>{st.label}</Badge>
      </button>
      <Switch checked={!!b.active} disabled={busy} onChange={() => onToggle(b)} label={`${b.active ? 'Desligar' : 'Ligar'} ${name}`} hideLabel />
      <span className={s.hideSm}><Button size="small" variant="ghost" icon={<FiEdit2 />} aria-label={`Editar ${name}`} onClick={() => onEdit(b)} /></span>
      <span className={s.hideSm}><Button size="small" variant="ghost" icon={<FiTrash2 />} aria-label={`Apagar ${name}`} onClick={() => onRemove(b)} /></span>
    </Reorder.Item>
  )
}

export default function Banners() {
  const toast = useToast()
  const confirm = useConfirm()
  const fileRef = useRef(null)
  const mobileRef = useRef(null)
  const list = useResource(() => api.get('/banners/all').then(r => asList(r.data).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))), [])
  const [edit, setEdit] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [linkError, setLinkError] = useState('')
  const [saving, setSaving] = useState(false)
  const [order, setOrder] = useState(null)
  const [savingOrder, setSavingOrder] = useState(false)
  const [switching, setSwitching] = useState(null)

  const rows = order || list.data || []

  const move = (b, dir) => {
    const next = [...rows]
    const i = next.findIndex(x => x.id === b.id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    setOrder(next)
  }

  // Só a posição vai para o servidor. Mandar o banner inteiro de volta
  // regravava as datas lidas do banco (em UTC) e empurrava a janela do banner.
  const saveOrder = async () => {
    if (savingOrder) return
    setSavingOrder(true)
    try {
      await Promise.all(rows.map((b, i) => (Number(b.sort_order) !== i ? api.put(`/banners/${b.id}`, { sort_order: i }) : null)))
      toast.good('Ordem dos banners salva.')
      setOrder(null)
      list.reload()
    } catch (err) { toast.error(err.message) } finally { setSavingOrder(false) }
  }

  const toggle = async (b) => {
    if (switching) return
    setSwitching(b.id)
    try {
      await api.put(`/banners/${b.id}`, { active: !b.active })
      list.mutate(d => d.map(x => (x.id === b.id ? { ...x, active: !b.active } : x)))
      setOrder(o => o && o.map(x => (x.id === b.id ? { ...x, active: !b.active } : x)))
      toast.good(b.active ? 'Banner desligado. Ele sai da loja.' : 'Banner ligado.')
    } catch (err) { toast.error(err.message) } finally { setSwitching(null) }
  }

  const remove = async (b) => {
    if (!(await confirm({ title: 'Apagar este banner?', message: b.title ? `"${b.title}" some da loja e daqui. Para só tirar do ar, desligue.` : 'Ele some da loja e daqui. Para só tirar do ar, desligue.', confirmLabel: 'Apagar', tone: 'danger' }))) return false
    try { await api.delete(`/banners/${b.id}`); toast.good('Banner apagado.'); setOrder(null); list.reload(); return true } catch (err) { toast.error(err.message); return false }
  }

  const open = (b) => {
    setDirty(false); setLinkError('')
    setEdit(b ? { ...EMPTY, ...b, active: !!b.active, active_from: toLocalInput(b.active_from), active_until: toLocalInput(b.active_until) } : { ...EMPTY })
  }
  const close = () => setEdit(null)
  const canClose = async () => !dirty || confirm({ title: 'Descartar as alterações?', message: 'O que você mudou neste banner ainda não foi salvo.', confirmLabel: 'Descartar', cancelLabel: 'Continuar editando', tone: 'danger' })
  const set = (k) => (e) => { setEdit(x => ({ ...x, [k]: e?.target ? e.target.value : e })); setDirty(true) }

  const pick = (file, field) => {
    if (!file) return
    const problem = imageProblem(file)
    if (problem) { toast.error(problem); return }
    const preview = URL.createObjectURL(file)
    setEdit(x => (field === 'mobile' ? { ...x, fileMobile: file, previewMobile: preview } : { ...x, file, preview }))
    setDirty(true)
  }

  const save = async () => {
    if (saving) return
    if (edit.media_type === 'image' && !edit.image_url && !edit.file) { toast.error('Escolha a imagem do banner.'); return }
    if (edit.media_type === 'video' && !/^https:\/\/\S+$/.test(edit.video_url || '')) { toast.error('Cole o endereço do vídeo começando com https://'); return }
    if (!validLink(edit.link)) { setLinkError('Comece com / para uma página da loja (ex.: /produto/12) ou com https:// para outro site.'); return }
    if (edit.active_from && edit.active_until && edit.active_until <= edit.active_from) { toast.error('A saída do ar tem que vir depois da entrada.'); return }
    setSaving(true)
    try {
      // cada imagem sobe uma vez só: se salvar falhar, a próxima tentativa aproveita
      let image = edit.image_url
      let imageMobile = edit.image_url_mobile
      if (edit.file) { image = await uploadImage(edit.file, 'banners'); setEdit(x => ({ ...x, file: null, image_url: image })) }
      if (edit.fileMobile) { imageMobile = await uploadImage(edit.fileMobile, 'banners'); setEdit(x => ({ ...x, fileMobile: null, image_url_mobile: imageMobile })) }
      const payload = payloadOf({ ...edit, image_url: image, image_url_mobile: imageMobile }, edit.id ? edit.sort_order : rows.length)
      if (edit.id) await api.put(`/banners/${edit.id}`, payload)
      else await api.post('/banners', payload)
      toast.good('Banner salvo.')
      setDirty(false); setEdit(null); setOrder(null)
      list.reload()
    } catch (err) { toast.error(err.message) } finally { setSaving(false) }
  }

  const preview = edit?.preview || (edit?.image_url ? getImageUrl(edit.image_url, 'banner') : '')
  const mobilePreview = edit?.previewMobile || (edit?.image_url_mobile ? getImageUrl(edit.image_url_mobile, 'celular') : '')

  return (
    <div>
      <PageHeader
        title="Banners"
        description="O carrossel da página inicial. Arraste pela alça (ou use as setas do teclado) para mudar a ordem."
        actions={<Button variant="primary" icon={<FiPlus />} onClick={() => open(null)}>Novo banner</Button>}
      />
      <ErrorNote error={list.error} onRetry={list.reload} />
      {order && (
        <div className={s.bulk} role="region" aria-label="Ordem dos banners">
          <strong>A ordem mudou.</strong>
          <span className={bn.spacer} />
          <Button size="small" variant="ghost" disabled={savingOrder} onClick={() => setOrder(null)}>Desfazer</Button>
          <Button size="small" variant="primary" loading={savingOrder} onClick={saveOrder}>Salvar ordem</Button>
        </div>
      )}
      <Panel flush>
        {list.loading && !list.data ? <div className={bn.pad}><Skeleton lines={4} height={50} /></div> : rows.length ? (
          <Reorder.Group axis="y" values={rows} onReorder={setOrder} className={bn.list}>
            {rows.map((b, i) => (
              <BannerRow key={b.id} b={b} index={i} total={rows.length} busy={switching === b.id} onEdit={open} onRemove={remove} onToggle={toggle} onMove={move} />
            ))}
          </Reorder.Group>
        ) : !list.error && (
          <EmptyState art={<ChartSketch />} title="Nenhum banner" action={<Button variant="primary" icon={<FiPlus />} onClick={() => open(null)}>Criar banner</Button>}>
            Banners aparecem em sequência no topo da vitrine. Use imagem larga (1920 x 800).
          </EmptyState>
        )}
      </Panel>

      <Dialog
        open={!!edit}
        onClose={close}
        canClose={canClose}
        size="l"
        title={edit?.id ? 'Editar banner' : 'Novo banner'}
        footer={<>
          {edit?.id && <Button variant="danger" icon={<FiTrash2 />} onClick={async () => { if (await remove(edit)) { setDirty(false); close() } }}>Apagar</Button>}
          <span className={bn.spacer} />
          <Button variant="ghost" onClick={async () => { if (await canClose()) close() }}>Cancelar</Button>
          <Button variant="primary" onClick={save} loading={saving}>Salvar banner</Button>
        </>}
      >
        {edit && (
          <div className={s.formGrid}>
            <div className={bn.preview}>
              {edit.media_type === 'image' && preview
                ? <img src={preview} alt="" className={bn.previewImg} />
                : <div className={bn.previewEmpty}>{edit.media_type === 'video' ? 'O vídeo aparece na loja' : 'Prévia do banner'}</div>}
              {(edit.title || edit.subtitle) && (
                <div className={bn.previewText}>
                  <div className={bn.previewTitle}>{edit.title}</div>
                  <div className={bn.previewSub}>{edit.subtitle}</div>
                </div>
              )}
            </div>
            <Segmented label="Tipo" value={edit.media_type} onChange={set('media_type')} options={[{ value: 'image', label: 'Imagem' }, { value: 'video', label: 'Vídeo' }]} />
            {edit.media_type === 'image' ? (
              <>
                <div className={bn.row}>
                  <Button icon={<FiImage />} onClick={() => fileRef.current?.click()}>{preview ? 'Trocar imagem' : 'Escolher imagem'}</Button>
                  <input ref={fileRef} type="file" accept={IMAGE_ACCEPT} hidden onChange={e => { pick(e.target.files?.[0], 'wide'); e.target.value = '' }} />
                  <Button variant="ghost" icon={<FiImage />} onClick={() => mobileRef.current?.click()}>{mobilePreview ? 'Trocar a do celular' : 'Imagem só para celular'}</Button>
                  <input ref={mobileRef} type="file" accept={IMAGE_ACCEPT} hidden onChange={e => { pick(e.target.files?.[0], 'mobile'); e.target.value = '' }} />
                  {mobilePreview && (
                    <span className={bn.mobile}>
                      <img src={mobilePreview} alt="Prévia no celular" />
                      <Button size="small" variant="ghost" icon={<FiX />} onClick={() => { setEdit(x => ({ ...x, fileMobile: null, previewMobile: '', image_url_mobile: '' })); setDirty(true) }}>Tirar</Button>
                    </span>
                  )}
                </div>
                <p className={bn.hint}>Larga: 1920 x 800. No celular, uma imagem em pé (4:5, ex.: 1080 x 1350) fica melhor que a larga cortada; sem ela, o celular usa a larga. JPG, PNG ou WebP de até 10 MB.</p>
              </>
            ) : (
              <TextField label="Endereço do vídeo" value={edit.video_url || ''} onChange={set('video_url')} placeholder="https://" inputMode="url" />
            )}
            <div className={s.formRow}>
              <TextField label="Título" value={edit.title || ''} onChange={set('title')} maxLength={255} />
              <TextField label="Subtítulo" value={edit.subtitle || ''} onChange={set('subtitle')} maxLength={500} />
            </div>
            <TextField
              label="Ao tocar, leva para"
              value={edit.link || ''}
              onChange={e => { setLinkError(''); set('link')(e) }}
              placeholder="/produto/12 ou https://"
              inputMode="url"
              maxLength={500}
              error={linkError || undefined}
              hint="Vazio: o banner não é clicável."
            />
            <div className={s.formRow}>
              <SelectField label="Entrada" value={edit.animation_type} onChange={set('animation_type')} options={ANIMATIONS} />
              <SelectField label="Efeito de luz" value={edit.effect_type} onChange={set('effect_type')} options={EFFECTS} />
              <SelectField label="Velocidade do efeito" value={edit.effect_speed} onChange={set('effect_speed')} options={SPEEDS} />
            </div>
            <Switch checked={edit.active} onChange={set('active')} label="Banner ligado" description="Desligado, sai da loja e fica guardado aqui." />
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
