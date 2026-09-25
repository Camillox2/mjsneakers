import { Link } from 'react-router-dom'
import { FiArrowUpRight, FiArrowDownRight, FiMinus, FiShoppingBag, FiSlash, FiAlertTriangle, FiStar, FiBell, FiChevronRight, FiServer, FiDatabase, FiPackage, FiTruck, FiMessageSquare, FiLock } from 'react-icons/fi'
import api, { asPage } from '../lib/api'
import { useResource, usePersistentState } from '../lib/hooks'
import { useAdmin } from '../lib/context'
import { money, moneyShort, number, percent, delta, shortDay, longDay, ago } from '../lib/format'
import { ORDER_STATUS, OrderBadge } from '../lib/status'
import { getImageUrl } from '../../../utils/imageHelper'
import { PageHeader, Panel, Segmented, ErrorNote, Skeleton, EmptyState, SizeRun, RunLegend } from '../ui'
import { LineChart, NumbersTable, Sparkline } from '../charts/LineChart'
import { BarList, HeatGrid } from '../charts/Bars'
import { ChartSketch, Stars, Receipt } from '../art/Art'
import s from './sections.module.css'

const PERIODS = [
  { value: 7, label: '7 dias' },
  { value: 30, label: '30 dias' },
  { value: 90, label: '90 dias' },
  { value: 365, label: '12 meses' },
]

