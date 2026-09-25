import { useEffect, useState } from 'react'
import api, { asPage } from '../lib/api'
import { useResource } from '../lib/hooks'
import { dateTime, ago } from '../lib/format'
import { ORDER_STATUS } from '../lib/status'
import { PageHeader, Panel, Pagination, ErrorNote, Skeleton, EmptyState, Select, Button } from '../ui'
import { Receipt } from '../art/Art'
import s from './sections.module.css'

const ENTITY = {
  product: 'produto', order: 'pedido', coupon: 'cupom', banner: 'banner', ticker: 'aviso da faixa', category: 'categoria',
  brand: 'marca', admin: 'pessoa da equipe', user: 'pessoa da equipe', settings: 'configuração', setting: 'configuração',
  stock: 'estoque', shipping_rule: 'regra de frete', shipping_zone: 'zona de frete', supplier: 'fornecedor', review: 'avaliação',
  newsletter: 'inscrito da newsletter', newsletter_subscriber: 'inscrito da newsletter', loyalty: 'pontos de fidelidade',
  invoice: 'nota fiscal', payment: 'pagamento', privacy_request: 'pedido de privacidade (LGPD)', backup: 'backup do banco',
  email: 'e-mail da loja', chat_session: 'conversa', app_error: 'erro do sistema', customer: 'cliente', theme_preset: 'tema',
  custom_section: 'seção da vitrine', sections_config: 'seções da vitrine', appearance: 'aparência da loja',
  og_image: 'imagem de compartilhamento', whatsapp_notification: 'aviso de WhatsApp',
}
// Ações com nome composto, uma a uma (o verbo já leva o artigo certo).
const EXACT = {
  update_status: 'mudou o status de', update_tracking: 'salvou o rastreio de', update_stock: 'mexeu no estoque de',
  update_threshold: 'mudou o alerta de estoque de', add_note: 'anotou em', export_csv: 'baixou a planilha de',
  import_csv: 'importou planilha de', generate_label: 'gerou a etiqueta de', whatsapp_notification: 'avisou por WhatsApp sobre',
  whatsapp_sent: 'mandou WhatsApp sobre', cancel_unpaid: 'cancelou por falta de pagamento:', change_password: 'trocou a senha',
  logout_all: 'saiu de todos os aparelhos', recovery_codes: 'gerou novos códigos de recuperação', self_delete: 'apagou a própria conta',
  self_export: 'baixou os próprios dados', payment_approved: 'registrou pagamento aprovado em', payment_refunded: 'registrou estorno em',
  payment_rejected: 'registrou pagamento recusado em', payment_cancelled: 'registrou pagamento cancelado em',
  payment_expired: 'registrou Pix vencido em', payment_charged_back: 'registrou contestação em',
}
const ACTION = {
  create: 'criou', update: 'alterou', delete: 'apagou', deactivate: 'desativou', activate: 'ativou', status: 'mudou o status de',
  tracking: 'salvou o rastreio de', clone: 'duplicou', login: 'entrou no painel', import: 'importou', toggle: 'ligou ou desligou',
  password: 'trocou a senha', note: 'anotou em', approve: 'aprovou', reject: 'recusou', bonus: 'deu', redeem: 'descontou',
  refund: 'estornou', anonymize: 'apagou os dados de', export: 'baixou os dados de', emit: 'emitiu', cancel: 'cancelou',
  verify: 'testou a restauração do', download: 'baixou', test: 'testou', close: 'encerrou', upload: 'enviou',
  resolve: 'marcou como resolvido', reopen: 'reabriu', payment: 'atualizou o pagamento de',
}
// Ações que não falam de um registro (sem "de pedido #12").
const ALONE = new Set(['login', 'change_password', 'password', 'logout_all', 'recovery_codes', 'self_delete', 'self_export'])

function verbOf(raw) {
  const a = String(raw || '')
  const bulk = a.startsWith('bulk_')
  const bare = a.replace(/^bulk_/, '')
  return { bulk, bare, verb: EXACT[bare] || ACTION[bare.split(/[_:.]/)[0]] || 'mexeu em' }
}

function sentence(log) {
  const { bulk, bare, verb } = verbOf(log.action)
  if (ALONE.has(bare) || ALONE.has(bare.split(/[_:.]/)[0])) return verb
  const what = ENTITY[log.entity] || 'registro'
  return `${verb} ${bulk ? `vários (${what})` : what}${log.entity_id ? ` #${log.entity_id}` : ''}`
}

