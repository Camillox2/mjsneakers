import { useState } from 'react'
import { FiPlus, FiTrash2, FiCopy } from 'react-icons/fi'
import api, { asList } from '../lib/api'
import { useResource } from '../lib/hooks'
import { money, number, date, toLocalInput } from '../lib/format'
import { PageHeader, Panel, Button, DataTable, ErrorNote, Skeleton, EmptyState, Dialog, TextField, Segmented, Switch, Badge, useConfirm, useToast } from '../ui'
import { Tag } from '../art/Art'
import s from './sections.module.css'

const EMPTY = { code: '', type: 'percent', value: '10', min_order: '0', max_uses: '0', valid_until: '', active: true, once_per_email: false }

function stateOf(c) {
  if (!c.active) return { label: 'Pausado', tone: 'neutral' }
  if (c.valid_until && new Date(c.valid_until) < new Date()) return { label: 'Vencido', tone: 'critical' }
  if (Number(c.max_uses) > 0 && Number(c.used_count) >= Number(c.max_uses)) return { label: 'Esgotado', tone: 'warning' }
  return { label: 'Valendo', tone: 'good' }
}

export default function Coupons() {
  const toast = useToast()
  const confirm = useConfirm()
  const list = useResource(() => api.get('/coupons').then(r => asList(r.data)), [])
  const [edit, setEdit] = useState(null)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})

  const open = (c) => {
    setErrors({})
    setEdit(c ? { ...EMPTY, ...c, value: String(Number(c.value)), min_order: String(Number(c.min_order || 0)), max_uses: String(Number(c.max_uses || 0)), valid_until: toLocalInput(c.valid_until), active: !!c.active, once_per_email: !!c.once_per_email } : { ...EMPTY })
  }
  const set = (k) => (e) => setEdit(x => ({ ...x, [k]: e?.target ? e.target.value : e }))

  const save = async () => {
    const value = parseFloat(String(edit.value).replace(',', '.'))
    const e = {}
    if (!/^[A-Z0-9_-]{3,30}$/.test(edit.code.trim().toUpperCase())) e.code = 'Use de 3 a 30 letras, números, - ou _.'
    if (!(value > 0)) e.value = 'Informe um valor maior que zero.'
    else if (edit.type === 'percent' && value > 90) e.value = 'Até 90%.'
    setErrors(e)
    if (Object.keys(e).length) return
    setSaving(true)
    const payload = {
      code: edit.code.trim().toUpperCase(),
      type: edit.type,
      value,
      min_order: parseFloat(String(edit.min_order).replace(',', '.')) || 0,
      max_uses: parseInt(edit.max_uses, 10) || 0,
      valid_until: edit.valid_until || null,
      active: !!edit.active,
      once_per_email: !!edit.once_per_email,
    }
    try {
      if (edit.id) await api.put(`/coupons/${edit.id}`, payload)
      else await api.post('/coupons', payload)
      toast.good(`Cupom ${payload.code} salvo.`)
      setEdit(null)
      list.reload()
    } catch (err) { toast.error(err.message) } finally { setSaving(false) }
  }

  const remove = async (c) => {
    if (!(await confirm({ title: `Excluir o cupom ${c.code}?`, message: 'Quem tentar usar depois recebe "cupom inválido". Pedidos antigos continuam com o desconto que tiveram.', confirmLabel: 'Excluir', tone: 'danger' }))) return
    try { await api.delete(`/coupons/${c.id}`); toast.good('Cupom excluído.'); list.reload() } catch (err) { toast.error(err.message) }
  }

  const copy = async (code) => {
    try { await navigator.clipboard.writeText(code); toast.good(`${code} copiado.`) } catch { toast.error('Não deu para copiar.') }
  }

  return (
    <div>
      <PageHeader
        title="Cupons"
        description="Desconto em porcentagem ou valor fixo, com pedido mínimo, limite de usos e validade."
        actions={<Button variant="primary" icon={<FiPlus />} onClick={() => open(null)}>Novo cupom</Button>}
      />
      <ErrorNote error={list.error} onRetry={list.reload} />
      <Panel flush>
        {list.loading && !list.data ? <div style={{ padding: 18 }}><Skeleton lines={5} height={32} /></div> : (
          <DataTable
            rows={list.data || []}
            onRowClick={open}
            columns={[
              {
                key: 'code', header: 'Código', primary: true,
                render: c => (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <strong style={{ letterSpacing: '0.04em' }}>{c.code}</strong>
                    <Button size="small" variant="ghost" icon={<FiCopy />} aria-label={`Copiar ${c.code}`} onClick={() => copy(c.code)} />
                  </span>
                ),
              },
              { key: 'value', header: 'Desconto', render: c => (c.type === 'percent' ? `${number(c.value)}%` : money(c.value)) },
              { key: 'min', header: 'Pedido mínimo', align: 'right', render: c => (Number(c.min_order) > 0 ? money(c.min_order) : 'Sem mínimo') },
              { key: 'uses', header: 'Usos', align: 'right', render: c => `${number(c.used_count || 0)}${Number(c.max_uses) > 0 ? ` de ${number(c.max_uses)}` : ''}${c.once_per_email ? ', 1 por cliente' : ''}` },
              { key: 'until', header: 'Validade', render: c => (c.valid_until ? date(c.valid_until) : 'Sem prazo') },
              { key: 'st', header: 'Situação', render: c => { const st = stateOf(c); return <Badge tone={st.tone}>{st.label}</Badge> } },
              { key: 'act', header: '', render: c => <Button size="small" variant="ghost" icon={<FiTrash2 />} aria-label={`Excluir ${c.code}`} onClick={() => remove(c)} /> },
            ]}
            empty={<EmptyState art={<Tag />} title="Nenhum cupom" action={<Button variant="primary" icon={<FiPlus />} onClick={() => open(null)}>Criar cupom</Button>}>Crie um código para campanhas, influenciadores ou para quem assina a newsletter.</EmptyState>}
          />
        )}
      </Panel>

      <Dialog
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? `Cupom ${edit.code}` : 'Novo cupom'}
        footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button><Button variant="primary" onClick={save} loading={saving}>Salvar cupom</Button></>}
      >
        {edit && (
          <div className={s.formGrid}>
            <TextField label="Código" value={edit.code} onChange={e => setEdit(x => ({ ...x, code: e.target.value.toUpperCase().replace(/\s/g, '') }))} error={errors.code} placeholder="DROP10" autoCapitalize="characters" data-autofocus />
            <div>
              <p className={s.sectionTitle} style={{ fontSize: 13.5, color: 'var(--a-text-2)', fontWeight: 600, marginBottom: 6 }}>Tipo de desconto</p>
              <Segmented label="Tipo de desconto" value={edit.type} onChange={set('type')} options={[{ value: 'percent', label: 'Porcentagem' }, { value: 'fixed', label: 'Valor fixo' }]} />
            </div>
            <div className={s.formRow}>
              <TextField label="Desconto" {...(edit.type === 'percent' ? { suffix: '%' } : { prefix: 'R$' })} inputMode="decimal" value={edit.value} onChange={set('value')} error={errors.value} />
              <TextField label="Pedido mínimo" prefix="R$" inputMode="decimal" value={edit.min_order} onChange={set('min_order')} hint="0 para qualquer valor" />
            </div>
            <div className={s.formRow}>
              <TextField label="Limite de usos" inputMode="numeric" value={edit.max_uses} onChange={set('max_uses')} hint="0 para sem limite" />
              <TextField label="Vale até" type="datetime-local" value={edit.valid_until} onChange={set('valid_until')} hint="Vazio para sem prazo" />
            </div>
            <Switch checked={edit.once_per_email} onChange={set('once_per_email')} label="Uma vez por cliente" description="Cada e-mail usa este cupom uma vez só." />
            <Switch checked={edit.active} onChange={set('active')} label="Cupom ativo" description="Pausado, ninguém consegue usar." />
          </div>
        )}
      </Dialog>
    </div>
  )
}
