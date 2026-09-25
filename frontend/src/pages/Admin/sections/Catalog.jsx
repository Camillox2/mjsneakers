import { useRef, useState } from 'react'
import { FiPlus, FiEdit2, FiTrash2, FiImage } from 'react-icons/fi'
import api, { asList, uploadImage } from '../lib/api'
import { useResource } from '../lib/hooks'
import { getImageUrl } from '../../../utils/imageHelper'
import { PageHeader, Panel, Button, ErrorNote, Skeleton, EmptyState, Dialog, TextField, Switch, Badge, useConfirm, useToast } from '../ui'
import { Tag } from '../art/Art'
import s from './sections.module.css'

export default function Catalog() {
  return (
    <div>
      <PageHeader title="Marcas e categorias" description="Organizam a vitrine e os filtros da loja. Uma marca ou categoria em uso não pode ser apagada." />
      <div className={s.half}>
        <Brands />
        <Categories />
      </div>
    </div>
  )
}

function Brands() {
  const toast = useToast()
  const confirm = useConfirm()
  const fileRef = useRef(null)
  const list = useResource(() => api.get('/brands').then(r => asList(r.data)), [])
  const [edit, setEdit] = useState(null)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!edit.name.trim()) { toast.error('Dê um nome à marca.'); return }
    setSaving(true)
    try {
      const logo = edit.file ? await uploadImage(edit.file, 'brands') : edit.logo_url || null
      const payload = { name: edit.name.trim(), logo_url: logo }
      if (edit.id) await api.put(`/brands/${edit.id}`, payload)
      else await api.post('/brands', payload)
      toast.good(`Marca ${payload.name} salva.`)
      setEdit(null)
      list.reload()
    } catch (err) { toast.error(err.message) } finally { setSaving(false) }
  }

  const remove = async (b) => {
    if (!(await confirm({ title: `Apagar a marca ${b.name}?`, message: 'Só dá para apagar se nenhum produto usar esta marca.', confirmLabel: 'Apagar', tone: 'danger' }))) return
    try { await api.delete(`/brands/${b.id}`); toast.good('Marca apagada.'); list.reload() } catch (err) { toast.error(err.message) }
  }

  return (
    <Panel title="Marcas" actions={<Button size="small" icon={<FiPlus />} onClick={() => setEdit({ name: '', logo_url: '' })}>Nova</Button>}>
      <ErrorNote error={list.error} onRetry={list.reload} />
      {list.loading && !list.data ? <Skeleton lines={4} height={32} /> : list.data?.length ? (
        <div className={s.list}>
          {list.data.map(b => (
            <div key={b.id} className={s.listItem}>
              {b.logo_url ? <img className={s.thumb} src={getImageUrl(b.logo_url, b.name)} alt="" style={{ objectFit: 'contain', background: '#fff' }} /> : <span className={s.thumb} style={{ display: 'grid', placeItems: 'center', fontWeight: 700 }}>{b.name.slice(0, 1)}</span>}
              <div className={s.listMain}><div className={s.listTitle}>{b.name}</div>{b.product_count != null && <div className={s.listSub}>{b.product_count} {Number(b.product_count) === 1 ? 'produto' : 'produtos'}</div>}</div>
              <Button size="small" variant="ghost" icon={<FiEdit2 />} aria-label={`Editar ${b.name}`} onClick={() => setEdit({ ...b })} />
              <Button size="small" variant="ghost" icon={<FiTrash2 />} aria-label={`Apagar ${b.name}`} onClick={() => remove(b)} />
            </div>
          ))}
        </div>
      ) : <EmptyState art={<Tag />} title="Nenhuma marca" />}

      <Dialog
        open={!!edit}
        onClose={() => setEdit(null)}
        size="s"
        title={edit?.id ? 'Editar marca' : 'Nova marca'}
        footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button><Button variant="primary" onClick={save} loading={saving}>Salvar</Button></>}
      >
        {edit && (
          <div className={s.formGrid}>
            <TextField label="Nome" value={edit.name} onChange={e => setEdit(x => ({ ...x, name: e.target.value }))} data-autofocus maxLength={100} />
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {(edit.preview || edit.logo_url) && <img className={`${s.thumb} ${s.thumbL}`} src={edit.preview || getImageUrl(edit.logo_url, edit.name)} alt="" style={{ objectFit: 'contain', background: '#fff' }} />}
              <Button icon={<FiImage />} onClick={() => fileRef.current?.click()}>{edit.preview || edit.logo_url ? 'Trocar logo' : 'Adicionar logo'}</Button>
              {(edit.preview || edit.logo_url) && <Button variant="ghost" onClick={() => setEdit(x => ({ ...x, file: null, preview: '', logo_url: '' }))}>Tirar</Button>}
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) setEdit(x => ({ ...x, file: f, preview: URL.createObjectURL(f) })); e.target.value = '' }} />
          </div>
        )}
      </Dialog>
    </Panel>
  )
}

