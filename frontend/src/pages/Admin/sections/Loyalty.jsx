import { useEffect, useState } from 'react'
import { FiPlus } from 'react-icons/fi'
import api, { asPage } from '../lib/api'
import { useDebounced, useResource } from '../lib/hooks'
import { number, ago } from '../lib/format'
import { PageHeader, Panel, Button, SearchField, DataTable, Pagination, ErrorNote, Skeleton, EmptyState, Dialog, TextField, useToast } from '../ui'
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
        description="A cada R$ 1 em pedido entregue, o cliente ganha 10 pontos. 100 pontos valem R$ 1 de desconto."
        actions={<Button variant="primary" icon={<FiPlus />} onClick={() => setBonus({ email: '', points: '100', description: '' })}>Dar pontos</Button>}
      />
      <div style={{ marginBottom: 14 }}><SearchField value={search} onChange={setSearch} placeholder="Nome ou e-mail" /></div>
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
