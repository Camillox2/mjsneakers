import { useEffect, useState } from 'react'
import { FiDownload, FiTrash2 } from 'react-icons/fi'
import api, { asPage } from '../lib/api'
import { useDebounced, useResource } from '../lib/hooks'
import { number, date, ago } from '../lib/format'
import { csvDownload } from '../lib/print'
import { PageHeader, Panel, Button, SearchField, DataTable, Pagination, ErrorNote, Skeleton, EmptyState, Badge, useConfirm, useToast } from '../ui'
import { Envelope } from '../art/Art'
import s from './sections.module.css'

export default function Newsletter() {
  const toast = useToast()
  const confirm = useConfirm()
  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim(), 350)
  const [page, setPage] = useState(1)
  const [exporting, setExporting] = useState(false)
  useEffect(() => { setPage(1) }, [q])

  const list = useResource(() => api.get('/newsletter', { params: { search: q || undefined, page, limit: 30 } }).then(r => asPage(r.data, page)), [q, page])

  const remove = async (r) => {
    if (!(await confirm({ title: `Tirar ${r.email} da lista?`, message: 'A pessoa para de receber os e-mails. Se assinar de novo, volta.', confirmLabel: 'Tirar da lista', tone: 'danger' }))) return
    try { await api.delete(`/newsletter/${r.id}`); toast.good('E-mail tirado da lista.'); list.reload() } catch (err) { toast.error(err.message) }
  }

  const exportAll = async () => {
    setExporting(true)
    try {
      const rows = []
      for (let pg = 1; pg <= 60; pg++) {
        const { data } = await api.get('/newsletter', { params: { page: pg, limit: 100 } })
        const pd = asPage(data, pg)
        rows.push(...pd.items)
        if (pg >= pd.pages) break
      }
      csvDownload(`newsletter-${new Date().toISOString().slice(0, 10)}.csv`, ['email', 'nome', 'situacao', 'desde'],
        rows.map(r => [r.email, r.name || '', r.active ? 'ativo' : 'saiu', date(r.created_at)]))
    } catch (err) { toast.error(err.message) } finally { setExporting(false) }
  }

  return (
    <div>
      <PageHeader
        title="Newsletter"
        description="Quem assinou no site. Cada pessoa nova recebe o cupom de boas-vindas por e-mail."
        actions={<Button icon={<FiDownload />} onClick={exportAll} loading={exporting}>Baixar lista</Button>}
      />
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <SearchField value={search} onChange={setSearch} placeholder="Buscar e-mail" />
        {list.data && <span className={`${s.small} ${s.muted}`}>{number(list.data.total)} {list.data.total === 1 ? 'pessoa' : 'pessoas'}</span>}
      </div>
      <ErrorNote error={list.error} onRetry={list.reload} />
      <Panel flush>
        {list.loading && !list.data ? <div style={{ padding: 18 }}><Skeleton lines={6} height={28} /></div> : (
          <DataTable
            rows={list.data?.items || []}
            dim={list.loading}
            columns={[
              { key: 'email', header: 'E-mail', primary: true, render: r => <span style={{ overflowWrap: 'anywhere' }}>{r.email}</span> },
              { key: 'name', header: 'Nome', render: r => r.name || '' },
              { key: 'since', header: 'Desde', render: r => <span className={s.nowrap} title={date(r.created_at)}>{ago(r.created_at)}</span> },
              { key: 'st', header: 'Situação', render: r => (r.active === false || r.active === 0 ? <Badge>Saiu</Badge> : <Badge tone="good">Assinando</Badge>) },
              { key: 'act', header: '', render: r => <Button size="small" variant="ghost" icon={<FiTrash2 />} aria-label={`Tirar ${r.email}`} onClick={() => remove(r)} /> },
            ]}
            empty={<EmptyState art={<Envelope />} title={q ? 'Nenhum e-mail com essa busca' : 'Ninguém assinou ainda'}>A caixa de inscrição fica no rodapé da loja e no aviso que aparece para quem visita.</EmptyState>}
          />
        )}
      </Panel>
      <Pagination page={page} pages={list.data?.pages} onChange={setPage} />
    </div>
  )
}
