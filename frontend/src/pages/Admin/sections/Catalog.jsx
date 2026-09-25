import { useId, useRef, useState } from 'react'
import { FiPlus, FiEdit2, FiTrash2, FiImage, FiX } from 'react-icons/fi'
import api, { asList, uploadImage } from '../lib/api'
import { useResource } from '../lib/hooks'
import { plural } from '../lib/format'
import { getImageUrl } from '../../../utils/imageHelper'
import { PageHeader, Panel, Button, ErrorNote, Skeleton, EmptyState, Dialog, TextField, Switch, Badge, useConfirm, useToast } from '../ui'
import { Tag } from '../art/Art'
import { imageProblem, IMAGE_ACCEPT } from './formInput'
import s from './sections.module.css'
import c from './Catalog.module.css'

export default function Catalog() {
  return (
    <div>
      <PageHeader
        title="Marcas e categorias"
        description="Organizam a vitrine e os filtros da loja. Marca em uso não pode ser apagada; categoria pode, e os produtos dela ficam sem categoria."
      />
      <div className={s.half}>
        <Brands />
        <Categories />
      </div>
    </div>
  )
}

const inStore = (n) => (Number(n) > 0 ? `${plural(n, 'produto', 'produtos')} na loja` : 'Nenhum produto na loja')

function Brands() {
  const toast = useToast()
  const confirm = useConfirm()
  const fileRef = useRef(null)
  const formId = useId()
  const list = useResource(() => api.get('/brands').then(r => asList(r.data)), [])
  const [edit, setEdit] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // a prévia local do logo novo é liberada quando troca ou fecha
  const dropPreview = (x) => { if (x?.preview) URL.revokeObjectURL(x.preview) }
  const open = (b) => { setError(''); setEdit(b ? { ...b } : { name: '', logo_url: '' }) }
  const close = () => { dropPreview(edit); setEdit(null) }

  const pickLogo = (f) => {
    if (!f) return
    const problem = imageProblem(f)
    if (problem) { toast.error(problem); return }
    dropPreview(edit)
    const preview = URL.createObjectURL(f)
    setEdit(x => ({ ...x, file: f, preview }))
  }

  const save = async (e) => {
    e?.preventDefault()
    if (saving) return
    const name = edit.name.trim()
    if (!name) { setError('Dê um nome à marca.'); return }
    setSaving(true)
    try {
      // o logo sobe uma vez só: se salvar falhar, a próxima tentativa usa o mesmo endereço
      let logo = edit.logo_url || null
      if (edit.file) {
        logo = await uploadImage(edit.file, 'brands')
        setEdit(x => ({ ...x, file: null, logo_url: logo }))
      }
      const payload = { name, logo_url: logo }
      if (edit.id) await api.put(`/brands/${edit.id}`, payload)
      else await api.post('/brands', payload)
      toast.good(`Marca ${name} salva.`)
      close()
      list.reload()
    } catch (err) {
      if (err.status === 409) setError(err.message)
      toast.error(err.message)
    } finally { setSaving(false) }
  }

  const remove = async (b) => {
    if (Number(b.product_count) > 0) {
      toast.info(`${b.name} está em ${plural(b.product_count, 'produto', 'produtos')} da loja. Troque a marca deles antes de apagar.`)
      return
    }
    if (!(await confirm({ title: `Apagar a marca ${b.name}?`, message: 'Só dá para apagar se nenhum produto usar esta marca, nem os que estão fora da loja.', confirmLabel: 'Apagar', tone: 'danger' }))) return
    try { await api.delete(`/brands/${b.id}`); toast.good('Marca apagada.'); list.reload() } catch (err) { toast.error(err.message) }
  }

  const logoSrc = edit?.preview || (edit?.logo_url ? getImageUrl(edit.logo_url, edit.name) : '')

  return (
    <Panel title="Marcas" actions={<Button size="small" icon={<FiPlus />} onClick={() => open(null)}>Nova marca</Button>}>
      <ErrorNote error={list.error} onRetry={list.reload} />
      {list.loading && !list.data ? <Skeleton lines={4} height={32} /> : list.data?.length ? (
        <div className={s.list}>
          {list.data.map(b => (
            <div key={b.id} className={s.listItem}>
              {b.logo_url
                ? <img className={`${s.thumb} ${c.logo}`} src={getImageUrl(b.logo_url, b.name)} alt="" loading="lazy" />
                : <span className={`${s.thumb} ${c.initial}`} aria-hidden="true">{b.name.slice(0, 1).toUpperCase()}</span>}
              <div className={s.listMain}>
                <div className={s.listTitle}>{b.name}</div>
                <div className={s.listSub}>{inStore(b.product_count)}</div>
              </div>
              <Button size="small" variant="ghost" icon={<FiEdit2 />} aria-label={`Editar a marca ${b.name}`} onClick={() => open(b)} />
              <Button size="small" variant="ghost" icon={<FiTrash2 />} aria-label={`Apagar a marca ${b.name}`} onClick={() => remove(b)} />
            </div>
          ))}
        </div>
      ) : !list.error && (
        <EmptyState art={<Tag />} title="Nenhuma marca" action={<Button variant="primary" icon={<FiPlus />} onClick={() => open(null)}>Cadastrar marca</Button>}>
          Com marcas cadastradas, o cliente filtra a vitrine por elas.
        </EmptyState>
      )}

      <Dialog
        open={!!edit}
        onClose={close}
        size="s"
        title={edit?.id ? 'Editar marca' : 'Nova marca'}
        footer={<><Button variant="ghost" onClick={close}>Cancelar</Button><Button type="submit" form={formId} variant="primary" loading={saving}>Salvar marca</Button></>}
      >
        {edit && (
          <form id={formId} className={s.formGrid} onSubmit={save} noValidate>
            <TextField label="Nome" value={edit.name} onChange={e => { setError(''); setEdit(x => ({ ...x, name: e.target.value })) }} error={error || undefined} data-autofocus maxLength={100} />
            <div className={c.logoRow}>
              {logoSrc && <img className={`${s.thumb} ${s.thumbL} ${c.logo}`} src={logoSrc} alt="Logo da marca" />}
              <Button icon={<FiImage />} onClick={() => fileRef.current?.click()}>{logoSrc ? 'Trocar logo' : 'Adicionar logo'}</Button>
              {logoSrc && <Button variant="ghost" icon={<FiX />} onClick={() => { dropPreview(edit); setEdit(x => ({ ...x, file: null, preview: '', logo_url: '' })) }}>Tirar logo</Button>}
            </div>
            <p className={c.hint}>PNG com fundo transparente fica melhor. JPG, PNG, WebP ou GIF de até 10 MB.</p>
            <input ref={fileRef} type="file" accept={IMAGE_ACCEPT} hidden onChange={e => { pickLogo(e.target.files?.[0]); e.target.value = '' }} />
          </form>
        )}
      </Dialog>
    </Panel>
  )
}

