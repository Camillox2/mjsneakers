const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function ensureColumn(connection, tableName, columnName, definition) {
  const [rows] = await connection.query(
    `SHOW COLUMNS FROM \`${tableName}\` LIKE ?`,
    [columnName]
  );
  if (rows.length === 0) {
    await connection.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`);
  }
}

async function ensureIndex(connection, tableName, indexName, columns) {
  const [rows] = await connection.query(
    `SHOW INDEX FROM \`${tableName}\` WHERE Key_name = ?`,
    [indexName]
  );
  if (rows.length === 0) {
    await connection.query(`CREATE INDEX \`${indexName}\` ON \`${tableName}\` (${columns})`);
  }
}

async function initDatabase() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\``);
  await connection.query(`USE \`${process.env.DB_NAME}\``);

  // ── Users ──
  await connection.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(100) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      role ENUM('admin', 'user') DEFAULT 'user',
      last_login DATETIME,
      active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await ensureColumn(connection, 'users', 'last_login', 'DATETIME');
  await ensureColumn(connection, 'users', 'active', 'BOOLEAN DEFAULT TRUE');

  // ── Brands ──
  await connection.query(`
    CREATE TABLE IF NOT EXISTS brands (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      logo_url LONGTEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ── Products ──
  await connection.query(`
    CREATE TABLE IF NOT EXISTS products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      price DECIMAL(10, 2) NOT NULL,
      discount_percentage DECIMAL(5, 2) DEFAULT 0,
      brand_id INT,
      image_url LONGTEXT,
      image_url_2 LONGTEXT,
      image_url_3 LONGTEXT,
      image_url_4 LONGTEXT,
      sizes VARCHAR(500),
      stock INT DEFAULT 0,
      active BOOLEAN DEFAULT TRUE,
      featured BOOLEAN DEFAULT FALSE,
      feature_order INT DEFAULT 0,
      meta_title VARCHAR(255),
      meta_description TEXT,
      tags VARCHAR(500),
      promo_start DATETIME,
      promo_end DATETIME,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (brand_id) REFERENCES brands(id)
    )
  `);
  await ensureColumn(connection, 'products', 'discount_percentage', 'DECIMAL(5, 2) DEFAULT 0');
  await ensureColumn(connection, 'products', 'featured', 'BOOLEAN DEFAULT FALSE');
  await ensureColumn(connection, 'products', 'feature_order', 'INT DEFAULT 0');
  await ensureColumn(connection, 'products', 'meta_title', 'VARCHAR(255)');
  await ensureColumn(connection, 'products', 'meta_description', 'TEXT');
  await ensureColumn(connection, 'products', 'tags', 'VARCHAR(500)');
  await ensureColumn(connection, 'products', 'promo_start', 'DATETIME');
  await ensureColumn(connection, 'products', 'promo_end', 'DATETIME');

  // ── Orders (expanded) ──
  await connection.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      customer_name VARCHAR(255),
      customer_email VARCHAR(255),
      customer_phone VARCHAR(50),
      total DECIMAL(10, 2),
      status ENUM('pending', 'confirmed', 'shipped', 'delivered', 'cancelled') DEFAULT 'pending',
      coupon_code VARCHAR(50),
      discount_amount DECIMAL(10, 2) DEFAULT 0,
      shipping_price DECIMAL(10, 2) DEFAULT 0,
      shipping_type VARCHAR(50),
      address_street VARCHAR(255),
      address_number VARCHAR(20),
      address_complement VARCHAR(100),
      address_neighborhood VARCHAR(100),
      address_city VARCHAR(100),
      address_state VARCHAR(2),
      address_cep VARCHAR(9),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await ensureColumn(connection, 'orders', 'coupon_code', 'VARCHAR(50)');
  await ensureColumn(connection, 'orders', 'discount_amount', 'DECIMAL(10, 2) DEFAULT 0');
  await ensureColumn(connection, 'orders', 'shipping_price', 'DECIMAL(10, 2) DEFAULT 0');
  await ensureColumn(connection, 'orders', 'shipping_type', 'VARCHAR(50)');
  await ensureColumn(connection, 'orders', 'address_street', 'VARCHAR(255)');
  await ensureColumn(connection, 'orders', 'address_number', 'VARCHAR(20)');
  await ensureColumn(connection, 'orders', 'address_complement', 'VARCHAR(100)');
  await ensureColumn(connection, 'orders', 'address_neighborhood', 'VARCHAR(100)');
  await ensureColumn(connection, 'orders', 'address_city', 'VARCHAR(100)');
  await ensureColumn(connection, 'orders', 'address_state', 'VARCHAR(2)');
  await ensureColumn(connection, 'orders', 'address_cep', 'VARCHAR(9)');

  // ── Order Items ──
  await connection.query(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id INT,
      product_id INT,
      quantity INT DEFAULT 1,
      size VARCHAR(10),
      price DECIMAL(10, 2),
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

  // ── Site Settings ──
  await connection.query(`
    CREATE TABLE IF NOT EXISTS site_settings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      setting_key VARCHAR(100) NOT NULL UNIQUE,
      setting_value LONGTEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  // ── Banners ──
  await connection.query(`
    CREATE TABLE IF NOT EXISTS banners (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255),
      subtitle VARCHAR(500),
      image_url LONGTEXT,
      video_url LONGTEXT,
      media_type ENUM('image', 'video') DEFAULT 'image',
      link VARCHAR(500),
      animation_type ENUM('fade', 'slide', 'zoom', 'wave', 'flip') DEFAULT 'fade',
      effect_type ENUM('none', 'sparkle', 'comet', 'glow_pulse', 'neon_border', 'light_sweep') DEFAULT 'none',
      effect_speed ENUM('ultra_slow', 'slow', 'fast', 'super_fast') DEFAULT 'slow',
      sort_order INT DEFAULT 0,
      active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ── Reviews ──
  await connection.query(`
    CREATE TABLE IF NOT EXISTS reviews (
      id INT AUTO_INCREMENT PRIMARY KEY,
      product_id INT,
      customer_name VARCHAR(255) NOT NULL,
      customer_email VARCHAR(255),
      rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
      comment TEXT,
      status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

  // ── Promotion Tickers (faixa animada) ──
  await connection.query(`
    CREATE TABLE IF NOT EXISTS promotion_tickers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      text VARCHAR(300) NOT NULL,
      emoji VARCHAR(10),
      color VARCHAR(20),
      sort_order INT DEFAULT 0,
      active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ── Coupons ──
  await connection.query(`
    CREATE TABLE IF NOT EXISTS coupons (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(50) NOT NULL UNIQUE,
      type ENUM('percent', 'fixed') DEFAULT 'percent',
      value DECIMAL(10, 2) NOT NULL,
      min_order DECIMAL(10, 2) DEFAULT 0,
      max_uses INT DEFAULT 0,
      used_count INT DEFAULT 0,
      valid_until DATETIME,
      active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ── Audit Logs ──
  await connection.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      admin_id INT,
      admin_username VARCHAR(100),
      action VARCHAR(100),
      entity VARCHAR(50),
      entity_id INT,
      details TEXT,
      ip_address VARCHAR(45),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ── Indexes ──
  await ensureIndex(connection, 'products', 'idx_products_active', 'active');
  await ensureIndex(connection, 'products', 'idx_products_brand_id', 'brand_id');
  await ensureIndex(connection, 'products', 'idx_products_featured', 'featured');
  await ensureIndex(connection, 'products', 'idx_products_created_at', 'created_at');
  await ensureIndex(connection, 'orders', 'idx_orders_status', 'status');
  await ensureIndex(connection, 'orders', 'idx_orders_created_at', 'created_at');
  await ensureIndex(connection, 'reviews', 'idx_reviews_product_status', 'product_id, status');
  await ensureIndex(connection, 'coupons', 'idx_coupons_code', 'code');

  // ── Seed brands ──
  const [brands] = await connection.query('SELECT COUNT(*) as count FROM brands');
  if (brands[0].count === 0) {
    await connection.query(`
      INSERT INTO brands (name, logo_url) VALUES 
      ('Nike', '/brands/nike.png'),
      ('Adidas', '/brands/adidas.png'),
      ('Puma', '/brands/puma.png'),
      ('New Balance', '/brands/newbalance.png'),
      ('Louis Vuitton', '/brands/louisvuitton.png')
    `);
  }

  // ── Seed admin user ──
  const [users] = await connection.query('SELECT COUNT(*) as count FROM users');
  if (users[0].count === 0) {
    const bcrypt = require('bcryptjs');
    const adminPass = process.env.ADMIN_DEFAULT_PASSWORD || 'admin123';
    const hashedPassword = await bcrypt.hash(adminPass, 12);
    await connection.query(
      'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
      ['admin', hashedPassword, 'admin']
    );
  }

  // ── Seed products ──
  const [products] = await connection.query('SELECT COUNT(*) as count FROM products');
  if (products[0].count === 0) {
    await connection.query(`
      INSERT INTO products (name, description, price, brand_id, image_url, image_url_2, sizes, stock) VALUES
      ('LV Trainer Purple', 'Louis Vuitton LV Trainer Sneaker em tons de roxo.', 8900.00, 5, '/products/lv-purple-front.jpg', '/products/lv-purple-side.jpg', '38,39,40,41,42,43,44', 5),
      ('LV Trainer Blue', 'Louis Vuitton LV Trainer Sneaker em tons de azul.', 8900.00, 5, '/products/lv-blue-front.jpg', '/products/lv-blue-side.jpg', '38,39,40,41,42,43,44', 3),
      ('Air Max 90', 'Nike Air Max 90 clássico.', 899.90, 1, '/products/placeholder.jpg', NULL, '38,39,40,41,42,43,44', 10),
      ('Ultraboost 22', 'Adidas Ultraboost 22 com tecnologia Boost.', 999.90, 2, '/products/placeholder.jpg', NULL, '38,39,40,41,42,43', 8),
      ('RS-X', 'Puma RS-X com design futurista.', 699.90, 3, '/products/placeholder.jpg', NULL, '39,40,41,42,43', 12),
      ('574 Classic', 'New Balance 574 clássico.', 599.90, 4, '/products/placeholder.jpg', NULL, '38,39,40,41,42,43,44', 15),
      ('Air Jordan 1 High', 'Nike Air Jordan 1 High OG.', 1299.90, 1, '/products/placeholder.jpg', NULL, '39,40,41,42,43,44', 6),
      ('Yeezy 350 V2', 'Adidas Yeezy Boost 350 V2.', 1499.90, 2, '/products/placeholder.jpg', NULL, '38,39,40,41,42,43', 4)
    `);
  }

  await connection.end();
  console.log('Database initialized successfully');
}

module.exports = { pool, initDatabase };
