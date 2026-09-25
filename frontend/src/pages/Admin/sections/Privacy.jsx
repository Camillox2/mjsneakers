import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FiDownload, FiUserX, FiCheck, FiX } from 'react-icons/fi'
import api, { asList, downloadFile } from '../lib/api'
import { useResource } from '../lib/hooks'
import { ago, dateTime } from '../lib/format'
import { PageHeader, Panel, Button, Segmented, DataTable, ErrorNote, Skeleton, EmptyState, Dialog, TextField, Badge, useConfirm, useToast } from '../ui'
import { Envelope } from '../art/Art'
import s from './sections.module.css'

// Pedidos de titular (LGPD, art. 18): cópia, correção, exclusão e parar de
// receber e-mails. O prazo que a loja se compromete a cumprir é de 15 dias.

const TYPES = {
  access: 'Cópia dos dados',
  correction: 'Corrigir dados',
  deletion: 'Apagar dados',
  revoke_marketing: 'Parar de receber e-mails',
}
const STATUS = {
  pending_verification: { label: 'Esperando o código', tone: 'neutral' },
  open: { label: 'Para responder', tone: 'warning' },
  done: { label: 'Atendido', tone: 'good' },
  rejected: { label: 'Recusado', tone: 'critical' },
}
const DAY = 24 * 60 * 60 * 1000

function deadline(r) {
  const base = new Date(r.verified_at || r.created_at).getTime()
  const left = Math.ceil((base + 15 * DAY - Date.now()) / DAY)
  return left
}

