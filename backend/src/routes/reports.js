const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

router.get('/revenue-by-brand', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT b.name as name, COALESCE(SUM(o.total),0) as revenue, COUNT(DISTINCT o.id) as orders
      FROM brands b
      LEFT JOIN products p ON p.brand_id = b.id
      LEFT JOIN order_items oi ON oi.product_id = p.id
      LEFT JOIN orders o ON o.id = oi.order_id AND o.status != 'cancelled'
      GROUP BY b.id, b.name ORDER BY revenue DESC
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.get('/hourly-heatmap', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT DAYOFWEEK(created_at)-1 as day, HOUR(created_at) as hour, COUNT(*) as orders
      FROM orders WHERE created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
      GROUP BY day, hour ORDER BY day, hour
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.get('/monthly-revenue', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT DATE_FORMAT(created_at,'%Y-%m') as month,
        SUM(CASE WHEN status!='cancelled' THEN total ELSE 0 END) as revenue,
        COUNT(*) as orders,
        SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END) as cancelled
      FROM orders WHERE created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
      GROUP BY month ORDER BY month ASC
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.get('/top-products', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT p.name, b.name as name,
        SUM(oi.quantity) as sales,
        SUM(oi.quantity * oi.price) as revenue
      FROM order_items oi
      JOIN products p ON p.id = oi.product_id
      LEFT JOIN brands b ON b.id = p.brand_id
      JOIN orders o ON o.id = oi.order_id AND o.status != 'cancelled'
      GROUP BY p.id ORDER BY revenue DESC LIMIT 10
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.get('/funnel', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [[views]] = await pool.query('SELECT SUM(view_count) as total FROM products WHERE active=TRUE');
    const [[carts]] = await pool.query('SELECT COUNT(*) as total FROM orders WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)');
    const [[completed]] = await pool.query("SELECT COUNT(*) as total FROM orders WHERE status NOT IN ('cancelled','pending') AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)");
    res.json([
      { stage: 'Visualizações', value: Number(views.total) || 0 },
      { stage: 'Pedidos iniciados', value: Number(carts.total) || 0 },
      { stage: 'Pedidos confirmados', value: Number(completed.total) || 0 },
    ]);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

module.exports = router;