function Categories() {
  const toast = useToast()
  const confirm = useConfirm()
  const list = useResource(() => api.get('/categories', { params: { all: 1 } }).then(r => asList(r.data)), [])
  const [edit, setEdit] = useState(null)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!edit.name.trim()) { toast.error('Dê um nome à categoria.'); return }
    setSaving(true)
    try {
      const payload = { name: edit.name.trim(), sort_order: parseInt(edit.sort_order, 10) || 0, active: !!edit.active }
      if (edit.id) await api.put(`/categories/${edit.id}`, payload)
      else await api.post('/categories', payload)
      toast.good(`Categoria ${payload.name} salva.`)
      setEdit(null)
      list.reload()
    } catch (err) { toast.error(err.message) } finally { setSaving(false) }
  }

  const remove = async (c) => {
    if (!(await confirm({ title: `Apagar a categoria ${c.name}?`, message: 'Os produtos dela ficam sem categoria.', confirmLabel: 'Apagar', tone: 'danger' }))) return
    try { await api.delete(`/categories/${c.id}`); toast.good('Categoria apagada.'); list.reload() } catch (err) { toast.error(err.message) }
  }

  const rows = [...(list.data || [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

  return (
    <Panel title="Categorias" actions={<Button size="small" icon={<FiPlus />} onClick={() => setEdit({ name: '', sort_order: String(rows.length), active: true })}>Nova</Button>}>
      <ErrorNote error={list.error} onRetry={list.reload} />
      {list.loading && !list.data ? <Skeleton lines={4} height={32} /> : rows.length ? (
        <div className={s.list}>
          {rows.map(c => (
            <div key={c.id} className={s.listItem}>
              <div className={s.listMain}>
                <div className={s.listTitle}>{c.name}</div>
                <div className={s.listSub}>/{c.slug}{c.product_count != null ? `, ${c.product_count} ${Number(c.product_count) === 1 ? 'produto' : 'produtos'}` : ''}</div>
              </div>
              {c.active === 0 || c.active === false ? <Badge>Escondida</Badge> : null}
              <Button size="small" variant="ghost" icon={<FiEdit2 />} aria-label={`Editar ${c.name}`} onClick={() => setEdit({ ...c, sort_order: String(c.sort_order ?? 0), active: c.active !== 0 && c.active !== false })} />
              <Button size="small" variant="ghost" icon={<FiTrash2 />} aria-label={`Apagar ${c.name}`} onClick={() => remove(c)} />
            </div>
          ))}
        </div>
      ) : <EmptyState art={<Tag />} title="Nenhuma categoria">Ex.: Lifestyle, Corrida, Basquete, Skate.</EmptyState>}

      <Dialog
        open={!!edit}
        onClose={() => setEdit(null)}
        size="s"
        title={edit?.id ? 'Editar categoria' : 'Nova categoria'}
        footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button><Button variant="primary" onClick={save} loading={saving}>Salvar</Button></>}
      >
        {edit && (
          <div className={s.formGrid}>
            <TextField label="Nome" value={edit.name} onChange={e => setEdit(x => ({ ...x, name: e.target.value }))} data-autofocus maxLength={100} />
            <TextField label="Posição" inputMode="numeric" value={edit.sort_order} onChange={e => setEdit(x => ({ ...x, sort_order: e.target.value }))} hint="Menor aparece antes no filtro da loja." />
            <Switch checked={edit.active} onChange={v => setEdit(x => ({ ...x, active: v }))} label="Mostrar na loja" />
          </div>
        )}
      </Dialog>
    </Panel>
  )
}
