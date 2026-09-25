const { pool } = require('../config/db');
const { roundMoney } = require('../utils/pricing');

const ALLOWED_DAYS = [7, 30, 90, 365];
const STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
// Receita e vendas contam só pedido pago ou em andamento. 'pending' é
// "aguardando pagamento" e não entra.
const PAID = "('confirmed','processing','shipped','delivered')";

// Soma dias a 'YYYY-MM-DD' sem depender do fuso do Node.
function addDays(date, amount) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + amount);
  return d.toISOString().slice(0, 10);
}

// Intervalo [início, fim) em texto do MySQL, no fuso da sessão do banco.
function range(from, to) {
  return [`${from} 00:00:00`, `${addDays(to, 1)} 00:00:00`];
}

async function kpisFor([start, end]) {
  const [[orders]] = await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN status IN ${PAID} THEN total END), 0) AS revenue,
       COALESCE(SUM(status IN ${PAID}), 0) AS orders,
       COALESCE(SUM(status = 'cancelled'), 0) AS cancelled
     FROM orders WHERE created_at >= ? AND created_at < ?`,
    [start, end]
  );
  const [[items]] = await pool.query(
    `SELECT COALESCE(SUM(oi.quantity), 0) AS itemsSold
     FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE o.status IN ${PAID} AND o.created_at >= ? AND o.created_at < ?`,
    [start, end]
  );
  // Cliente novo = primeiro pedido dele caiu no período.
  const [[customers]] = await pool.query(
    `SELECT COUNT(*) AS newCustomers FROM (
       SELECT customer_email, MIN(created_at) AS first_order FROM orders
       WHERE customer_email IS NOT NULL AND customer_email <> ''
       GROUP BY customer_email
     ) t WHERE t.first_order >= ? AND t.first_order < ?`,
    [start, end]
  );
  const revenue = roundMoney(orders.revenue);
  const count = Number(orders.orders);
  return {
    revenue,
    orders: count,
    avgTicket: count ? roundMoney(revenue / count) : 0,
    newCustomers: Number(customers.newCustomers),
    itemsSold: Number(items.itemsSold),
    cancelled: Number(orders.cancelled),
  };
}

// Um item por dia, com os dias sem venda zerados.
async function seriesFor(from, to) {
  const [rows] = await pool.query(
    `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS day, COALESCE(SUM(total), 0) AS revenue, COUNT(*) AS orders
     FROM orders
     WHERE status IN ${PAID} AND created_at >= ? AND created_at < ?
     GROUP BY day`,
    range(from, to)
  );
  const byDay = new Map(rows.map((row) => [row.day, row]));
  const series = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const row = byDay.get(day);
    series.push({ date: day, revenue: row ? roundMoney(row.revenue) : 0, orders: row ? Number(row.orders) : 0 });
  }
  return series;
}

const dashboardController = {
  async getMetrics(req, res) {
    try {
      const days = req.query.days === undefined ? 30 : Number(req.query.days);
      if (!ALLOWED_DAYS.includes(days)) {
        return res.status(400).json({ error: `days deve ser um de: ${ALLOWED_DAYS.join(', ')}` });
      }

      // "Hoje" vem do banco para o período bater com DATE() das consultas.
      const [[{ today }]] = await pool.query("SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today");
      const to = today;
      const from = addDays(to, -(days - 1));
      const prevTo = addDays(from, -1);
      const prevFrom = addDays(from, -days);
      const current = range(from, to);
      const previous = range(prevFrom, prevTo);

      const [kpiNow, kpiPrev, salesSeries, salesSeriesPrev] = await Promise.all([
        kpisFor(current),
        kpisFor(previous),
        seriesFor(from, to),
        seriesFor(prevFrom, prevTo),
      ]);

      const [statusRows] = await pool.query(
        'SELECT status, COUNT(*) AS total FROM orders WHERE created_at >= ? AND created_at < ? GROUP BY status',
        current
      );
      const statusMap = new Map(statusRows.map((row) => [row.status, Number(row.total)]));
      const ordersByStatus = STATUSES.map((status) => ({ status, count: statusMap.get(status) || 0 }));

      const [topRows] = await pool.query(
        `SELECT oi.product_id AS id, p.name, b.name AS brand, p.image_url,
           SUM(oi.quantity) AS quantity, SUM(oi.price * oi.quantity) AS revenue
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id AND o.status IN ${PAID} AND o.created_at >= ? AND o.created_at < ?
         LEFT JOIN products p ON p.id = oi.product_id
         LEFT JOIN brands b ON b.id = p.brand_id
         GROUP BY oi.product_id, p.name, b.name, p.image_url
         ORDER BY revenue DESC, quantity DESC
         LIMIT 10`,
        current
      );

      const [brandRows] = await pool.query(
        `SELECT COALESCE(b.name, 'Sem marca') AS brand,
           SUM(oi.price * oi.quantity) AS revenue, SUM(oi.quantity) AS quantity
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id AND o.status IN ${PAID} AND o.created_at >= ? AND o.created_at < ?
         LEFT JOIN products p ON p.id = oi.product_id
         LEFT JOIN brands b ON b.id = p.brand_id
         GROUP BY COALESCE(b.name, 'Sem marca')
         ORDER BY revenue DESC`,
        current
      );

      const [recentRows] = await pool.query(
        `SELECT o.id, o.customer_name, o.total, o.status, o.created_at,
           COALESCE((SELECT SUM(quantity) FROM order_items WHERE order_id = o.id), 0) AS items_count
         FROM orders o ORDER BY o.created_at DESC, o.id DESC LIMIT 8`
      );

      const [[stockCounts]] = await pool.query(
        `SELECT COALESCE(SUM(p.stock <= 0), 0) AS outOfStock,
           COALESCE(SUM(p.stock > 0 AND p.stock <= COALESCE(st.threshold, 5)), 0) AS lowStock
         FROM products p LEFT JOIN stock_thresholds st ON st.product_id = p.id
         WHERE p.active = TRUE`
      );
      const [[{ pendingOrders }]] = await pool.query("SELECT COUNT(*) AS pendingOrders FROM orders WHERE status = 'pending'");
      const [[{ pendingReviews }]] = await pool.query("SELECT COUNT(*) AS pendingReviews FROM reviews WHERE status = 'pending'");
      const [[{ stockAlertsWaiting }]] = await pool.query('SELECT COUNT(*) AS stockAlertsWaiting FROM stock_alerts WHERE notified = 0');

      const [[catalog]] = await pool.query(
        `SELECT COALESCE(SUM(active = TRUE), 0) AS activeProducts, COALESCE(SUM(active = FALSE), 0) AS inactiveProducts,
           COUNT(*) AS totalProducts FROM products`
      );
      const [[newsletter]] = await pool.query(
        `SELECT COALESCE(SUM(active = TRUE), 0) AS subscribers,
           COALESCE(SUM(created_at >= ? AND created_at < ?), 0) AS newInPeriod
         FROM newsletter_subscribers`,
        current
      );

      // Mapa de calor completo: 7 dias x 24 horas (0 = domingo).
      const [hourRows] = await pool.query(
        `SELECT DAYOFWEEK(created_at) - 1 AS weekday, HOUR(created_at) AS hour, COUNT(*) AS orders
         FROM orders WHERE status IN ${PAID} AND created_at >= ? AND created_at < ?
         GROUP BY weekday, hour`,
        current
      );
      const hourMap = new Map(hourRows.map((row) => [`${row.weekday}:${row.hour}`, Number(row.orders)]));
      const hourly = [];
      for (let weekday = 0; weekday < 7; weekday += 1) {
        for (let hour = 0; hour < 24; hour += 1) {
          hourly.push({ weekday, hour, orders: hourMap.get(`${weekday}:${hour}`) || 0 });
        }
      }

      res.json({
        period: { days, from, to },
        kpis: {
          revenue: kpiNow.revenue, revenuePrev: kpiPrev.revenue,
          orders: kpiNow.orders, ordersPrev: kpiPrev.orders,
          avgTicket: kpiNow.avgTicket, avgTicketPrev: kpiPrev.avgTicket,
          newCustomers: kpiNow.newCustomers, newCustomersPrev: kpiPrev.newCustomers,
          itemsSold: kpiNow.itemsSold, itemsSoldPrev: kpiPrev.itemsSold,
          cancelled: kpiNow.cancelled, cancelledPrev: kpiPrev.cancelled,
        },
        salesSeries,
        salesSeriesPrev,
        ordersByStatus,
        topProducts: topRows.map((row) => ({
          id: Number(row.id), name: row.name || `Produto #${row.id}`, brand: row.brand || null, image_url: row.image_url || null,
          quantity: Number(row.quantity), revenue: roundMoney(row.revenue),
        })),
        brandRevenue: brandRows.map((row) => ({ brand: row.brand, revenue: roundMoney(row.revenue), quantity: Number(row.quantity) })),
        recentOrders: recentRows.map((row) => ({
          id: row.id, customer_name: row.customer_name, total: roundMoney(row.total), status: row.status,
          created_at: row.created_at, items_count: Number(row.items_count),
        })),
        alerts: {
          outOfStock: Number(stockCounts.outOfStock),
          lowStock: Number(stockCounts.lowStock),
          pendingOrders: Number(pendingOrders),
          pendingReviews: Number(pendingReviews),
          stockAlertsWaiting: Number(stockAlertsWaiting),
        },
        catalog: {
          activeProducts: Number(catalog.activeProducts),
          inactiveProducts: Number(catalog.inactiveProducts),
          totalProducts: Number(catalog.totalProducts),
        },
        newsletter: { subscribers: Number(newsletter.subscribers), newInPeriod: Number(newsletter.newInPeriod) },
        hourly,
      });
    } catch (error) {
      console.error('Dashboard error:', error);
      res.status(500).json({ error: 'Erro ao buscar métricas' });
    }
  }
};

module.exports = dashboardController;
