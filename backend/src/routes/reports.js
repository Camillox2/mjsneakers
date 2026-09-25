const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { requireAdmin } = require('../middleware/auth');

router.use(...requireAdmin);

const num = (value) => Number(value) || 0;

// Receita por marca: soma dos itens (preço x quantidade), sem frete e sem
// pedidos cancelados.
router.get('/revenue-by-brand', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT COALESCE(b.name, 'Sem marca') as name,
        COALESCE(SUM(oi.price * oi.quantity), 0) as revenue,
        COALESCE(SUM(oi.quantity), 0) as quantity,
        COUNT(DISTINCT o.id) as orders
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id AND o.status <> 'cancelled'
      LEFT JOIN products p ON p.id = oi.product_id
      LEFT JOIN brands b ON b.id = p.brand_id
      GROUP BY COALESCE(b.name, 'Sem marca') ORDER BY revenue DESC
    `);
    res.json(rows.map((row) => ({ name: row.name, revenue: num(row.revenue), quantity: num(row.quantity), orders: num(row.orders) })));
  } catch (e) { res.status(500).json({ error: 'Erro ao gerar relatório' }); }
});

router.get('/hourly-heatmap', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT DAYOFWEEK(created_at)-1 as day, HOUR(created_at) as hour, COUNT(*) as orders
      FROM orders WHERE created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY) AND status <> 'cancelled'
      GROUP BY day, hour ORDER BY day, hour
    `);
    res.json(rows.map((row) => ({ day: num(row.day), hour: num(row.hour), orders: num(row.orders) })));
  } catch (e) { res.status(500).json({ error: 'Erro ao gerar relatório' }); }
});

router.get('/monthly-revenue', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT DATE_FORMAT(created_at,'%Y-%m') as month,
        SUM(CASE WHEN status!='cancelled' THEN total ELSE 0 END) as revenue,
        COUNT(*) as orders,
        SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END) as cancelled
      FROM orders WHERE created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
      GROUP BY month ORDER BY month ASC
    `);
    res.json(rows.map((row) => ({ month: row.month, revenue: num(row.revenue), orders: num(row.orders), cancelled: num(row.cancelled) })));
  } catch (e) { res.status(500).json({ error: 'Erro ao gerar relatório' }); }
});

// Top 10 por receita: name é o nome do produto, brand a marca.
router.get('/top-products', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT oi.product_id as id, p.name as name, b.name as brand,
        SUM(oi.quantity) as sales,
        SUM(oi.quantity * oi.price) as revenue
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id AND o.status != 'cancelled'
      LEFT JOIN products p ON p.id = oi.product_id
      LEFT JOIN brands b ON b.id = p.brand_id
      GROUP BY oi.product_id, p.name, b.name ORDER BY revenue DESC LIMIT 10
    `);
    res.json(rows.map((row) => ({ id: num(row.id), name: row.name, brand: row.brand, sales: num(row.sales), revenue: num(row.revenue) })));
  } catch (e) { res.status(500).json({ error: 'Erro ao gerar relatório' }); }
});

// Funil dos últimos 30 dias (visualizações não têm data: é o total acumulado).
router.get('/funnel', async (req, res) => {
  try {
    const [[views]] = await pool.query('SELECT SUM(view_count) as total FROM products WHERE active=TRUE');
    const [[carts]] = await pool.query('SELECT COUNT(*) as total FROM orders WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)');
    const [[completed]] = await pool.query("SELECT COUNT(*) as total FROM orders WHERE status NOT IN ('cancelled','pending') AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)");
    res.json([
      { stage: 'Visualizações', value: num(views.total) },
      { stage: 'Pedidos iniciados', value: num(carts.total) },
      { stage: 'Pedidos confirmados', value: num(completed.total) },
    ]);
  } catch (e) { res.status(500).json({ error: 'Erro ao gerar relatório' }); }
});

module.exports = router;
