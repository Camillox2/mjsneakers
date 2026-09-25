import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FiPlus, FiSave } from 'react-icons/fi'
import api, { asList, asPage } from '../lib/api'
import { useDebounced, useResource } from '../lib/hooks'
import { number, ago, money, dateTime } from '../lib/format'
import { PageHeader, Panel, Button, SearchField, DataTable, Pagination, ErrorNote, Skeleton, EmptyState, Dialog, TextField, Switch, Badge, useToast } from '../ui'
import { Stars } from '../art/Art'
import s from './sections.module.css'

const RULE_KEYS = ['loyalty_enabled', 'loyalty_points_per_real', 'loyalty_points_per_real_discount', 'loyalty_max_redeem_percent', 'loyalty_min_redeem']
const DEFAULTS = { loyalty_enabled: 'true', loyalty_points_per_real: '10', loyalty_points_per_real_discount: '100', loyalty_max_redeem_percent: '30', loyalty_min_redeem: '500' }
const MAX_BONUS = 100000
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Cada movimento do extrato, dito do jeito do cliente.
const MOVES = {
  earn: { label: 'Ganhou', tone: 'good' },
  bonus: { label: 'Bônus da loja', tone: 'info' },
  redeem: { label: 'Usou', tone: 'neutral' },
  reversal: { label: 'Estorno', tone: 'serious' },
}

const toNumber = (v) => Number(String(v ?? '').replace(',', '.'))

