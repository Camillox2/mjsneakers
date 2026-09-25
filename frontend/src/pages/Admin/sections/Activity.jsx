import { useEffect, useState } from 'react'
import api, { asPage } from '../lib/api'
import { useResource } from '../lib/hooks'
import { dateTime, ago } from '../lib/format'
import { PageHeader, Panel, Pagination, ErrorNote, Skeleton, EmptyState, Select } from '../ui'
import { Receipt } from '../art/Art'
import s from './sections.module.css'

const ENTITY = {
  product: 'produto', order: 'pedido', coupon: 'cupom', banner: 'banner', ticker: 'aviso da faixa', category: 'categoria',
  brand: 'marca', admin: 'pessoa da equipe', user: 'pessoa da equipe', settings: 'configuração', setting: 'configuração',
  stock: 'estoque', shipping_rule: 'regra de frete', shipping_zone: 'zona de frete', supplier: 'fornecedor', review: 'avaliação',
  newsletter: 'inscrito da newsletter', loyalty: 'pontos de fidelidade',
}
const ACTION = {
  create: 'criou', update: 'alterou', delete: 'apagou', deactivate: 'desativou', activate: 'ativou', status: 'mudou o status de',
  tracking: 'salvou o rastreio de', clone: 'duplicou', login: 'entrou no painel', import: 'importou', toggle: 'ligou ou desligou',
  password: 'trocou a senha', note: 'anotou em',
}

function sentence(log) {
  const raw = String(log.action || '')
  const bulk = raw.startsWith('bulk_')
  const key = raw.replace(/^bulk_/, '').split(/[_:.]/)[0]
  const verb = ACTION[key] || raw.replace(/_/g, ' ')
  const what = ENTITY[log.entity] || log.entity || ''
  if (key === 'login' || key === 'password') return verb
  return `${verb} ${bulk ? `vários (${what})` : what}${log.entity_id ? ` #${log.entity_id}` : ''}`
}

function details(raw) {
  if (!raw) return null
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw
    const entries = Object.entries(obj).slice(0, 8)
    if (!entries.length) return null
    return entries.map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(', ')
  } catch {
    return String(raw)
  }
}

export default function Activity() {
  const [page, setPage] = useState(1)
  const [entity, setEntity] = useState('')
  const [action, setAction] = useState('')
  useEffect(() => { setPage(1) }, [entity, action])
  const facets = useResource(() => api.get('/audit/facets').then(r => r.data || {}).catch(() => ({})), [])
  const logs = useResource(() => api.get('/audit', { params: { page, limit: 40, entity: entity || undefined, action: action || undefined } }).then(r => asPage(r.data, page)), [page, entity, action])
  const verbOf = (a) => { const k = String(a).replace(/^bulk_/, '').split(/[_:.]/)[0]; const v = ACTION[k] || String(a).replace(/_/g, ' '); return `${v.charAt(0).toUpperCase()}${v.slice(1)}${String(a).startsWith('bulk_') ? ' (em massa)' : ''}` }
  const rows = logs.data?.items || []

  return (
    <div>
      <PageHeader title="Atividade" description="O que cada pessoa da equipe fez no painel, do mais novo para o mais antigo." />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <Select aria-label="O que foi mexido" style={{ width: 'auto', minWidth: 190 }} placeholder="Tudo" value={entity} onChange={e => setEntity(e.target.value)}
          options={(facets.data?.entities || []).map(v => ({ value: v, label: (ENTITY[v] || v).replace(/^./, ch => ch.toUpperCase()) }))} />
        <Select aria-label="Tipo de ação" style={{ width: 'auto', minWidth: 190 }} placeholder="Qualquer ação" value={action} onChange={e => setAction(e.target.value)}
          options={(facets.data?.actions || []).map(v => ({ value: v, label: verbOf(v) }))} />
      </div>
      <ErrorNote error={logs.error} onRetry={logs.reload} />
      <Panel>
        {logs.loading && !logs.data ? <Skeleton lines={8} height={26} /> : rows.length ? (
          <ol className={s.list} style={{ margin: 0, padding: 0, listStyle: 'none', opacity: logs.loading ? 0.6 : 1 }}>
            {rows.map(l => {
              const extra = details(l.details)
              return (
                <li key={l.id} className={s.listItem} style={{ alignItems: 'flex-start' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--a-series-1)', marginTop: 8, flexShrink: 0 }} aria-hidden="true" />
                  <div className={s.listMain}>
                    <div><strong>{l.admin_username || 'Sistema'}</strong> {sentence(l)}</div>
                    {extra && <div className={s.listSub} style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{extra}</div>}
                  </div>
                  <span className={`${s.small} ${s.muted} ${s.nowrap}`} title={dateTime(l.created_at)}>{ago(l.created_at)}</span>
                </li>
              )
            })}
          </ol>
        ) : <EmptyState art={<Receipt />} title="Nenhuma atividade registrada">Cada alteração feita no painel entra aqui com o nome de quem fez.</EmptyState>}
      </Panel>
      <Pagination page={page} pages={logs.data?.pages} onChange={setPage} />
    </div>
  )
}