export default function Privacy() {
  const toast = useToast()
  const confirm = useConfirm()
  const [status, setStatus] = useState('open')
  const list = useResource(() => api.get('/privacy/requests', { params: status ? { status } : {} }).then(r => asList(r.data)), [status])
  const [open, setOpen] = useState(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState('')

  const show = (r) => { setOpen(r); setNote(r.admin_note || '') }

  const exportData = async () => {
    setBusy('export')
    try {
      await downloadFile(`/privacy/requests/${open.id}/export`, undefined, `dados-titular-${open.id}.json`)
      toast.good('Arquivo baixado. Mande para o titular por um canal seguro.')
    } catch (err) { toast.error(err.message) } finally { setBusy('') }
  }

  const anonymize = async () => {
    const ok = await confirm({
      title: `Apagar os dados de ${open.email}?`,
      message: 'Some a conta, a newsletter, os avisos e as conversas; os pedidos ficam anônimos. Pedidos com nota fiscal guardam só o que a lei manda. Não dá para desfazer.',
      confirmLabel: 'Apagar os dados',
      tone: 'danger',
    })
    if (!ok) return
    setBusy('anon')
    try {
      const { data } = await api.post(`/privacy/requests/${open.id}/anonymize`)
      toast.good(data?.message || 'Dados apagados.')
      await api.put(`/privacy/requests/${open.id}`, { status: 'done', admin_note: note || 'Dados apagados ou anonimizados.' })
      setOpen(null); list.reload()
    } catch (err) { toast.error(err.message) } finally { setBusy('') }
  }

  const finish = async (next) => {
    setBusy(next)
    try {
      await api.put(`/privacy/requests/${open.id}`, { status: next, admin_note: note })
      toast.good(next === 'done' ? 'Pedido marcado como atendido.' : 'Pedido recusado.')
      setOpen(null); list.reload()
    } catch (err) { toast.error(err.message) } finally { setBusy('') }
  }

  return (
    <div>
      <PageHeader
        title="Privacidade (LGPD)"
        description="Pedidos que clientes fazem em /meus-dados. Responda em até 15 dias."
        actions={<Link className={s.linkBtn} to="/admin/configuracoes#legal">Editar política e termos</Link>}
      />
      <div style={{ marginBottom: 14 }}>
        <Segmented label="Situação" value={status} onChange={setStatus} options={[
          { value: 'open', label: 'Para responder' },
          { value: 'pending_verification', label: 'Esperando código' },
          { value: 'done', label: 'Atendidos' },
          { value: '', label: 'Todos' },
        ]} />
      </div>
      <ErrorNote error={list.error} onRetry={list.reload} />
      <Panel flush>
        {list.loading && !list.data ? <div style={{ padding: 18 }}><Skeleton lines={5} height={30} /></div> : (
          <DataTable
            rows={list.data || []}
            onRowClick={show}
            columns={[
              { key: 'email', header: 'Titular', primary: true, render: r => <span style={{ overflowWrap: 'anywhere' }}>{r.email}</span> },
              { key: 'type', header: 'Pedido', render: r => TYPES[r.type] || r.type },
              { key: 'st', header: 'Situação', render: r => <Badge tone={STATUS[r.status]?.tone}>{STATUS[r.status]?.label || r.status}</Badge> },
              {
                key: 'due', header: 'Prazo',
                render: r => (r.status === 'open' ? (() => { const d = deadline(r); return <Badge tone={d <= 3 ? 'critical' : d <= 7 ? 'warning' : 'neutral'}>{d < 0 ? `atrasado ${-d} d` : `${d} dias`}</Badge> })() : ''),
              },
              { key: 'when', header: 'Pedido em', render: r => <span className={s.nowrap} title={dateTime(r.created_at)}>{ago(r.created_at)}</span> },
            ]}
            empty={<EmptyState art={<Envelope />} title="Nenhum pedido aqui">Quando alguém pedir uma cópia ou para apagar os dados, o pedido chega aqui depois que a pessoa confirma o e-mail.</EmptyState>}
          />
        )}
      </Panel>

      <Dialog
        open={!!open}
        onClose={() => setOpen(null)}
        title={open ? TYPES[open.type] || 'Pedido' : ''}
        description={open ? `${open.email}, ${dateTime(open.created_at)}` : ''}
        footer={open && open.status === 'open' ? (
          <>
            <Button variant="ghost" icon={<FiX />} loading={busy === 'rejected'} onClick={() => finish('rejected')}>Recusar</Button>
            <Button variant="primary" icon={<FiCheck />} loading={busy === 'done'} onClick={() => finish('done')}>Marcar como atendido</Button>
          </>
        ) : null}
      >
        {open && (
          <div className={s.formGrid}>
            <dl className={s.kv}>
              <dt>Situação</dt><dd><Badge tone={STATUS[open.status]?.tone}>{STATUS[open.status]?.label}</Badge></dd>
              <dt>E-mail confirmado</dt><dd>{open.verified_at ? dateTime(open.verified_at) : 'Ainda não'}</dd>
              {open.message && <><dt>Mensagem</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{open.message}</dd></>}
            </dl>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button icon={<FiDownload />} loading={busy === 'export'} onClick={exportData} disabled={!open.verified_at}>Baixar os dados da pessoa</Button>
              {(open.type === 'deletion') && <Button variant="danger" icon={<FiUserX />} loading={busy === 'anon'} onClick={anonymize} disabled={!open.verified_at}>Apagar os dados</Button>}
            </div>
            {open.type === 'revoke_marketing' && <p className={s.small} style={{ margin: 0 }}>Tire o e-mail da lista em Newsletter e marque como atendido.</p>}
            {open.type === 'correction' && <p className={s.small} style={{ margin: 0 }}>Corrija o que a pessoa pediu no pedido ou no cadastro e anote o que foi feito.</p>}
            <TextField label="Anotação (o que foi feito)" multiline value={note} onChange={e => setNote(e.target.value)} maxLength={1000} />
            <p className={s.small} style={{ color: 'var(--a-muted)', margin: 0 }}>Baixar ou apagar dados exige a verificação em duas etapas ligada na sua conta.</p>
          </div>
        )}
      </Dialog>
    </div>
  )
}