export default function Loyalty() {
  const toast = useToast()
  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim(), 350)
  const [page, setPage] = useState(1)
  const [bonus, setBonus] = useState(null)
  const [bonusError, setBonusError] = useState({})
  const [saving, setSaving] = useState(false)
  const [history, setHistory] = useState(null)
  useEffect(() => { setPage(1) }, [q])

  const settings = useResource(() => api.get('/settings/admin').then(r => r.data || {}), [])
  const list = useResource(() => api.get('/loyalty', { params: { search: q || undefined, page, limit: 20 } }).then(r => asPage(r.data, page)), [q, page])

  // quanto vale cada ponto, pela regra salva (não por um número fixo)
  const worth = toNumber(settings.data?.loyalty_points_per_real_discount ?? DEFAULTS.loyalty_points_per_real_discount) || 100
  const pointsValue = (pts) => money((Number(pts) || 0) / worth)

  const openBonus = (email = '') => { setBonusError({}); setBonus({ email, points: '100', description: '' }) }

  const give = async (e) => {
    e?.preventDefault()
    if (saving) return
    const points = Number(bonus.points)
    const errs = {}
    if (!EMAIL_RE.test(bonus.email.trim())) errs.email = 'Informe um e-mail válido.'
    if (!Number.isInteger(points) || points < 1 || points > MAX_BONUS) errs.points = `Use um número inteiro de 1 a ${number(MAX_BONUS)}.`
    setBonusError(errs)
    if (Object.keys(errs).length) return
    setSaving(true)
    try {
      await api.post('/loyalty/bonus', { email: bonus.email.trim().toLowerCase(), points, description: bonus.description.trim() || 'Bônus da loja' })
      toast.good(`${number(points)} pontos dados para ${bonus.email.trim()}.`)
      setBonus(null)
      list.reload()
      // extrato aberto do mesmo cliente: saldo e movimentos já com o bônus
      const email = bonus.email.trim().toLowerCase()
      setHistory(h => (h && h.email === email ? { ...h, points: (Number(h.points) || 0) + points, tick: (h.tick || 0) + 1 } : h))
    } catch (err) { toast.error(err.message) } finally { setSaving(false) }
  }

  return (
    <div>
      <PageHeader
        title="Fidelidade"
        description="O cliente ganha pontos quando o pedido é entregue e usa como desconto no checkout, entrando na conta."
        actions={<Button variant="primary" icon={<FiPlus />} onClick={() => openBonus()}>Dar pontos</Button>}
      />
      <Rules remote={settings} />
      <div className={`${s.filterBar} ${s.filterBarTop}`}>
        <SearchField value={search} onChange={setSearch} placeholder="Nome ou e-mail" />
      </div>
      <ErrorNote error={list.error} onRetry={list.reload} />
      <Panel flush>
        {list.loading && !list.data ? <div className={s.pad}><Skeleton lines={5} height={32} /></div> : (
          <DataTable
            rowKey={c => c.id || c.customer_email}
            rows={list.data?.items || []}
            dim={list.loading}
            onRowClick={c => setHistory({ email: c.customer_email, name: c.customer_name, points: c.points })}
            columns={[
              { key: 'who', header: 'Cliente', primary: true, render: c => <div className={s.cellMain}><div className={s.listTitle}>{c.customer_name || 'Sem nome'}</div><div className={s.listSub}>{c.customer_email}</div></div> },
              { key: 'pts', header: 'Saldo', align: 'right', render: c => <span><strong>{number(c.points)}</strong> <span className={`${s.small} ${s.muted}`}>({pointsValue(c.points)})</span></span> },
              { key: 'earned', header: 'Ganhou', align: 'right', render: c => number(c.total_earned) },
              { key: 'used', header: 'Usou', align: 'right', render: c => number(c.total_redeemed) },
              { key: 'when', header: 'Última mudança', render: c => (c.updated_at ? <span className={s.nowrap}>{ago(c.updated_at)}</span> : '') },
            ]}
            empty={
              <EmptyState art={<Stars />} title={q ? 'Ninguém com essa busca' : 'Ninguém com pontos ainda'} action={q ? undefined : <Button icon={<FiPlus />} onClick={() => openBonus()}>Dar pontos</Button>}>
                {q ? 'Confira a grafia ou busque pelo e-mail.' : 'Os pontos entram quando o pedido é marcado como entregue. Também dá para dar pontos de presente.'}
              </EmptyState>
            }
          />
        )}
      </Panel>
      <Pagination page={page} pages={list.data?.pages} onChange={setPage} />

      <History open={history} worth={worth} onClose={() => setHistory(null)} onBonus={(email) => openBonus(email)} />

      <Dialog
        open={!!bonus}
        onClose={() => setBonus(null)}
        size="s"
        title="Dar pontos"
        description="O saldo do cliente sobe na hora e o movimento entra no extrato dele."
        footer={<><Button variant="ghost" onClick={() => setBonus(null)}>Cancelar</Button><Button variant="primary" type="submit" form="dar-pontos" loading={saving}>Dar pontos</Button></>}
      >
        {bonus && (
          <form id="dar-pontos" className={s.formGrid} onSubmit={give}>
            <TextField label="E-mail do cliente" type="email" value={bonus.email} onChange={e => setBonus(b => ({ ...b, email: e.target.value }))} error={bonusError.email} hint="O mesmo e-mail que o cliente usa nos pedidos." data-autofocus={!bonus.email || undefined} autoCapitalize="none" autoComplete="off" />
            <TextField
              label="Pontos"
              inputMode="numeric"
              value={bonus.points}
              onChange={e => setBonus(b => ({ ...b, points: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
              error={bonusError.points}
              hint={`Valem ${pointsValue(bonus.points)} de desconto.`}
              data-autofocus={bonus.email ? true : undefined}
            />
            <TextField label="Motivo" value={bonus.description} onChange={e => setBonus(b => ({ ...b, description: e.target.value }))} placeholder="Ex.: aniversário, troca atrasada" maxLength={120} hint="Aparece no extrato do cliente." />
          </form>
        )}
      </Dialog>
    </div>
  )
}

// Extrato de pontos de um cliente (os últimos 50 movimentos).
function History({ open, worth, onClose, onBonus }) {
  const moves = useResource(
    () => (open ? api.get(`/loyalty/history/${encodeURIComponent(open.email)}`).then(r => asList(r.data)) : Promise.resolve(null)),
    [open?.email, open?.tick]
  )
  const rows = open && moves.data ? moves.data : null
  return (
    <Dialog
      open={!!open}
      onClose={onClose}
      title={open?.name || 'Extrato de pontos'}
      description={open ? `${open.email}. Saldo: ${number(open.points)} pontos, que valem ${money((Number(open.points) || 0) / worth)}.` : ''}
      footer={open && <Button icon={<FiPlus />} onClick={() => onBonus(open.email)}>Dar pontos para este cliente</Button>}
    >
      <ErrorNote error={moves.error} onRetry={moves.reload} />
      {!rows ? (!moves.error && <Skeleton lines={5} height={26} />) : rows.length ? (
        <ul className={`${s.list} ${s.plainList}`} aria-label="Movimentos de pontos">
          {rows.map(m => {
            const kind = MOVES[m.type] || { label: 'Movimento', tone: 'neutral' }
            const pts = Number(m.points) || 0
            return (
              <li key={m.id} className={s.listItem}>
                <div className={s.listMain}>
                  <div className={s.listTitle}><Badge tone={kind.tone}>{kind.label}</Badge></div>
                  <div className={`${s.listSub} ${s.wrapAny}`}>
                    {m.description || ''}{m.order_id ? <> (<Link className={s.inlineLink} to={`/admin/pedidos/${m.order_id}`}>pedido #{m.order_id}</Link>)</> : null}
                  </div>
                  <div className={`${s.small} ${s.muted}`}>{dateTime(m.created_at)}</div>
                </div>
                <div className={`${s.listEnd} ${s.strong}`}>{pts > 0 ? '+' : ''}{number(pts)}</div>
              </li>
            )
          })}
        </ul>
      ) : <p className={`${s.muted} ${s.flush}`}>Nenhum movimento ainda.</p>}
    </Dialog>
  )
}

// Regras do programa: quanto se ganha, quanto vale e até onde pode descontar.
function Rules({ remote }) {
  const toast = useToast()
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const initial = remote.data ? Object.fromEntries(RULE_KEYS.map(k => [k, String(remote.data[k] ?? DEFAULTS[k])])) : null
  useEffect(() => {
    if (remote.data) setForm(Object.fromEntries(RULE_KEYS.map(k => [k, String(remote.data[k] ?? DEFAULTS[k])])))
  }, [remote.data])

  if (!form) {
    return (
      <Panel title="Regras dos pontos">
        <ErrorNote error={remote.error} onRetry={remote.reload} />
        {!remote.error && <Skeleton lines={3} height={26} />}
      </Panel>
    )
  }

  const n = (k) => toNumber(form[k])
  const earn = n('loyalty_points_per_real')
  const worth = n('loyalty_points_per_real_discount')
  const maxPct = n('loyalty_max_redeem_percent')
  const min = n('loyalty_min_redeem')
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e?.target ? e.target.value : e }))
  const example = 500
  const pointsFrom500 = Math.floor(example * (earn || 0))
  const valueOf = (pts) => (worth > 0 ? pts / worth : 0)
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)
  const errors = {
    loyalty_points_per_real: !(earn >= 0 && earn <= 1000) ? 'De 0 a 1.000.' : '',
    loyalty_points_per_real_discount: !(worth >= 1 && worth <= 100000) ? 'De 1 a 100.000.' : '',
    loyalty_max_redeem_percent: !(maxPct >= 0 && maxPct <= 100) ? 'De 0 a 100%.' : '',
    loyalty_min_redeem: !(Number.isInteger(min) && min >= 0 && min <= 10000000) ? 'Um número inteiro, 0 ou mais.' : '',
  }
  const invalid = Object.values(errors).some(Boolean)

  const save = async (e) => {
    e?.preventDefault()
    if (invalid || saving) return
    setSaving(true)
    try {
      await api.put('/settings', { settings: Object.fromEntries(RULE_KEYS.map(k => [k, k === 'loyalty_enabled' ? form[k] : String(n(k))])) })
      toast.good('Regras dos pontos salvas.')
      remote.reload()
    } catch (err) { toast.error(err.message) } finally { setSaving(false) }
  }

  return (
    <Panel title="Regras dos pontos">
      <form className={s.formGrid} onSubmit={save}>
        <Switch checked={form.loyalty_enabled === 'true'} onChange={v => setForm(f => ({ ...f, loyalty_enabled: v ? 'true' : 'false' }))} label="Programa ligado" description="Desligado, ninguém ganha nem usa pontos; os saldos ficam guardados." />
        <div className={s.formRow}>
          <TextField label="Pontos por R$ 1 gasto" inputMode="decimal" value={form.loyalty_points_per_real} onChange={set('loyalty_points_per_real')} error={errors.loyalty_points_per_real || undefined} hint="Contados quando o pedido é entregue." />
          <TextField label="Pontos para R$ 1 de desconto" inputMode="numeric" value={form.loyalty_points_per_real_discount} onChange={set('loyalty_points_per_real_discount')} error={errors.loyalty_points_per_real_discount || undefined} />
          <TextField label="Desconto máximo com pontos" suffix="%" inputMode="numeric" value={form.loyalty_max_redeem_percent} onChange={set('loyalty_max_redeem_percent')} error={errors.loyalty_max_redeem_percent || undefined} hint="Do valor dos produtos, sem frete." />
          <TextField label="Mínimo de pontos para usar" inputMode="numeric" value={form.loyalty_min_redeem} onChange={set('loyalty_min_redeem')} error={errors.loyalty_min_redeem || undefined} />
        </div>
        {!invalid && (
          <p className={s.callout}>
            Exemplo: um pedido de {money(example)} entregue dá {number(pointsFrom500)} pontos, que valem {money(valueOf(pointsFrom500))} de desconto na próxima compra.
            {' '}O cliente precisa juntar {number(min)} pontos ({money(valueOf(min))}) para usar, e o desconto com pontos vai até {number(maxPct)}% dos produtos.
            {' '}Na prática, a loja devolve {((earn / (worth || 1)) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% do que o cliente gasta.
          </p>
        )}
        <div><Button type="submit" variant="primary" icon={<FiSave />} loading={saving} disabled={!dirty || invalid}>Salvar regras</Button></div>
      </form>
    </Panel>
  )
}