const tickMoney = (v) => (v >= 1000 ? `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : String(v))

function Delta({ current, previous, days }) {
  const d = delta(current, previous)
  const where = days === 365 ? 'os 12 meses anteriores' : `os ${days} dias anteriores`
  if (d === null) return <span className={`${s.delta} ${s.flat}`}><FiMinus aria-hidden="true" />nada em {where} para comparar</span>
  const dir = d > 0.005 ? 'up' : d < -0.005 ? 'down' : 'flat'
  const Icon = dir === 'up' ? FiArrowUpRight : dir === 'down' ? FiArrowDownRight : FiMinus
  return (
    <span className={`${s.delta} ${s[dir]}`}>
      <Icon aria-hidden="true" />
      <span className={s.deltaNum}>{dir === 'up' ? '+' : ''}{percent(d)}</span>
      sobre {where}
    </span>
  )
}

export default function Dashboard() {
  const { dark, counts } = useAdmin()
  const [days, setDays] = usePersistentState('pz-admin-periodo', 30)
  const dash = useResource(() => api.get('/dashboard', { params: { days } }).then(r => r.data), [days])
  const health = useResource(() => api.get('/admin/health').then(r => r.data).catch(() => null), [])
  const grade = useResource(() => api.get('/products/admin', { params: { status: 'active', limit: 8, sort: 'recent' } }).then(r => r.data), [])
  // o que está parado agora (sem período): pagos para separar, separados para enviar
  const flow = useResource(() => api.get('/orders/status-counts').then(r => r.data).catch(() => null), [counts.pendingOrders])
  const privacy = useResource(() => api.get('/privacy/requests', { params: { status: 'open', page: 1, limit: 1 } }).then(r => asPage(r.data).total).catch(() => 0), [])

  const d = dash.data
  const k = d?.kpis || {}
  const series = (d?.salesSeries || []).map(p => ({ date: p.date, value: Number(p.revenue) || 0, extra: `${number(p.orders)} ${Number(p.orders) === 1 ? 'pedido' : 'pedidos'}` }))
  const firstLoad = dash.loading && !d

  return (
    <div className={s.grid}>
      <PageHeader
        title="Como a loja está"
        description="Números do período escolhido, comparados com o mesmo tanto de dias logo antes."
        actions={<Segmented label="Período" options={PERIODS} value={days} onChange={setDays} />}
      />

      <ErrorNote error={dash.error} onRetry={dash.reload} />

      {firstLoad ? (
        <Panel><Skeleton lines={3} height={22} widths={['40%', '70%', '55%']} /></Panel>
      ) : d && (
        <div className={s.kpis} style={{ opacity: dash.loading ? 0.6 : 1, transition: 'opacity .2s' }}>
          <div className={`${s.kpi} ${s.kpiHero}`}>
            <span className={s.kpiLabel}>Receita</span>
            <span className={s.kpiValue}>{moneyShort(k.revenue)}</span>
            <Delta current={k.revenue} previous={k.revenuePrev} days={days} />
            <Sparkline values={series.slice(-Math.min(series.length, 30)).map(p => p.value)} />
          </div>
          <div className={s.kpi}>
            <span className={s.kpiLabel}>Pedidos pagos</span>
            <span className={s.kpiValue}>{number(k.orders)}</span>
            <Delta current={k.orders} previous={k.ordersPrev} days={days} />
          </div>
          <div className={s.kpi}>
            <span className={s.kpiLabel}>Ticket médio</span>
            <span className={s.kpiValue}>{money(k.avgTicket)}</span>
            <Delta current={k.avgTicket} previous={k.avgTicketPrev} days={days} />
          </div>
          <div className={s.kpi}>
            <span className={s.kpiLabel}>Pares vendidos</span>
            <span className={s.kpiValue}>{number(k.itemsSold)}</span>
            <Delta current={k.itemsSold} previous={k.itemsSoldPrev} days={days} />
          </div>
          <div className={s.kpi}>
            <span className={s.kpiLabel}>Clientes novos</span>
            <span className={s.kpiValue}>{number(k.newCustomers)}</span>
            <Delta current={k.newCustomers} previous={k.newCustomersPrev} days={days} />
          </div>
        </div>
      )}

      <div className={s.cols2}>
        <Panel title="Receita por dia" subtitle={d ? `${money(k.revenue)} no período` : ''}>
          {firstLoad ? <Skeleton lines={6} height={24} /> : series.some(p => p.value > 0) ? (
            <div style={{ opacity: dash.loading ? 0.6 : 1, transition: 'opacity .2s' }}>
              <LineChart
                data={series}
                prev={(d?.salesSeriesPrev || []).map(p => ({ date: p.date, value: Number(p.revenue) || 0 }))}
                format={money}
                tickFormat={tickMoney}
                dateFormat={(x, long) => (long ? longDay(x) : shortDay(x))}
                label={`Receita por dia nos últimos ${days} dias. Total ${money(k.revenue)}.`}
              />
              <NumbersTable head={['Dia', 'Pedidos', 'Receita']} rows={series.map(p => [shortDay(p.date), p.extra, money(p.value)])} />
            </div>
          ) : (
            <EmptyState art={<ChartSketch />} title="Nenhuma venda neste período">
              Quando os pedidos chegarem, a receita de cada dia aparece aqui.
            </EmptyState>
          )}
        </Panel>

        <Panel title="Precisa de você">
          {firstLoad ? <Skeleton lines={4} height={40} /> : (
            <Todo alerts={d?.alerts} health={health.data} flow={flow.data} chats={counts.unreadChats} privacy={privacy.data} />
          )}
        </Panel>
      </div>

      <Panel
        title="Grade dos drops"
        subtitle="estoque por tamanho"
        actions={<Link className={s.linkBtn} to="/admin/estoque">Abrir estoque <FiChevronRight aria-hidden="true" /></Link>}
      >
        <div style={{ marginBottom: 10 }}><RunLegend /></div>
        <ErrorNote error={grade.error} onRetry={grade.reload} />
        {grade.loading && !grade.data ? <Skeleton lines={4} height={34} /> : grade.error && !grade.data ? null : (grade.data?.data || []).length ? (
          <div>
            {grade.data.data.map(p => (
              <Link key={p.id} to={`/admin/produtos/${p.id}`} className={s.runRow}>
                <img className={s.thumb} src={getImageUrl(p.image_url, p.name)} alt="" loading="lazy" />
                <div className={s.cellMain}>
                  <div className={s.listTitle}>{p.name}</div>
                  <div className={s.listSub}>{p.brand_name || 'Sem marca'}</div>
                </div>
                <SizeRun sizes={p.size_stock || []} />
                <div className={s.listEnd}>
                  <div className={s.strong}>{number(p.total_stock ?? p.stock)}</div>
                  <div className={s.small + ' ' + s.muted}>pares</div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState art={<Stars />} title="Nenhum produto ativo">
            Cadastre um produto e monte a grade de tamanhos dele.
          </EmptyState>
        )}
      </Panel>

      <div className={s.cols3}>
        <Panel title="Mais vendidos" subtitle="receita">
          {firstLoad ? <Skeleton lines={5} height={28} /> : d?.topProducts?.length ? (
            <BarList
              ranked
              format={moneyShort}
              items={d.topProducts.slice(0, 6).map(p => ({ key: p.id, label: p.name, value: p.revenue, sub: `${number(p.quantity)} pares`, image: getImageUrl(p.image_url, p.name) }))}
            />
          ) : <p className={s.muted}>Sem vendas no período.</p>}
        </Panel>
        <Panel title="Receita por marca">
          {firstLoad ? <Skeleton lines={5} height={28} /> : d?.brandRevenue?.length ? (
            <BarList format={moneyShort} items={d.brandRevenue.slice(0, 7).map(b => ({ key: b.brand, label: b.brand || 'Sem marca', value: b.revenue, sub: `${number(b.quantity)} pares` }))} />
          ) : <p className={s.muted}>Sem vendas no período.</p>}
        </Panel>
        <Panel title="Pedidos por status" subtitle="feitos no período">
          {firstLoad ? <Skeleton lines={5} height={28} /> : d?.ordersByStatus?.some(x => Number(x.count) > 0) ? (
            <div className={s.list}>
              {Object.keys(ORDER_STATUS).map(st => {
                const n = Number(d.ordersByStatus.find(x => x.status === st)?.count || 0)
                // a lista abre com o mesmo período, para o número bater
                const range = d.period ? `&de=${d.period.from}&ate=${d.period.to}` : ''
                return (
                  <Link key={st} to={`/admin/pedidos?status=${st}${range}`} className={s.listItem} aria-label={`${ORDER_STATUS[st].label}: ${number(n)} ${n === 1 ? 'pedido' : 'pedidos'}`}>
                    <span className={s.listMain}><OrderBadge status={st} /></span>
                    <span className={`${s.listEnd} ${s.strong}`}>{number(n)}</span>
                  </Link>
                )
              })}
            </div>
          ) : <p className={s.muted}>Nenhum pedido no período.</p>}
        </Panel>
      </div>

      <div className={s.cols2}>
        <Panel title="Quando a loja vende" subtitle="pedidos por dia e hora">
          {firstLoad ? <Skeleton lines={7} height={16} gap={6} /> : d?.hourly?.some(c => Number(c.orders) > 0) ? (
            <>
              <HeatGrid cells={d.hourly} dark={dark} />
              <NumbersTable
                head={['Dia', 'Hora', 'Pedidos']}
                rows={d.hourly.filter(c => Number(c.orders) > 0).map(c => [['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][c.weekday], `${String(c.hour).padStart(2, '0')}h`, number(c.orders)])}
              />
            </>
          ) : <p className={s.muted}>O mapa aparece quando houver pedidos no período.</p>}
        </Panel>
        <Panel title="Últimos pedidos" actions={<Link className={s.linkBtn} to="/admin/pedidos">Ver todos <FiChevronRight aria-hidden="true" /></Link>}>
          {firstLoad ? <Skeleton lines={5} height={32} /> : d?.recentOrders?.length ? (
            <div className={s.list}>
              {d.recentOrders.slice(0, 6).map(o => (
                <Link key={o.id} to={`/admin/pedidos/${o.id}`} className={s.listItem}>
                  <div className={s.listMain}>
                    <div className={s.listTitle}>#{o.id} {o.customer_name || 'Cliente'}</div>
                    <div className={s.listSub}>{ago(o.created_at)}, {o.items_count} {Number(o.items_count) === 1 ? 'par' : 'pares'}</div>
                  </div>
                  <div className={s.listEnd}>
                    <div className={s.strong}>{money(o.total)}</div>
                    <OrderBadge status={o.status} />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState art={<Receipt />} title="Nenhum pedido ainda" />
          )}
        </Panel>
      </div>
    </div>
  )
}

function Todo({ alerts = {}, health, flow, chats, privacy }) {
  // backup parado há mais de 2 dias, ou com erro, também é pendência
  const lastBackup = health?.backups?.last_backup_at ? new Date(health.backups.last_backup_at).getTime() : 0
  const backupBad = health && health.backups?.enabled !== false && (!!health.backups?.last_error || Date.now() - lastBackup > 2 * 24 * 60 * 60 * 1000)
  // na ordem do que mais pesa para o cliente: pedido pago parado vem primeiro
  const items = [
    { n: flow?.confirmed, text: (n) => `${n === 1 ? 'pedido pago' : 'pedidos pagos'} para separar`, to: '/admin/pedidos?status=confirmed', icon: FiPackage, tone: 'var(--a-info-wash)', color: 'var(--a-series-1)' },
    { n: flow?.processing, text: (n) => `${n === 1 ? 'pedido separado esperando' : 'pedidos separados esperando'} envio`, to: '/admin/pedidos?status=processing', icon: FiTruck, tone: 'var(--a-info-wash)', color: 'var(--a-series-1)' },
    { n: chats, text: (n) => `${n === 1 ? 'mensagem nova' : 'mensagens novas'} no chat`, to: '/admin/conversas', icon: FiMessageSquare, tone: 'var(--a-info-wash)', color: 'var(--a-series-1)' },
    { n: alerts.pendingOrders, text: (n) => `${n === 1 ? 'pedido aguardando' : 'pedidos aguardando'} pagamento ou confirmação`, to: '/admin/pedidos?status=pending', icon: FiShoppingBag, tone: 'var(--a-warning-wash)', color: 'var(--a-warning)' },
    { n: privacy, text: (n) => `${n === 1 ? 'pedido de privacidade (LGPD)' : 'pedidos de privacidade (LGPD)'} para responder em até 15 dias`, to: '/admin/privacidade', icon: FiLock, tone: 'var(--a-warning-wash)', color: 'var(--a-warning)' },
    { n: alerts.outOfStock, text: (n) => `${n === 1 ? 'produto esgotado' : 'produtos esgotados'}`, to: '/admin/estoque/alertas', icon: FiSlash, tone: 'var(--a-critical-wash)', color: 'var(--a-critical)' },
    { n: alerts.lowStock, text: (n) => `${n === 1 ? 'produto acabando' : 'produtos acabando'}`, to: '/admin/estoque/alertas', icon: FiAlertTriangle, tone: 'var(--a-warning-wash)', color: 'var(--a-warning)' },
    { n: alerts.pendingReviews, text: (n) => `${n === 1 ? 'avaliação para' : 'avaliações para'} moderar`, to: '/admin/avaliacoes', icon: FiStar, tone: 'var(--a-info-wash)', color: 'var(--a-series-1)' },
    { n: alerts.stockAlertsWaiting, text: (n) => `${n === 1 ? 'cliente esperando' : 'clientes esperando'} reposição`, to: '/admin/estoque/avise-me', icon: FiBell, tone: 'var(--a-info-wash)', color: 'var(--a-series-1)' },
    { n: health?.errors?.open_count, text: (n) => `${n === 1 ? 'erro do sistema' : 'erros do sistema'} para olhar`, to: '/admin/saude', icon: FiServer, tone: 'var(--a-critical-wash)', color: 'var(--a-critical)' },
    { n: backupBad ? 1 : 0, text: () => 'backup do banco precisa de atenção', to: '/admin/saude', icon: FiDatabase, tone: 'var(--a-critical-wash)', color: 'var(--a-critical)' },
  ].filter(i => Number(i.n) > 0)

  if (!items.length) {
    return (
      <EmptyState art={<Stars />} title="Tudo em dia">
        Nenhum pedido parado, nenhuma mensagem sem resposta, nada esgotado e nenhuma avaliação esperando.
      </EmptyState>
    )
  }

  return (
    <div className={s.todo}>
      {items.map(i => {
        const Icon = i.icon
        const n = Number(i.n)
        return (
          <Link key={i.to + i.text(1)} to={i.to} className={s.todoItem}>
            <span className={s.todoIcon} style={{ background: i.tone }}><Icon style={{ color: i.color }} aria-hidden="true" /></span>
            <span className={s.todoText}><span className={s.todoNum}>{number(n)}</span> {i.text(n)}</span>
            <FiChevronRight className={s.todoArrow} aria-hidden="true" />
          </Link>
        )
      })}
    </div>
  )
}
