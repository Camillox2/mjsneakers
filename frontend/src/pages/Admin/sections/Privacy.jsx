import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FiDownload, FiUserX, FiCheck, FiX, FiMail, FiSave, FiShield } from 'react-icons/fi'
import api, { asPage, downloadFile } from '../lib/api'
import { useResource } from '../lib/hooks'
import { useAdmin } from '../lib/context'
import { ago, date, dateTime, number } from '../lib/format'
import { PageHeader, Panel, Button, Segmented, DataTable, Pagination, ErrorNote, Skeleton, EmptyState, Dialog, TextField, Badge, useConfirm, useToast } from '../ui'
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
  pending_verification: { label: 'Esperando a pessoa confirmar', tone: 'neutral' },
  open: { label: 'Para responder', tone: 'warning' },
  done: { label: 'Atendido', tone: 'good' },
  rejected: { label: 'Recusado', tone: 'critical' },
}
// O que fazer em cada tipo de pedido, dito para quem atende.
const HOW = {
  access: 'Baixe os dados da pessoa e mande o arquivo para o e-mail dela. Depois, marque como atendido.',
  correction: 'Corrija o que a pessoa pediu (no pedido ou no cadastro), anote o que foi feito e marque como atendido.',
  deletion: 'Apague os dados: a conta, a newsletter e as conversas somem e os pedidos ficam anônimos. O pedido é marcado como atendido sozinho.',
  revoke_marketing: 'O e-mail já saiu da newsletter quando a pessoa confirmou o pedido. Confira a anotação e marque como atendido.',
}
const DAY = 24 * 60 * 60 * 1000

// Dias que faltam para os 15 dias, contados de quando a pessoa confirmou o e-mail.
function daysLeft(r) {
  const base = new Date(r.verified_at || r.created_at).getTime()
  return Math.ceil((base + 15 * DAY - Date.now()) / DAY)
}

function Deadline({ r }) {
  if (r.status === 'pending_verification') return <span className={s.muted}>Conta depois da confirmação</span>
  if (r.status !== 'open') return <span className={s.muted}>Encerrado</span>
  const d = daysLeft(r)
  const due = new Date(new Date(r.verified_at || r.created_at).getTime() + 15 * DAY)
  return (
    <Badge tone={d <= 3 ? 'critical' : d <= 7 ? 'warning' : 'neutral'} title={`Prazo: ${date(due)}`}>
      {d < 0 ? `Atrasado ${-d} ${d === -1 ? 'dia' : 'dias'}` : d === 0 ? 'Vence hoje' : `${d} ${d === 1 ? 'dia' : 'dias'}`}
    </Badge>
  )
}

