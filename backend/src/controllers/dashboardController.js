const { pool } = require('../config/db');

const dashboardController = {
  async getMetrics(req, res) {
    try {
      const [[{ totalProducts }]] = await pool.query('SELECT COUNT(*) as totalProducts FROM products');
      const [[{ activeProducts }]] = await pool.query('SELECT COUNT(*) as activeProducts FROM products WHERE active = 1');
      const [[{ outOfStock }]] = await pool.query('SELECT COUNT(*) as outOfStock FROM products WHERE stock = 0');
      const [[{ totalBanners }]] = await pool.query('SELECT COUNT(*) as totalBanners FROM banners');
      const [[{ totalOrders }]] = await pool.query('SELECT COUNT(*) as totalOrders FROM orders');
      const [[{ pendingOrders }]] = await pool.query("SELECT COUNT(*) as pendingOrders FROM orders WHERE status = 'pending'");
      const [[{ pendingReviews }]] = await pool.query("SELECT COUNT(*) as pendingReviews FROM reviews WHERE status = 'pending'");
      const [[{ approvedReviews }]] = await pool.query("SELECT COUNT(*) as approvedReviews FROM reviews WHERE status = 'approved'");
      const [[{ totalRevenue }]] = await pool.query("SELECT COALESCE(SUM(total), 0) as totalRevenue FROM orders WHERE status != 'cancelled'");

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
        'SELECT id, name, stock, image_url FROM products WHERE stock <= 5 AND stock > 0 ORDER BY stock ASC LIMIT 10'
      );

      res.json({
        cards: { totalProducts, activeProducts, outOfStock, totalBanners, totalOrders, pendingOrders, pendingReviews, approvedReviews, totalRevenue },
        brandStats,
        recentReviews,
        recentOrders,
        lowStock
      });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar métricas' });
    }
  }
};

module.exports = dashboardController;
