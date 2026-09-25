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

export default function Reports() {
  const data = useResource(async () => {
    const get = (u) => api.get(`/reports/${u}`).then(r => asList(r.data)).catch(() => [])
    const [monthly, brands, top, funnel] = await Promise.all([get('monthly-revenue'), get('revenue-by-brand'), get('top-products'), get('funnel')])
    return { monthly, brands, top, funnel }
  }, [])
  const d = data.data

  const monthly = (d?.monthly || []).map(m => {
    const l = monthLabel(m.month)
    return { label: l.short, long: l.long, value: Number(m.revenue) || 0, sub: `${number(m.orders)} pedidos${Number(m.cancelled) ? `, ${number(m.cancelled)} cancelados` : ''}`, orders: m.orders }
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
        description="Os últimos 12 meses. Receita sem pedidos cancelados e sem frete."
        actions={<Button icon={<FiDownload />} onClick={exportCsv} disabled={!d}>Baixar planilha</Button>}
      />
      <ErrorNote error={data.error} onRetry={data.reload} />

      <Panel title="Receita por mês" subtitle={d ? `${money(year)} em 12 meses` : ''}>
        {!d ? <Skeleton lines={6} height={26} /> : monthly.some(m => m.value > 0) ? (
          <>
            <ColumnChart data={monthly} format={money} tickFormat={tickMoney} label={`Receita por mês, total ${money(year)}`} />
            <NumbersTable head={['Mês', 'Pedidos', 'Receita']} rows={monthly.map(m => [m.long, number(m.orders), money(m.value)])} />
          </>
        ) : <EmptyState art={<ChartSketch />} title="Sem vendas nos últimos 12 meses" />}
      </Panel>

      <div className={s.cols3}>
        <Panel title="Mais vendidos" subtitle="12 meses">
          {!d ? <Skeleton lines={6} height={26} /> : d.top.length ? (
            <BarList ranked format={moneyShort} items={d.top.slice(0, 10).map(p => ({ key: p.id, label: p.name, value: p.revenue, sub: `${number(p.sales)} pares` }))} />
          ) : <p className={s.muted}>Sem vendas.</p>}
        </Panel>
        <Panel title="Receita por marca">
          {!d ? <Skeleton lines={6} height={26} /> : d.brands.length ? (
            <BarList format={moneyShort} items={d.brands.map(b => ({ key: b.name, label: b.name, value: b.revenue, sub: `${number(b.quantity)} pares` }))} />
          ) : <p className={s.muted}>Sem vendas.</p>}
        </Panel>
        <Panel title="Do olhar à compra" subtitle="últimos 30 dias">
          {!d ? <Skeleton lines={4} height={26} /> : funnel.length ? (
            <>
              <BarList
                max={Math.max(1, ...funnel.map(f => Number(f.value) || 0))}
                format={number}
                items={funnel.map((f, i) => ({
                  key: f.stage,
                  label: f.stage,
                  value: f.value,
                  sub: i > 0 && Number(funnel[i - 1].value) > 0 ? `${percent(Number(f.value) / Number(funnel[i - 1].value))} do passo anterior` : undefined,
                }))}
              />
              <p className={`${s.small} ${s.muted}`} style={{ marginTop: 12 }}>Visualizações contam desde o início da loja; pedidos, só os últimos 30 dias.</p>
            </>
          ) : <p className={s.muted}>Sem dados ainda.</p>}
        </Panel>
      </div>
    </div>
  )
}