export default function Privacy() {
  const toast = useToast()
  const confirm = useConfirm()
  const { user } = useAdmin()
  const [status, setStatus] = useState('open')
  const [page, setPage] = useState(1)
  useEffect(() => { setPage(1) }, [status])
  const list = useResource(
    () => api.get('/privacy/requests', { params: { status: status || undefined, page, limit: 20 } }).then(r => ({ ...asPage(r.data, page), counts: r.data?.counts || {} })),
    [status, page]
  )
  const [open, setOpen] = useState(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState('')
  const has2fa = !!user?.totp_enabled

  const show = (r) => { setOpen(r); setNote(r.admin_note || '') }
  const done = () => { setOpen(null); list.reload() }
  const noteChanged = open && note.trim() !== (open.admin_note || '').trim()

  const exportData = async () => {
    setBusy('export')
    try {
      await downloadFile(`/privacy/requests/${open.id}/export`, undefined, `dados-titular-${open.id}.json`)
      toast.good('Dados baixados. Mande o arquivo só para o e-mail da pessoa, nunca para outro endereço.')
    } catch (err) { toast.error(err.message) } finally { setBusy('') }
  }

  const anonymize = async () => {
    const ok = await confirm({
      title: `Apagar os dados de ${open.email}?`,
      message: 'Somem a conta, a newsletter, os avisos de reposição e as conversas; os pedidos ficam anônimos. Pedidos com nota fiscal guardam só o que a lei manda. Não dá para desfazer.',
      confirmLabel: 'Apagar os dados',
      tone: 'danger',
    })
    if (!ok) return
    setBusy('anon')
    try {
      // a anotação digitada vai antes: o servidor acrescenta o resumo do que apagou
      if (noteChanged) await api.put(`/privacy/requests/${open.id}`, { admin_note: note.trim() })
      const { data } = await api.post(`/privacy/requests/${open.id}/anonymize`)
      const kept = Number(data?.summary?.orders_kept_fiscal) || 0
      toast.good(`Dados apagados e pedido marcado como atendido.${kept ? ` ${number(kept)} ${kept === 1 ? 'pedido com nota fiscal manteve' : 'pedidos com nota fiscal mantiveram'} os dados que a lei exige.` : ''}`)
      done()
    } catch (err) { toast.error(err.message) } finally { setBusy('') }
  }

  const finish = async (next) => {
    if (next === 'rejected') {
      if (!note.trim()) { toast.error('Escreva na anotação por que o pedido foi recusado. A pessoa tem direito de saber o motivo.'); return }
      const ok = await confirm({
        title: 'Recusar este pedido?',
        message: 'Recuse só quando a lei permite (por exemplo, dados que a loja precisa guardar por obrigação fiscal). Avise a pessoa por e-mail com o motivo.',
        confirmLabel: 'Recusar pedido',
        tone: 'danger',
      })
      if (!ok) return
    }
    setBusy(next)
    try {
      await api.put(`/privacy/requests/${open.id}`, { status: next, admin_note: note.trim() })
      toast.good(next === 'done' ? 'Pedido marcado como atendido.' : 'Pedido recusado.')
      done()
    } catch (err) { toast.error(err.message) } finally { setBusy('') }
  }

  const saveNote = async () => {
    setBusy('note')
    try {
      await api.put(`/privacy/requests/${open.id}`, { admin_note: note.trim() })
      toast.good('Anotação salva.')
      done()
    } catch (err) { toast.error(err.message) } finally { setBusy('') }
  }

  const c = list.data?.counts || {}
  const rows = list.data?.items || []
  const isOpen = open?.status === 'open'

  return (
    <div>
      <PageHeader
        title="Privacidade (LGPD)"
        description="Pedidos que clientes fazem na página Meus dados da loja. A lei dá 15 dias para responder, contados de quando a pessoa confirma o e-mail."
        actions={<Link className={s.linkBtn} to="/admin/configuracoes#legal">Editar política e termos</Link>}
      />
      <div className={s.filterBar}>
        <Segmented label="Situação" value={status} onChange={setStatus} options={[
          { value: 'open', label: 'Para responder', count: c.open || undefined },
          { value: 'pending_verification', label: 'Esperando confirmar', count: c.pending_verification || undefined },
          { value: 'done', label: 'Atendidos' },
          { value: 'rejected', label: 'Recusados' },
          { value: '', label: 'Todos' },
        ]} />
      </div>
      <ErrorNote error={list.error} onRetry={list.reload} />
      <Panel flush>
        {list.loading && !list.data ? <div className={s.pad}><Skeleton lines={5} height={30} /></div> : (
          <DataTable
            rows={rows}
            onRowClick={show}
            dim={list.loading}
            columns={[
              { key: 'email', header: 'Pessoa', primary: true, render: r => <span className={s.wrapAny}>{r.email}</span> },
              { key: 'type', header: 'Pedido', render: r => TYPES[r.type] || r.type },
              { key: 'st', header: 'Situação', render: r => <Badge tone={STATUS[r.status]?.tone}>{STATUS[r.status]?.label || r.status}</Badge> },
              { key: 'due', header: 'Prazo', render: r => <Deadline r={r} /> },
              { key: 'when', header: 'Pedido em', render: r => <span className={s.nowrap}>{date(r.created_at)}, {ago(r.created_at)}</span> },
            ]}
            empty={
              <EmptyState art={<Envelope />} title={status === 'open' ? 'Nenhum pedido para responder' : 'Nenhum pedido aqui'}>
                Quando alguém pedir uma cópia ou para apagar os dados, o pedido chega aqui depois que a pessoa confirma o e-mail.
              </EmptyState>
            }
          />
        )}
      </Panel>
      <Pagination page={page} pages={list.data?.pages} onChange={setPage} />

      <Dialog
        open={!!open}
        onClose={() => setOpen(null)}
        title={open ? TYPES[open.type] || 'Pedido' : ''}
        description={open ? `${open.email}, pedido em ${dateTime(open.created_at)}` : ''}
        footer={open ? (isOpen ? (
          <>
            <Button variant="ghost" icon={<FiX />} loading={busy === 'rejected'} disabled={!!busy} onClick={() => finish('rejected')}>Recusar</Button>
            <Button variant="primary" icon={<FiCheck />} loading={busy === 'done'} disabled={!!busy} onClick={() => finish('done')}>Marcar como atendido</Button>
          </>
        ) : (
          <Button icon={<FiSave />} loading={busy === 'note'} disabled={!noteChanged || !!busy} onClick={saveNote}>Salvar anotação</Button>
        )) : null}
      >
        {open && (
          <div className={s.formGrid}>
            <dl className={s.kv}>
              <dt>Situação</dt><dd><Badge tone={STATUS[open.status]?.tone}>{STATUS[open.status]?.label || open.status}</Badge></dd>
              <dt>E-mail confirmado</dt><dd>{open.verified_at ? dateTime(open.verified_at) : 'Ainda não'}</dd>
              {isOpen && <><dt>Prazo</dt><dd><Deadline r={open} /></dd></>}
              {open.message && <><dt>Mensagem</dt><dd className={s.preWrap}>{open.message}</dd></>}
            </dl>

            {isOpen && <p className={s.callout}>{HOW[open.type]}</p>}
            {open.status === 'pending_verification' && <p className={s.callout}>A pessoa ainda não digitou o código que foi para o e-mail dela. Sem isso, não dá para saber se o pedido é mesmo do dono do e-mail, então nada pode ser feito ainda.</p>}

            <div className={s.rowActions}>
              {open.status !== 'pending_verification' && (
                <Button icon={<FiDownload />} loading={busy === 'export'} onClick={exportData} disabled={!has2fa || !!busy}>Baixar os dados da pessoa</Button>
              )}
              {open.type === 'deletion' && isOpen && (
                <Button variant="danger" icon={<FiUserX />} loading={busy === 'anon'} onClick={anonymize} disabled={!has2fa || !!busy}>Apagar os dados</Button>
              )}
              <Button variant="ghost" icon={<FiMail />} onClick={() => { window.location.href = `mailto:${open.email}?subject=${encodeURIComponent('Seu pedido sobre dados pessoais')}` }}>Escrever para a pessoa</Button>
            </div>
            {!has2fa && open.status !== 'pending_verification' && (
              <p className={`${s.small} ${s.hintLine}`}>
                <FiShield aria-hidden="true" />
                <span>Baixar ou apagar dados exige a verificação em duas etapas na sua conta. <Link className={s.linkBtn} to="/admin/equipe?duas-etapas=1">Ligar agora</Link></span>
              </p>
            )}

            <TextField
              label="Anotação (o que foi feito)"
              multiline
              value={note}
              onChange={e => setNote(e.target.value)}
              maxLength={2000}
              hint={isOpen ? 'Fica guardada como prova do atendimento. Para recusar, escreva o motivo aqui.' : 'Fica guardada como prova do atendimento.'}
            />
          </div>
        )}
      </Dialog>
    </div>
  )
}
