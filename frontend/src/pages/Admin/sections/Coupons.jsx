import { useState } from 'react'
import { FiPlus, FiTrash2, FiCopy } from 'react-icons/fi'
import api, { asList } from '../lib/api'
import { useResource } from '../lib/hooks'
import { money, number, date, toLocalInput } from '../lib/format'
import { PageHeader, Panel, Button, DataTable, ErrorNote, Skeleton, EmptyState, Dialog, TextField, Segmented, Switch, Badge, useConfirm, useToast } from '../ui'
import { Tag } from '../art/Art'
import s from './sections.module.css'

const EMPTY = { code: '', type: 'percent', value: '10', min_order: '0', max_uses: '0', valid_until: '', active: true, once_per_email: false, visible_in_account: false, customer_email: '', description: '' }

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
  const [initial, setInitial] = useState(null)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(null)
  const [errors, setErrors] = useState({})

  const open = (c) => {
    setErrors({})
    const form = c ? { ...EMPTY, ...c, value: String(Number(c.value)), min_order: String(Number(c.min_order || 0)), max_uses: String(Number(c.max_uses || 0)), valid_until: toLocalInput(c.valid_until), active: !!c.active, once_per_email: !!c.once_per_email, visible_in_account: !!c.visible_in_account, customer_email: c.customer_email || '', description: c.description || '' } : { ...EMPTY }
    setEdit(form)
    setInitial(form)
  }
  const set = (k) => (e) => setEdit(x => ({ ...x, [k]: e?.target ? e.target.value : e }))
  const dirty = !!edit && JSON.stringify(edit) !== JSON.stringify(initial)
  // fechar sem salvar pergunta antes de jogar fora o que foi digitado
  const canClose = async () => !dirty || confirm({ title: 'Descartar as alterações?', message: 'O que você mudou neste cupom não foi salvo.', confirmLabel: 'Descartar', cancelLabel: 'Continuar editando', tone: 'danger' })
  const close = async () => { if (await canClose()) setEdit(null) }

  const save = async () => {
    const value = parseFloat(String(edit.value).replace(',', '.'))
    const e = {}
    const minOrder = String(edit.min_order).trim() === '' ? 0 : Number(String(edit.min_order).replace(',', '.'))
    const maxUses = String(edit.max_uses).trim() === '' ? 0 : Number(edit.max_uses)
    if (!/^[A-Z0-9_-]{3,50}$/.test(edit.code.trim().toUpperCase())) e.code = 'Use de 3 a 50 letras, números, - ou _ (sem espaço nem acento).'
    if (!(value > 0)) e.value = 'Informe um valor maior que zero.'
    else if (edit.type === 'percent' && value > 90) e.value = 'O desconto vai até 90%.'
    if (!(minOrder >= 0)) e.min_order = 'Use só números, como 199,90.'
    if (!(Number.isInteger(maxUses) && maxUses >= 0)) e.max_uses = 'Use um número inteiro, como 100.'
    if (edit.customer_email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(edit.customer_email.trim())) e.customer_email = 'E-mail inválido.'
    setErrors(e)
    if (Object.keys(e).length) return
    setSaving(true)
    const payload = {
      code: edit.code.trim().toUpperCase(),
      type: edit.type,
      value,
      min_order: minOrder,
      max_uses: maxUses,
      valid_until: edit.valid_until || null,
      active: !!edit.active,
      once_per_email: !!edit.once_per_email,
      visible_in_account: !!edit.visible_in_account,
      customer_email: edit.customer_email.trim().toLowerCase() || null,
      description: edit.description.trim() || null,
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
    if (!(await confirm({
      title: `Excluir o cupom ${c.code}?`,
      message: 'Quem tentar usar depois recebe "cupom inválido". Pedidos antigos continuam com o desconto que tiveram. Para parar só por um tempo, pause o cupom em vez de excluir.',
      confirmLabel: 'Excluir cupom',
      tone: 'danger',
    }))) return
    setRemoving(c.id)
    try {
      await api.delete(`/coupons/${c.id}`)
      toast.good(`Cupom ${c.code} excluído.`)
      if (edit?.id === c.id) setEdit(null)
      list.reload()
    } catch (err) { toast.error(err.message) } finally { setRemoving(null) }
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
        {list.loading && !list.data ? <div className={s.pad}><Skeleton lines={5} height={32} /></div> : (
          <DataTable
            rows={list.data || []}
            onRowClick={open}
            columns={[
              {
                key: 'code', header: 'Código', primary: true,
                render: c => (
                  <span className={s.codeCell}>
                    <strong className={s.couponCode}>{c.code}</strong>
                    <Button size="small" variant="ghost" icon={<FiCopy />} aria-label={`Copiar ${c.code}`} onClick={() => copy(c.code)} />
                  </span>
                ),
              },
              { key: 'value', header: 'Desconto', render: c => (c.type === 'percent' ? `${number(c.value)}%` : money(c.value)) },
              { key: 'min', header: 'Pedido mínimo', align: 'right', render: c => (Number(c.min_order) > 0 ? money(c.min_order) : 'Sem mínimo') },
              { key: 'uses', header: 'Usos', align: 'right', render: c => `${number(c.used_count || 0)}${Number(c.max_uses) > 0 ? ` de ${number(c.max_uses)}` : ''}${c.once_per_email ? ', 1 por cliente' : ''}` },
              { key: 'until', header: 'Validade', render: c => (c.valid_until ? date(c.valid_until) : 'Sem prazo') },
              { key: 'st', header: 'Situação', render: c => { const st = stateOf(c); return <span className={s.badges}><Badge tone={st.tone}>{st.label}</Badge>{c.visible_in_account ? <Badge tone="info">Na conta do cliente</Badge> : null}{c.customer_email ? <Badge title={c.customer_email}>Só para um cliente</Badge> : null}</span> } },
              // no celular o excluir fica dentro do cupom (botão com nome, longe do dedo)
              { key: 'act', header: '', hideOnCard: true, render: c => <Button size="small" variant="ghost" icon={<FiTrash2 />} aria-label={`Excluir o cupom ${c.code}`} loading={removing === c.id} onClick={() => remove(c)} /> },
            ]}
            empty={<EmptyState art={<Tag />} title="Nenhum cupom" action={<Button variant="primary" icon={<FiPlus />} onClick={() => open(null)}>Criar cupom</Button>}>Crie um código para campanhas, influenciadores ou para quem assina a newsletter.</EmptyState>}
          />
        )}
      </Panel>

      <Dialog
        open={!!edit}
        onClose={() => setEdit(null)}
        canClose={canClose}
        title={edit?.id ? `Cupom ${initial?.code || edit.code}` : 'Novo cupom'}
        footer={<>
          {edit?.id && <Button variant="danger" icon={<FiTrash2 />} loading={removing === edit.id} disabled={saving} onClick={() => remove(edit)}>Excluir</Button>}
          <Button variant="ghost" onClick={close}>Cancelar</Button>
          <Button variant="primary" onClick={save} loading={saving} disabled={removing === edit?.id}>Salvar cupom</Button>
        </>}
      >
        {edit && (
          <div className={s.formGrid}>
            <TextField label="Código" value={edit.code} onChange={e => setEdit(x => ({ ...x, code: e.target.value.toUpperCase().replace(/\s/g, '') }))} error={errors.code} placeholder="DROP10" autoCapitalize="characters" maxLength={50} spellCheck={false} hint="É o que o cliente digita no checkout." data-autofocus />
            <div className={s.fieldGroup}>
              <span className={s.label} aria-hidden="true">Tipo de desconto</span>
              <Segmented label="Tipo de desconto" value={edit.type} onChange={set('type')} options={[{ value: 'percent', label: 'Porcentagem' }, { value: 'fixed', label: 'Valor fixo em reais' }]} />
            </div>
            <div className={s.formRow}>
              <TextField label="Desconto" {...(edit.type === 'percent' ? { suffix: '%' } : { prefix: 'R$' })} inputMode="decimal" value={edit.value} onChange={set('value')} error={errors.value} />
              <TextField label="Pedido mínimo" prefix="R$" inputMode="decimal" value={edit.min_order} onChange={set('min_order')} error={errors.min_order} hint="0 para qualquer valor" />
            </div>
            <div className={s.formRow}>
              <TextField label="Limite de usos" inputMode="numeric" value={edit.max_uses} onChange={set('max_uses')} error={errors.max_uses} hint="0 para sem limite" />
              <TextField label="Vale até" type="datetime-local" value={edit.valid_until} onChange={set('valid_until')} hint="Vazio para sem prazo" />
            </div>
            <TextField label="Descrição para o cliente" value={edit.description} onChange={set('description')} placeholder="Ex.: 10% no primeiro par" maxLength={160} hint="Aparece na conta do cliente, junto do código." />
            <Switch checked={edit.visible_in_account} onChange={set('visible_in_account')} label="Mostrar na conta do cliente" description="Aparece em Minha conta, em Pontos e cupons, pronto para usar no checkout." />
            <TextField label="Só para este cliente (opcional)" type="email" value={edit.customer_email} onChange={set('customer_email')} error={errors.customer_email} placeholder="Vazio: vale para todo mundo" hint="Cupom pessoal: só esse e-mail consegue usar e ver." />
            <Switch checked={edit.once_per_email} onChange={set('once_per_email')} label="Uma vez por cliente" description="Cada e-mail usa este cupom uma vez só." />
            <Switch checked={edit.active} onChange={set('active')} label="Cupom ativo" description="Pausado, ninguém consegue usar." />
          </div>
        )}
      </Dialog>
    </div>
  )
}
