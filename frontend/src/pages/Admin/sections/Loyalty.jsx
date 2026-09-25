import { useEffect, useState } from 'react'
import { FiPlus } from 'react-icons/fi'
import api, { asPage } from '../lib/api'
import { useDebounced, useResource } from '../lib/hooks'
import { number, ago, money } from '../lib/format'
import { PageHeader, Panel, Button, SearchField, DataTable, Pagination, ErrorNote, Skeleton, EmptyState, Dialog, TextField, Switch, useToast } from '../ui'
import { Stars } from '../art/Art'
import s from './sections.module.css'

export default function Loyalty() {
  const toast = useToast()
  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim(), 350)
  const [page, setPage] = useState(1)
  const [bonus, setBonus] = useState(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => { setPage(1) }, [q])

  const list = useResource(() => api.get('/loyalty', { params: { search: q || undefined, page, limit: 20 } }).then(r => asPage(r.data, page)), [q, page])

  const give = async () => {
    const points = parseInt(bonus.points, 10)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bonus.email.trim())) { toast.error('Informe um e-mail válido.'); return }
    if (!(points > 0)) { toast.error('Os pontos precisam ser maiores que zero.'); return }
    setSaving(true)
    try {
      await api.post('/loyalty/bonus', { email: bonus.email.trim().toLowerCase(), points, description: bonus.description.trim() || 'Bônus da loja' })
      toast.good(`${number(points)} pontos para ${bonus.email.trim()}.`)
      setBonus(null)
      list.reload()
    } catch (err) { toast.error(err.message) } finally { setSaving(false) }
  }

  return (
    <div>
      <PageHeader
        title="Fidelidade"
        description="O cliente ganha pontos em pedido entregue e usa como desconto no checkout, logado na conta."
        actions={<Button variant="primary" icon={<FiPlus />} onClick={() => setBonus({ email: '', points: '100', description: '' })}>Dar pontos</Button>}
      />
      <Rules />
      <div style={{ margin: '16px 0 14px' }}><SearchField value={search} onChange={setSearch} placeholder="Nome ou e-mail" /></div>
      <ErrorNote error={list.error} onRetry={list.reload} />
      <Panel flush>
        {list.loading && !list.data ? <div style={{ padding: 18 }}><Skeleton lines={5} height={32} /></div> : (
          <DataTable
            rowKey={c => c.id || c.customer_email}
            rows={list.data?.items || []}
            dim={list.loading}
            columns={[
              { key: 'who', header: 'Cliente', primary: true, render: c => <div style={{ minWidth: 0 }}><div className={s.listTitle}>{c.customer_name || 'Sem nome'}</div><div className={s.listSub}>{c.customer_email}</div></div> },
              { key: 'pts', header: 'Saldo', align: 'right', render: c => <strong>{number(c.points)}</strong> },
              { key: 'earned', header: 'Ganhou', align: 'right', render: c => number(c.total_earned) },
              { key: 'used', header: 'Usou', align: 'right', render: c => number(c.total_redeemed) },
              { key: 'when', header: 'Atualizado', render: c => (c.updated_at ? ago(c.updated_at) : '') },
            ]}
            empty={<EmptyState art={<Stars />} title={q ? 'Ninguém com essa busca' : 'Ninguém com pontos ainda'}>Os pontos entram quando o pedido é marcado como entregue. Também dá para dar pontos de presente.</EmptyState>}
          />
        )}
      </Panel>
      <Pagination page={page} pages={list.data?.pages} onChange={setPage} />

      <Dialog
        open={!!bonus}
        onClose={() => setBonus(null)}
        size="s"
        title="Dar pontos"
        description="O saldo do cliente sobe na hora."
        footer={<><Button variant="ghost" onClick={() => setBonus(null)}>Cancelar</Button><Button variant="primary" onClick={give} loading={saving}>Dar pontos</Button></>}
      >
        {bonus && (
          <div className={s.formGrid}>
            <TextField label="E-mail do cliente" type="email" value={bonus.email} onChange={e => setBonus(b => ({ ...b, email: e.target.value }))} data-autofocus autoCapitalize="none" />
            <TextField label="Pontos" inputMode="numeric" value={bonus.points} onChange={e => setBonus(b => ({ ...b, points: e.target.value }))} hint={`Vale R$ ${((parseInt(bonus.points, 10) || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} de desconto`} />
            <TextField label="Motivo" value={bonus.description} onChange={e => setBonus(b => ({ ...b, description: e.target.value }))} placeholder="Ex.: aniversário, troca atrasada" maxLength={120} />
          </div>
        )}
      </Dialog>
    </div>
  )
}