// Detalhes que o dono entende: nomes em português, status traduzido.
const KEY = {
  from: 'de', to: 'para', status: 'situação', tracking_code: 'rastreio', points: 'pontos', email: 'e-mail', description: 'motivo',
  amount: 'valor', rows: 'linhas', file: 'arquivo', size: 'tamanho', reason: 'motivo', justification: 'justificativa',
  order_id: 'pedido', stock_restored: 'estoque devolvido', filters: 'filtros', type: 'tipo', code: 'código', name: 'nome',
  active: 'ativo', value: 'valor', ok: 'deu certo', source: 'origem', order_status: 'pedido', payment_status: 'pagamento',
}
const HIDE = new Set(['provider_payment_id', 'status_detail', 'refund_id', 'ref', 'http', 'remote', 'counts', 'loyalty_reversed', 'session_id'])

function show(v) {
  if (v === true) return 'sim'
  if (v === false) return 'não'
  if (typeof v === 'string' && ORDER_STATUS[v]) return ORDER_STATUS[v].label.toLowerCase()
  if (v && typeof v === 'object') return Object.entries(v).filter(([, x]) => x !== '' && x != null).map(([k, x]) => `${KEY[k] || k} ${show(x)}`).join(', ')
  return String(v)
}

function details(raw) {
  if (!raw) return null
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw
    const entries = Object.entries(obj).filter(([k, v]) => !HIDE.has(k) && v !== undefined && v !== null && v !== '').slice(0, 8)
    if (!entries.length) return null
    return entries.map(([k, v]) => `${KEY[k] || k.replace(/_/g, ' ')}: ${show(v)}`).join('; ')
  } catch {
    return String(raw)
  }
}

const capital = (t) => `${t.charAt(0).toUpperCase()}${t.slice(1)}`
const iso = (d) => { const x = new Date(d); return Number.isNaN(x.getTime()) ? undefined : x.toISOString() }

export default function Activity() {
  const [page, setPage] = useState(1)
  const [entity, setEntity] = useState('')
  const [action, setAction] = useState('')
  useEffect(() => { setPage(1) }, [entity, action])
  const facets = useResource(() => api.get('/audit/facets').then(r => r.data || {}).catch(() => ({})), [])
  const logs = useResource(() => api.get('/audit', { params: { page, limit: 40, entity: entity || undefined, action: action || undefined } }).then(r => asPage(r.data, page)), [page, entity, action])
  const actionLabel = (a) => { const { bulk, verb } = verbOf(a); return `${capital(verb)}${bulk ? ' (vários de uma vez)' : ''}` }
  const rows = logs.data?.items || []
  const filtered = !!(entity || action)

  return (
    <div>
      <PageHeader title="Atividade" description="O que cada pessoa da equipe fez no painel, do mais novo para o mais antigo." />
      <div className={s.filterBar}>
        <Select aria-label="Filtrar pelo que foi mexido" className={s.filterSelect} placeholder="Tudo o que foi mexido" value={entity} onChange={e => setEntity(e.target.value)}
          options={(facets.data?.entities || []).map(v => ({ value: v, label: capital(ENTITY[v] || v.replace(/_/g, ' ')) }))} />
        <Select aria-label="Filtrar pelo tipo de ação" className={s.filterSelect} placeholder="Qualquer ação" value={action} onChange={e => setAction(e.target.value)}
          options={(facets.data?.actions || []).map(v => ({ value: v, label: actionLabel(v) }))} />
        {filtered && <Button variant="ghost" onClick={() => { setEntity(''); setAction('') }}>Limpar filtros</Button>}
      </div>
      <ErrorNote error={logs.error} onRetry={logs.reload} />
      <Panel>
        {logs.loading && !logs.data ? <Skeleton lines={8} height={26} /> : rows.length ? (
          <ol className={`${s.list} ${s.plainList}`} style={{ opacity: logs.loading ? 0.6 : 1 }}>
            {rows.map(l => {
              const extra = details(l.details)
              return (
                <li key={l.id} className={`${s.listItem} ${s.logRow}`}>
                  <span className={s.logDot} aria-hidden="true" />
                  <div className={s.listMain}>
                    <div><strong>{l.admin_username || 'O sistema'}</strong> {sentence(l)}</div>
                    {extra && <div className={`${s.listSub} ${s.wrapAny} ${s.preWrap}`}>{extra}</div>}
                  </div>
                  <time className={`${s.small} ${s.muted} ${s.nowrap}`} dateTime={iso(l.created_at)} title={dateTime(l.created_at)}>{ago(l.created_at)}</time>
                </li>
              )
            })}
          </ol>
        ) : !logs.error && (
          <EmptyState art={<Receipt />} title={filtered ? 'Nada com esses filtros' : 'Nenhuma atividade registrada'}>
            {filtered ? 'Troque ou limpe os filtros para ver mais.' : 'Cada alteração feita no painel entra aqui com o nome de quem fez.'}
          </EmptyState>
        )}
      </Panel>
      <Pagination page={page} pages={logs.data?.pages} onChange={setPage} />
    </div>
  )
}
