const { pool } = require('../config/db');

const dashboardController = {
  async getMetrics(req, res) {
    try {
      const [[{ totalProducts }]] = await pool.query('SELECT COUNT(*) as totalProducts FROM products');
      const [[{ activeProducts }]] = await pool.query('SELECT COUNT(*) as activeProducts FROM products WHERE active = 1');
      const [[{ outOfStock }]] = await pool.query('SELECT COUNT(*) as outOfStock FROM products WHERE stock = 0 AND active = 1');
      const [[{ totalBanners }]] = await pool.query('SELECT COUNT(*) as totalBanners FROM banners');
      const [[{ totalOrders }]] = await pool.query('SELECT COUNT(*) as totalOrders FROM orders');
      const [[{ pendingOrders }]] = await pool.query("SELECT COUNT(*) as pendingOrders FROM orders WHERE status = 'pending'");
      const [[{ pendingReviews }]] = await pool.query("SELECT COUNT(*) as pendingReviews FROM reviews WHERE status = 'pending'");
      const [[{ approvedReviews }]] = await pool.query("SELECT COUNT(*) as approvedReviews FROM reviews WHERE status = 'approved'");
      const [[{ totalRevenue }]] = await pool.query("SELECT COALESCE(SUM(total), 0) as totalRevenue FROM orders WHERE status != 'cancelled'");
      const [[{ totalCoupons }]] = await pool.query('SELECT COUNT(*) as totalCoupons FROM coupons WHERE active = TRUE');
      const [[{ totalCustomers }]] = await pool.query("SELECT COUNT(DISTINCT customer_email) as totalCustomers FROM orders WHERE customer_email IS NOT NULL AND customer_email != ''");
      const [[{ cancelledOrders }]] = await pool.query("SELECT COUNT(*) as cancelledOrders FROM orders WHERE status = 'cancelled'");
      const [[{ avgTicket }]] = await pool.query("SELECT COALESCE(AVG(total), 0) as avgTicket FROM orders WHERE status != 'cancelled'");

      // Receita por marca
      const [brandRevenue] = await pool.query(
        `SELECT b.name, COALESCE(SUM(oi.price * oi.quantity), 0) as revenue, COUNT(DISTINCT oi.order_id) as orders
         FROM brands b
         LEFT JOIN products p ON b.id = p.brand_id
         LEFT JOIN order_items oi ON p.id = oi.product_id
         LEFT JOIN orders o ON oi.order_id = o.id AND o.status != 'cancelled'
         GROUP BY b.id, b.name
         ORDER BY revenue DESC`
      );

      const [brandStats] = await pool.query(
        `SELECT b.name, COUNT(p.id) as count
         FROM brands b LEFT JOIN products p ON b.id = p.brand_id
         GROUP BY b.id, b.name ORDER BY count DESC`
      );

      const [recentReviews] = await pool.query(
        `SELECT r.*, p.name as product_name
         FROM reviews r LEFT JOIN products p ON r.product_id = p.id
         ORDER BY r.created_at DESC LIMIT 5`
      );

      const [recentOrders] = await pool.query(
        'SELECT * FROM orders ORDER BY created_at DESC LIMIT 5'
      );

      const [lowStock] = await pool.query(
        'SELECT id, name, stock, image_url FROM products WHERE stock <= 5 AND stock > 0 AND active = TRUE ORDER BY stock ASC LIMIT 10'
      );

      // Sales chart: last 30 days
      const [salesChart] = await pool.query(`
        SELECT DATE(created_at) as date, COUNT(*) as orders, COALESCE(SUM(total), 0) as revenue
        FROM orders
        WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) AND status != 'cancelled'
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `);

      res.json({
        cards: { totalProducts, activeProducts, outOfStock, totalBanners, totalOrders, pendingOrders, pendingReviews, approvedReviews, totalRevenue, totalCoupons },
        brandStats,
        recentReviews,
        recentOrders,
        lowStock,
        salesChart,
        topProducts
      });
    } catch (error) {
      console.error('Dashboard error:', error);
      res.status(500).json({ error: 'Erro ao buscar métricas' });
    }
  }
};

module.exports = dashboardController;