const RULE_KEYS = ['loyalty_enabled', 'loyalty_points_per_real', 'loyalty_points_per_real_discount', 'loyalty_max_redeem_percent', 'loyalty_min_redeem']
const DEFAULTS = { loyalty_enabled: 'true', loyalty_points_per_real: '10', loyalty_points_per_real_discount: '100', loyalty_max_redeem_percent: '30', loyalty_min_redeem: '500' }

// Regras do programa: quanto se ganha, quanto vale e até onde pode descontar.
function Rules() {
  const toast = useToast()
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const remote = useResource(() => api.get('/settings/admin').then(r => r.data || {}), [])
  useEffect(() => {
    if (remote.data) setForm(Object.fromEntries(RULE_KEYS.map(k => [k, String(remote.data[k] ?? DEFAULTS[k])])))
  }, [remote.data])
  if (!form) return <Panel><Skeleton lines={3} height={26} /></Panel>

  const n = (k) => Number(String(form[k]).replace(',', '.')) || 0
  const earn = n('loyalty_points_per_real')
  const worth = n('loyalty_points_per_real_discount')
  const maxPct = n('loyalty_max_redeem_percent')
  const min = n('loyalty_min_redeem')
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e?.target ? e.target.value : e }))
  const example = 500
  const pointsFrom500 = Math.floor(example * earn)
  const valueOf = (pts) => (worth > 0 ? pts / worth : 0)

  const save = async () => {
    if (!(earn >= 0 && earn <= 100)) { toast.error('Pontos por real: de 0 a 100.'); return }
    if (!(worth >= 1 && worth <= 100000)) { toast.error('Pontos por R$ 1 de desconto: de 1 a 100.000.'); return }
    if (!(maxPct >= 0 && maxPct <= 100)) { toast.error('O teto vai de 0 a 100% do valor dos produtos.'); return }
    setSaving(true)
    try {
      await api.put('/settings', { settings: Object.fromEntries(RULE_KEYS.map(k => [k, k === 'loyalty_enabled' ? form[k] : String(n(k))])) })
      toast.good('Regras dos pontos salvas.')
      remote.reload()
    } catch (err) { toast.error(err.message) } finally { setSaving(false) }
  }

  return (
    <Panel title="Regras dos pontos">
      <div style={{ display: 'grid', gap: 14 }}>
        <Switch checked={form.loyalty_enabled === 'true'} onChange={v => setForm(f => ({ ...f, loyalty_enabled: v ? 'true' : 'false' }))} label="Programa ligado" description="Desligado, ninguém ganha nem usa pontos; os saldos ficam guardados." />
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <TextField label="Pontos por R$ 1 gasto" inputMode="decimal" value={form.loyalty_points_per_real} onChange={set('loyalty_points_per_real')} hint="Contados quando o pedido é entregue." />
          <TextField label="Pontos para R$ 1 de desconto" inputMode="numeric" value={form.loyalty_points_per_real_discount} onChange={set('loyalty_points_per_real_discount')} />
          <TextField label="Desconto máximo com pontos" suffix="%" inputMode="numeric" value={form.loyalty_max_redeem_percent} onChange={set('loyalty_max_redeem_percent')} hint="Do valor dos produtos, sem frete." />
          <TextField label="Mínimo de pontos para usar" inputMode="numeric" value={form.loyalty_min_redeem} onChange={set('loyalty_min_redeem')} />
        </div>
        <p style={{ margin: 0, padding: '10px 12px', borderRadius: 10, background: 'var(--a-sunken)', border: '1px solid var(--a-line)', fontSize: 14 }}>
          Exemplo: um pedido de {money(example)} entregue dá {number(pointsFrom500)} pontos, que valem {money(valueOf(pointsFrom500))} de desconto na próxima compra.
          {' '}O cliente precisa juntar {number(min)} pontos ({money(valueOf(min))}) para usar, e o desconto com pontos vai até {number(maxPct)}% dos produtos.
          {' '}Na prática, a loja devolve {((earn / (worth || 1)) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% do que o cliente gasta.
        </p>
        <div><Button variant="primary" onClick={save} loading={saving}>Salvar regras</Button></div>
      </div>
    </Panel>
  )
}