function Categories() {
  const toast = useToast()
  const confirm = useConfirm()
  const formId = useId()
  const list = useResource(() => api.get('/categories', { params: { all: 1 } }).then(r => asList(r.data)), [])
  const [edit, setEdit] = useState(null)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  const rows = [...(list.data || [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  const open = (cat) => {
    setErrors({})
    setEdit(cat
      ? { ...cat, sort_order: String(cat.sort_order ?? 0), active: cat.active !== 0 && cat.active !== false }
      : { name: '', sort_order: String(rows.length), active: true })
  }

  const save = async (e) => {
    e?.preventDefault()
    if (saving) return
    const name = edit.name.trim()
    const order = String(edit.sort_order).trim()
    const next = {}
    if (!name) next.name = 'Dê um nome à categoria.'
    if (order && !/^-?\d{1,6}$/.test(order)) next.order = 'Use um número inteiro.'
    setErrors(next)
    if (Object.keys(next).length) return
    setSaving(true)
    try {
      const payload = { name, sort_order: Number(order) || 0, active: !!edit.active }
      if (edit.id) await api.put(`/categories/${edit.id}`, payload)
      else await api.post('/categories', payload)
      toast.good(`Categoria ${name} salva.`)
      setEdit(null)
      list.reload()
    } catch (err) {
      if (err.status === 409) setErrors({ name: err.message })
      toast.error(err.message)
    } finally { setSaving(false) }
  }

  const remove = async (cat) => {
    const n = Number(cat.product_count) || 0
    if (!(await confirm({
      title: `Apagar a categoria ${cat.name}?`,
      message: n ? `${plural(n, 'produto da loja fica', 'produtos da loja ficam')} sem categoria. Eles continuam à venda.` : 'Nenhum produto da loja está nela.',
      confirmLabel: 'Apagar',
      tone: 'danger',
    }))) return
    try { await api.delete(`/categories/${cat.id}`); toast.good('Categoria apagada.'); list.reload() } catch (err) { toast.error(err.message) }
  }

  return (
    <Panel title="Categorias" actions={<Button size="small" icon={<FiPlus />} onClick={() => open(null)}>Nova categoria</Button>}>
      <ErrorNote error={list.error} onRetry={list.reload} />
      {list.loading && !list.data ? <Skeleton lines={4} height={32} /> : rows.length ? (
        <div className={s.list}>
          {rows.map(cat => (
            <div key={cat.id} className={s.listItem}>
              <div className={s.listMain}>
                <div className={s.listTitle}>{cat.name}</div>
                <div className={s.listSub}>{inStore(cat.product_count)}</div>
              </div>
              {cat.active === 0 || cat.active === false ? <Badge>Escondida</Badge> : null}
              <Button size="small" variant="ghost" icon={<FiEdit2 />} aria-label={`Editar a categoria ${cat.name}`} onClick={() => open(cat)} />
              <Button size="small" variant="ghost" icon={<FiTrash2 />} aria-label={`Apagar a categoria ${cat.name}`} onClick={() => remove(cat)} />
            </div>
          ))}
        </div>
      ) : !list.error && (
        <EmptyState art={<Tag />} title="Nenhuma categoria" action={<Button variant="primary" icon={<FiPlus />} onClick={() => open(null)}>Cadastrar categoria</Button>}>
          Ex.: Lifestyle, Corrida, Basquete, Skate.
        </EmptyState>
      )}

      <Dialog
        open={!!edit}
        onClose={() => setEdit(null)}
        size="s"
        title={edit?.id ? 'Editar categoria' : 'Nova categoria'}
        footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button><Button type="submit" form={formId} variant="primary" loading={saving}>Salvar categoria</Button></>}
      >
        {edit && (
          <form id={formId} className={s.formGrid} onSubmit={save} noValidate>
            <TextField label="Nome" value={edit.name} onChange={e => setEdit(x => ({ ...x, name: e.target.value }))} error={errors.name} data-autofocus maxLength={100} />
            <TextField label="Posição no filtro" inputMode="numeric" value={edit.sort_order} onChange={e => setEdit(x => ({ ...x, sort_order: e.target.value }))} error={errors.order} hint="Menor aparece antes no filtro da loja." />
            <Switch checked={edit.active} onChange={v => setEdit(x => ({ ...x, active: v }))} label="Mostrar na loja" description="Escondida, some do filtro. Os produtos dela continuam à venda." />
          </form>
        )}
      </Dialog>
    </Panel>
  )
}
