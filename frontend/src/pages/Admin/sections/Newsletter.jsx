import { useEffect, useState } from 'react'
import { FiDownload, FiTrash2 } from 'react-icons/fi'
import api, { asPage } from '../lib/api'
import { useDebounced, useResource } from '../lib/hooks'
import { plural, date, ago } from '../lib/format'
import { csvDownload } from '../lib/print'
import { PageHeader, Panel, Button, SearchField, Segmented, DataTable, Pagination, ErrorNote, Skeleton, EmptyState, Badge, useConfirm, useToast } from '../ui'
import { Envelope } from '../art/Art'
import s from './sections.module.css'
import nl from './Newsletter.module.css'

const SITUATIONS = [
  { value: '1', label: 'Assinando' },
  { value: '0', label: 'Saíram' },
  { value: '', label: 'Todos' },
]

export default function Newsletter() {
  const toast = useToast()
  const confirm = useConfirm()
  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim(), 350)
  const [active, setActive] = useState('1')
  const [page, setPage] = useState(1)
  const [exporting, setExporting] = useState(false)
  useEffect(() => { setPage(1) }, [q, active])

  const list = useResource(() => api.get('/newsletter', { params: { search: q || undefined, active: active || undefined, page, limit: 30 } }).then(r => asPage(r.data, page)), [q, active, page])

  // tirou o último da página: volta uma página em vez de mostrar vazio
  useEffect(() => {
    if (list.data && !list.data.items.length && page > 1) setPage(p => p - 1)
  }, [list.data]) // eslint-disable-line react-hooks/exhaustive-deps

  const remove = async (r) => {
    if (!(await confirm({
      title: `Apagar ${r.email} da lista?`,
      message: 'O e-mail é apagado de vez daqui (use quando a pessoa pedir para sair ou para ter os dados apagados). Se assinar de novo, entra como nova.',
      confirmLabel: 'Apagar da lista',
      tone: 'danger',
    }))) return
    try { await api.delete(`/newsletter/${r.id}`); toast.good('E-mail apagado da lista.'); list.reload() } catch (err) { toast.error(err.message) }
  }

  // Só quem ainda assina: e-mail de quem saiu não pode receber campanha.
  const exportAll = async () => {
    if (exporting) return
    setExporting(true)
    try {
      const rows = []
      for (let pg = 1; pg <= 500; pg++) {
        const { data } = await api.get('/newsletter', { params: { active: '1', page: pg, limit: 200 } })
        const pd = asPage(data, pg)
        rows.push(...pd.items)
        if (pg >= pd.pages) break
      }
      if (!rows.length) { toast.info('Ninguém assinando ainda: nada para baixar.'); return }
      csvDownload(`newsletter-${new Date().toISOString().slice(0, 10)}.csv`, ['email', 'nome', 'desde'],
        rows.map(r => [r.email, r.name || '', date(r.created_at)]))
      toast.good(`Lista baixada: ${plural(rows.length, 'e-mail', 'e-mails')}.`)
    } catch (err) { toast.error(err.message) } finally { setExporting(false) }
  }

  const total = list.data?.total ?? 0

  return (
    <div>
      <PageHeader
        title="Newsletter"
        description="Quem assinou no site. Cada pessoa nova recebe por e-mail o cupom BEMVINDO10 (10% de desconto, uma vez por e-mail)."
        actions={<Button icon={<FiDownload />} onClick={exportAll} loading={exporting}>Baixar quem assina</Button>}
      />
      <div className={nl.bar}>
        <Segmented label="Situação" value={active} onChange={setActive} options={SITUATIONS} />
        <SearchField value={search} onChange={setSearch} placeholder="Buscar e-mail ou nome" />
        {list.data && <span className={nl.count}>{plural(total, 'pessoa', 'pessoas')}</span>}
      </div>
      <ErrorNote error={list.error} onRetry={list.reload} />
      <Panel flush>
        {list.loading && !list.data ? <div className={nl.pad}><Skeleton lines={6} height={28} /></div> : (
          <DataTable
            rows={list.data?.items || []}
            dim={list.loading}
            columns={[
              { key: 'email', header: 'E-mail', primary: true, render: r => <span className={nl.email}>{r.email}</span> },
              { key: 'name', header: 'Nome', render: r => r.name || '' },
              { key: 'since', header: 'Desde', render: r => <span className={s.nowrap} title={date(r.created_at)}>{ago(r.created_at)}</span> },
              { key: 'st', header: 'Situação', render: r => (r.active === false || r.active === 0 ? <Badge>Saiu</Badge> : <Badge tone="good">Assinando</Badge>) },
              { key: 'act', header: '', render: r => <Button size="small" variant="ghost" icon={<FiTrash2 />} aria-label={`Apagar ${r.email} da lista`} onClick={() => remove(r)} /> },
            ]}
            empty={
              <EmptyState art={<Envelope />} title={q ? 'Nenhum e-mail com essa busca' : active === '0' ? 'Ninguém saiu da lista' : 'Ninguém assinou ainda'}>
                {q ? 'Confira o que foi digitado ou troque a situação.' : 'A caixa de inscrição fica no rodapé da loja e no aviso que aparece para quem visita.'}
              </EmptyState>
            }
          />
        )}
      </Panel>
      <Pagination page={page} pages={list.data?.pages} onChange={setPage} />
    </div>
  )
}
