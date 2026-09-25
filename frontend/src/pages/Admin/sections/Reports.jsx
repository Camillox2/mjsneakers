import { FiDownload } from 'react-icons/fi'
import api, { asList } from '../lib/api'
import { useResource } from '../lib/hooks'
import { money, moneyShort, number, percent } from '../lib/format'
import { csvDownload } from '../lib/print'
import { PageHeader, Panel, Button, ErrorNote, Skeleton, EmptyState } from '../ui'
import { ColumnChart, BarList } from '../charts/Bars'
import { NumbersTable } from '../charts/LineChart'
import { ChartSketch } from '../art/Art'
import s from './sections.module.css'

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const monthLabel = (ym) => { const [y, m] = String(ym).split('-'); return { short: MONTHS[Number(m) - 1] || ym, long: `${MONTHS[Number(m) - 1] || ''} de ${y}` } }
const tickMoney = (v) => (v >= 1000 ? `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : String(v))
const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

// A API só devolve os meses que tiveram pedido: completa com zero para o
// gráfico não pular mês (um buraco de vendas precisa aparecer).
function fillMonths(rows) {
  const byMonth = new Map(rows.map(r => [r.month, r]))
  const now = new Date()
  const cursor = new Date(now.getFullYear(), now.getMonth() - 11, 1)
  const first = rows.map(r => r.month).sort()[0]
  if (first && first < ym(cursor)) {
    const [y, m] = first.split('-').map(Number)
    cursor.setFullYear(y, m - 1, 1)
  }
  const out = []
  while (ym(cursor) <= ym(now)) {
    const key = ym(cursor)
    out.push(byMonth.get(key) || { month: key, revenue: 0, orders: 0, cancelled: 0 })
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return out
}

export default function Reports() {
  const data = useResource(async () => {
    const get = (u) => api.get(`/reports/${u}`).then(r => asList(r.data))
    const [monthly, brands, top, funnel] = await Promise.all([get('monthly-revenue'), get('revenue-by-brand'), get('top-products'), get('funnel')])
    return { monthly, brands, top, funnel }
  }, [])
  const d = data.data
  // sem dado e com erro: a nota de erro basta, sem esqueleto piscando para sempre
  const waiting = !d && !data.error

  const monthly = fillMonths(d?.monthly || []).map(m => {
    const l = monthLabel(m.month)
    return { label: l.short, long: l.long, value: Number(m.revenue) || 0, sub: `${number(m.orders)} ${Number(m.orders) === 1 ? 'pedido' : 'pedidos'}${Number(m.cancelled) ? `, ${number(m.cancelled)} ${Number(m.cancelled) === 1 ? 'cancelado' : 'cancelados'}` : ''}`, orders: m.orders }
  })
  const year = monthly.reduce((n, m) => n + m.value, 0)

  const exportCsv = () => csvDownload(`relatorio-${new Date().toISOString().slice(0, 10)}.csv`, ['secao', 'item', 'quantidade', 'receita'], [
    ...monthly.map(m => ['mês', m.long, m.orders, m.value.toFixed(2).replace('.', ',')]),
    ...(d?.top || []).map(p => ['mais vendido', p.name, p.sales, Number(p.revenue).toFixed(2).replace('.', ',')]),
    ...(d?.brands || []).map(b => ['marca', b.name, b.quantity, Number(b.revenue).toFixed(2).replace('.', ',')]),
  ])

  const funnel = d?.funnel || []

  return (
    <div className={s.grid}>
      <PageHeader
        title="Relatórios"
        description="Só entram pedidos pagos (sem os cancelados e sem os que esperam pagamento). Por mês, o valor conta com frete; por produto e por marca, só o valor dos pares."
        actions={<Button icon={<FiDownload />} onClick={exportCsv} disabled={!d}>Baixar planilha</Button>}
      />
      <ErrorNote error={data.error} onRetry={data.reload} />

      <Panel title="Receita por mês" subtitle={d ? `${money(year)} nos últimos 12 meses` : ''}>
        {waiting ? <Skeleton lines={6} height={26} /> : !d ? null : monthly.some(m => m.value > 0) ? (
          <>
            <ColumnChart data={monthly} format={money} tickFormat={tickMoney} label={`Receita por mês, total ${money(year)}`} />
            <NumbersTable head={['Mês', 'Pedidos', 'Receita']} rows={monthly.map(m => [m.long, number(m.orders), money(m.value)])} />
          </>
        ) : <EmptyState art={<ChartSketch />} title="Sem vendas nos últimos 12 meses">Quando os pedidos forem pagos, a receita de cada mês aparece aqui.</EmptyState>}
      </Panel>

      <div className={s.cols3}>
        <Panel title="Mais vendidos" subtitle="desde a abertura">
          {waiting ? <Skeleton lines={6} height={26} /> : !d ? null : d.top.length ? (
            <BarList ranked format={moneyShort} items={d.top.slice(0, 10).map(p => ({ key: p.id, label: p.name || `Produto #${p.id}`, value: p.revenue, sub: `${number(p.sales)} ${Number(p.sales) === 1 ? 'par' : 'pares'}` }))} />
          ) : <p className={`${s.muted} ${s.flush}`}>Nenhum par vendido ainda.</p>}
        </Panel>
        <Panel title="Receita por marca" subtitle="desde a abertura">
          {waiting ? <Skeleton lines={6} height={26} /> : !d ? null : d.brands.length ? (
            <BarList format={moneyShort} items={d.brands.map(b => ({ key: b.name, label: b.name, value: b.revenue, sub: `${number(b.quantity)} ${Number(b.quantity) === 1 ? 'par' : 'pares'}` }))} />
          ) : <p className={`${s.muted} ${s.flush}`}>Nenhum par vendido ainda.</p>}
        </Panel>
        <Panel title="Do olhar à compra" subtitle="pedidos dos últimos 30 dias">
          {waiting ? <Skeleton lines={4} height={26} /> : !d ? null : funnel.length ? (
            <>
              <BarList
                max={Math.max(1, ...funnel.map(f => Number(f.value) || 0))}
                format={number}
                items={funnel.map((f, i) => ({
                  key: f.stage,
                  label: f.stage,
                  value: f.value,
                  // visualização não tem data: comparar com pedidos de 30 dias daria um número falso
                  sub: i === 2 && Number(funnel[1].value) > 0 ? `${percent(Number(f.value) / Number(funnel[1].value))} dos pedidos iniciados` : i === 0 ? 'desde a abertura da loja' : undefined,
                }))}
              />
              <p className={`${s.small} ${s.muted} ${s.noteTop}`}>Visualizações contam desde a abertura da loja; pedidos, só os últimos 30 dias.</p>
            </>
          ) : <p className={`${s.muted} ${s.flush}`}>Sem dados ainda.</p>}
        </Panel>
      </div>
    </div>
  )
}
