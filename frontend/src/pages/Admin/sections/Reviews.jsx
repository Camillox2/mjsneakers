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
import rv from './Reviews.module.css'

const STATUS = { pending: { label: 'Para moderar', tone: 'warning' }, approved: { label: 'Publicada', tone: 'good' }, rejected: { label: 'Recusada', tone: 'critical' } }

function Rating({ value }) {
  const n = Math.max(0, Math.min(5, Number(value) || 0))
  return (
    <span role="img" aria-label={`${n} de 5 estrelas`} className={rv.stars}>
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
  const { refreshCounts, counts } = useAdmin()
  const [status, setStatus] = useState('pending')
  const [photo, setPhoto] = useState(null)
  // id da avaliação com ação em andamento: trava os botões dela
  const [busy, setBusy] = useState(null)
  const [page, setPage] = useState(1)
  useEffect(() => { setPage(1) }, [status])
  const list = useResource(() => api.get('/reviews', { params: { status: status || undefined, page, limit: 24 } }).then(r => asPage(r.data, page)), [status, page])

  // moderou a última da página: volta uma página em vez de mostrar vazio
  useEffect(() => {
    if (list.data && !list.data.items.length && page > 1) setPage(p => p - 1)
  }, [list.data]) // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (r, next) => {
    if (busy) return
    setBusy({ id: r.id, action: next })
    try {
      await api.put(`/reviews/${r.id}/status`, { status: next })
      toast.good(next === 'approved' ? 'Avaliação publicada na página do produto.' : 'Avaliação recusada. Ela não aparece na loja.')
      list.reload(); refreshCounts()
    } catch (err) { toast.error(err.message) } finally { setBusy(null) }
  }

  const remove = async (r) => {
    if (busy) return
    if (!(await confirm({ title: 'Apagar esta avaliação?', message: 'Some de vez, inclusive daqui. Para só tirar da loja, use Recusar.', confirmLabel: 'Apagar', tone: 'danger' }))) return
    setBusy({ id: r.id, action: 'delete' })
    try { await api.delete(`/reviews/${r.id}`); toast.good('Avaliação apagada.'); list.reload(); refreshCounts() } catch (err) { toast.error(err.message) } finally { setBusy(null) }
  }

  const rows = list.data?.items || []
  const pending = Number(counts?.pendingReviews) || 0

  return (
    <div>
      <PageHeader title="Avaliações" description="Nada aparece na loja antes de você publicar." />
      <div className={rv.filters}>
        <Segmented label="Situação" value={status} onChange={setStatus} options={[
          { value: 'pending', label: 'Para moderar', count: pending || undefined },
          { value: 'approved', label: 'Publicadas' },
          { value: 'rejected', label: 'Recusadas' },
          { value: '', label: 'Todas' },
        ]} />
      </div>
      <ErrorNote error={list.error} onRetry={list.reload} />
      {list.loading && !list.data ? <Panel><Skeleton lines={6} height={30} /></Panel> : rows.length ? (
        <div className={`${s.cardGrid} ${list.loading ? rv.loading : ''}`} aria-busy={list.loading || undefined}>
          {rows.map(r => {
            const mine = busy?.id === r.id
            return (
              <Panel key={r.id}>
                <div className={rv.card}>
                  <div className={rv.head}>
                    <Rating value={r.rating} />
                    <Badge tone={STATUS[r.status]?.tone}>{STATUS[r.status]?.label || 'Sem situação'}</Badge>
                  </div>
                  {r.comment ? <p className={rv.comment}>{r.comment}</p> : <p className={rv.empty}>Sem comentário, só a nota.</p>}
                  {r.photo_url && (
                    <button type="button" className={rv.photoBtn} onClick={() => setPhoto(r)} aria-label={`Ver a foto enviada por ${r.customer_name}`}>
                      <img className={`${s.thumb} ${s.thumbL}`} src={getImageUrl(r.photo_url, 'foto')} alt="" loading="lazy" />
                    </button>
                  )}
                  <div className={rv.who}>
                    <span className={s.strong}>{r.customer_name}</span>{r.customer_email ? <span className={rv.email}> ({r.customer_email})</span> : null}
                    <div className={s.muted}>
                      {r.product_id
                        ? <Link className={s.linkBtn} to={`/admin/produtos/${r.product_id}`} state={{ fromList: true }}>{r.product_name || `Produto ${r.product_id}`}</Link>
                        : 'Produto removido'}, {ago(r.created_at)}
                    </div>
                  </div>
                  <div className={rv.actions}>
                    {r.status !== 'approved' && <Button size="small" variant="primary" icon={<FiCheck />} loading={mine && busy.action === 'approved'} disabled={!!busy} onClick={() => act(r, 'approved')}>Publicar</Button>}
                    {r.status !== 'rejected' && <Button size="small" icon={<FiX />} loading={mine && busy.action === 'rejected'} disabled={!!busy} onClick={() => act(r, 'rejected')}>Recusar</Button>}
                    <Button size="small" variant="ghost" icon={<FiTrash2 />} aria-label={`Apagar a avaliação de ${r.customer_name}`} loading={mine && busy.action === 'delete'} disabled={!!busy} onClick={() => remove(r)} />
                  </div>
                </div>
              </Panel>
            )
          })}
        </div>
      ) : !list.error && (
        <Panel>
          <EmptyState
            art={<StarsArt />}
            title={status === 'pending' ? 'Nada para moderar' : 'Nenhuma avaliação aqui'}
            action={status !== '' && status !== 'pending' ? <Button onClick={() => setStatus('')}>Ver todas</Button> : null}
          >
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
