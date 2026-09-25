import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FiCheck, FiX, FiTrash2 } from 'react-icons/fi'
import api, { asPage } from '../lib/api'
import { useResource } from '../lib/hooks'
import { useAdmin } from '../lib/context'
import { ago } from '../lib/format'
import { getImageUrl } from '../../../utils/imageHelper'
import { PageHeader, Panel, Button, Segmented, ErrorNote, Skeleton, EmptyState, Dialog, Badge, Pagination, useConfirm, useToast } from '../ui'
import { Stars as StarsArt } from '../art/Art'
import s from './sections.module.css'

const STATUS = { pending: { label: 'Para moderar', tone: 'warning' }, approved: { label: 'Publicada', tone: 'good' }, rejected: { label: 'Recusada', tone: 'critical' } }

function Rating({ value }) {
  const n = Math.max(0, Math.min(5, Number(value) || 0))
  return (
    <span role="img" aria-label={`${n} de 5 estrelas`} style={{ display: 'inline-flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <svg key={i} width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"
            fill={i <= n ? 'var(--a-warning)' : 'none'} stroke={i <= n ? 'var(--a-warning)' : 'var(--a-line-strong)'} strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      ))}
    </span>
  )
}

export default function Reviews() {
  const toast = useToast()
  const confirm = useConfirm()
  const { refreshCounts } = useAdmin()
  const [status, setStatus] = useState('pending')
  const [photo, setPhoto] = useState(null)
  const [busy, setBusy] = useState(null)
  const [page, setPage] = useState(1)
  useEffect(() => { setPage(1) }, [status])
  const list = useResource(() => api.get('/reviews', { params: { status: status || undefined, page, limit: 24 } }).then(r => asPage(r.data, page)), [status, page])

  const act = async (r, next) => {
    setBusy(`${r.id}-${next}`)
    try {
      await api.put(`/reviews/${r.id}/status`, { status: next })
      toast.good(next === 'approved' ? 'Avaliação publicada na página do produto.' : 'Avaliação recusada. Ela não aparece na loja.')
      list.reload(); refreshCounts()
    } catch (err) { toast.error(err.message) } finally { setBusy(null) }
  }

  const remove = async (r) => {
    if (!(await confirm({ title: 'Apagar esta avaliação?', message: 'Some de vez, inclusive do histórico.', confirmLabel: 'Apagar', tone: 'danger' }))) return
    try { await api.delete(`/reviews/${r.id}`); toast.good('Avaliação apagada.'); list.reload(); refreshCounts() } catch (err) { toast.error(err.message) }
  }

  const rows = list.data?.items || []

  return (
    <div>
      <PageHeader title="Avaliações" description="Nada aparece na loja antes de você publicar." />
      <div style={{ marginBottom: 14 }}>
        <Segmented label="Situação" value={status} onChange={setStatus} options={[
          { value: 'pending', label: 'Para moderar' },
          { value: 'approved', label: 'Publicadas' },
          { value: 'rejected', label: 'Recusadas' },
          { value: '', label: 'Todas' },
        ]} />
      </div>
      <ErrorNote error={list.error} onRetry={list.reload} />
      {list.loading && !list.data ? <Panel><Skeleton lines={6} height={30} /></Panel> : rows.length ? (
        <div className={s.cardGrid} style={{ opacity: list.loading ? 0.6 : 1 }}>
          {rows.map(r => (
            <Panel key={r.id}>
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Rating value={r.rating} />
                  <Badge tone={STATUS[r.status]?.tone}>{STATUS[r.status]?.label || r.status}</Badge>
                </div>
                {r.comment ? <p style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{r.comment}</p> : <p className={s.muted} style={{ margin: 0 }}>Sem comentário, só a nota.</p>}
                {r.photo_url && (
                  <button type="button" onClick={() => setPhoto(r)} style={{ border: 0, padding: 0, background: 'none', cursor: 'zoom-in', justifySelf: 'start' }} aria-label="Ver foto da avaliação">
                    <img className={`${s.thumb} ${s.thumbL}`} src={getImageUrl(r.photo_url, 'foto')} alt="" loading="lazy" />
                  </button>
                )}
                <div className={s.small}>
                  <span className={s.strong}>{r.customer_name}</span>{r.customer_email ? <span className={s.muted}> ({r.customer_email})</span> : null}
                  <div className={s.muted}>
                    {r.product_id ? <Link className={s.linkBtn} style={{ minHeight: 0 }} to={`/admin/produtos/${r.product_id}`}>{r.product_name || `Produto ${r.product_id}`}</Link> : 'Produto removido'}, {ago(r.created_at)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {r.status !== 'approved' && <Button size="small" variant="primary" icon={<FiCheck />} loading={busy === `${r.id}-approved`} onClick={() => act(r, 'approved')}>Publicar</Button>}
                  {r.status !== 'rejected' && <Button size="small" icon={<FiX />} loading={busy === `${r.id}-rejected`} onClick={() => act(r, 'rejected')}>Recusar</Button>}
                  <Button size="small" variant="ghost" icon={<FiTrash2 />} aria-label="Apagar avaliação" onClick={() => remove(r)} />
                </div>
              </div>
            </Panel>
          ))}
        </div>
      ) : (
        <Panel>
          <EmptyState art={<StarsArt />} title={status === 'pending' ? 'Nada para moderar' : 'Nenhuma avaliação aqui'}>
            {status === 'pending' ? 'Quando um cliente avaliar um produto, a avaliação espera aqui até você publicar.' : 'Troque o filtro para ver as outras.'}
          </EmptyState>
        </Panel>
      )}

      <Pagination page={page} pages={list.data?.pages} onChange={setPage} />

      <Dialog open={!!photo} onClose={() => setPhoto(null)} title="Foto da avaliação" description={photo?.customer_name}>
        {photo && <img src={getImageUrl(photo.photo_url, 'foto')} alt={`Foto enviada por ${photo.customer_name}`} className={s.previewImg} />}
      </Dialog>
    </div>
  )
}
