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
  try {
    const [rows] = await connection.query(`SHOW COLUMNS FROM \`${tableName}\` LIKE ?`, [columnName]);
    if (rows.length === 0) {
      await connection.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`);
    }
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }
}

async function ensureIndex(connection, tableName, indexName, columns) {
  try {
    const [rows] = await connection.query(`SHOW INDEX FROM \`${tableName}\` WHERE Key_name = ?`, [indexName]);
    if (rows.length === 0) {
      await connection.query(`CREATE INDEX \`${indexName}\` ON \`${tableName}\` (${columns})`);
    }
  } catch (err) {
    if (err.code !== 'ER_DUP_KEYNAME') throw err;
  }
}

function slugify(text) {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
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

  await connection.query(`CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY, username VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL, role ENUM('super_admin','admin','editor','atendimento') DEFAULT 'admin',
    last_login DATETIME, active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await ensureColumn(connection, 'users', 'last_login', 'DATETIME');
  await ensureColumn(connection, 'users', 'active', 'BOOLEAN DEFAULT TRUE');
  await ensureColumn(connection, 'users', 'role', "ENUM('super_admin','admin','editor','atendimento') DEFAULT 'admin'");

  await connection.query(`CREATE TABLE IF NOT EXISTS brands (
    id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL UNIQUE,
    logo_url LONGTEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await connection.query(`CREATE TABLE IF NOT EXISTS categories (
    id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(120) NOT NULL UNIQUE, sort_order INT DEFAULT 0,
    active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await connection.query(`CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255) NOT NULL, slug VARCHAR(300),
    description TEXT, price DECIMAL(10,2) NOT NULL, discount_percentage DECIMAL(5,2) DEFAULT 0,
    brand_id INT, category_id INT, image_url LONGTEXT, image_url_2 LONGTEXT,
    image_url_3 LONGTEXT, image_url_4 LONGTEXT, sizes VARCHAR(500), stock INT DEFAULT 0,
    view_count INT DEFAULT 0, active BOOLEAN DEFAULT TRUE, featured BOOLEAN DEFAULT FALSE,
    feature_order INT DEFAULT 0, meta_title VARCHAR(255), meta_description TEXT,
    tags VARCHAR(500), promo_start DATETIME, promo_end DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (brand_id) REFERENCES brands(id),
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
  )`);
  await ensureColumn(connection, 'products', 'slug', 'VARCHAR(300)');
  await ensureColumn(connection, 'products', 'category_id', 'INT');
  await ensureColumn(connection, 'products', 'view_count', 'INT DEFAULT 0');
  await ensureColumn(connection, 'products', 'discount_percentage', 'DECIMAL(5,2) DEFAULT 0');
  await ensureColumn(connection, 'products', 'featured', 'BOOLEAN DEFAULT FALSE');
  await ensureColumn(connection, 'products', 'feature_order', 'INT DEFAULT 0');
  await ensureColumn(connection, 'products', 'meta_title', 'VARCHAR(255)');
  await ensureColumn(connection, 'products', 'meta_description', 'TEXT');
  await ensureColumn(connection, 'products', 'tags', 'VARCHAR(500)');
  await ensureColumn(connection, 'products', 'promo_start', 'DATETIME');
  await ensureColumn(connection, 'products', 'promo_end', 'DATETIME');

  await connection.query(`CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY, customer_name VARCHAR(255), customer_email VARCHAR(255),
    customer_phone VARCHAR(50), total DECIMAL(10,2),
    status ENUM('pending','confirmed','processing','shipped','delivered','cancelled') DEFAULT 'pending',
    coupon_code VARCHAR(50), discount_amount DECIMAL(10,2) DEFAULT 0,
    shipping_price DECIMAL(10,2) DEFAULT 0, shipping_type VARCHAR(50), tracking_code VARCHAR(100),
    address_street VARCHAR(255), address_number VARCHAR(20), address_complement VARCHAR(100),
    address_neighborhood VARCHAR(100), address_city VARCHAR(100), address_state VARCHAR(2),
    address_cep VARCHAR(9), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await ensureColumn(connection, 'orders', 'coupon_code', 'VARCHAR(50)');
  await ensureColumn(connection, 'orders', 'discount_amount', 'DECIMAL(10,2) DEFAULT 0');
  await ensureColumn(connection, 'orders', 'shipping_price', 'DECIMAL(10,2) DEFAULT 0');
  await ensureColumn(connection, 'orders', 'shipping_type', 'VARCHAR(50)');
  await ensureColumn(connection, 'orders', 'tracking_code', 'VARCHAR(100)');
  await ensureColumn(connection, 'orders', 'address_street', 'VARCHAR(255)');
  await ensureColumn(connection, 'orders', 'address_number', 'VARCHAR(20)');
  await ensureColumn(connection, 'orders', 'address_complement', 'VARCHAR(100)');
  await ensureColumn(connection, 'orders', 'address_neighborhood', 'VARCHAR(100)');
  await ensureColumn(connection, 'orders', 'address_city', 'VARCHAR(100)');
  await ensureColumn(connection, 'orders', 'address_state', 'VARCHAR(2)');
  await ensureColumn(connection, 'orders', 'address_cep', 'VARCHAR(9)');

  await connection.query(`CREATE TABLE IF NOT EXISTS order_items (
    id INT AUTO_INCREMENT PRIMARY KEY, order_id INT, product_id INT,
    quantity INT DEFAULT 1, size VARCHAR(10), price DECIMAL(10,2),
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  )`);

  await connection.query(`CREATE TABLE IF NOT EXISTS order_notes (
    id INT AUTO_INCREMENT PRIMARY KEY, order_id INT NOT NULL,
    admin_username VARCHAR(100), note TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
  )`);

  await connection.query(`CREATE TABLE IF NOT EXISTS stock_alerts (
    id INT AUTO_INCREMENT PRIMARY KEY, product_id INT NOT NULL,
    email VARCHAR(255) NOT NULL, notified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    UNIQUE KEY unique_alert (product_id, email)
  )`);

  await connection.query(`CREATE TABLE IF NOT EXISTS newsletter_subscribers (
    id INT AUTO_INCREMENT PRIMARY KEY, email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255), coupon_sent BOOLEAN DEFAULT FALSE,
    active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await connection.query(`CREATE TABLE IF NOT EXISTS site_settings (
    id INT AUTO_INCREMENT PRIMARY KEY, setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value LONGTEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`);

  await connection.query(`CREATE TABLE IF NOT EXISTS banners (
    id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(255), subtitle VARCHAR(500),
    image_url LONGTEXT, video_url LONGTEXT, media_type ENUM('image','video') DEFAULT 'image',
    link VARCHAR(500), animation_type ENUM('fade','slide','zoom','wave','flip') DEFAULT 'fade',
    effect_type ENUM('none','sparkle','comet','glow_pulse','neon_border','light_sweep') DEFAULT 'none',
    effect_speed ENUM('ultra_slow','slow','fast','super_fast') DEFAULT 'slow',
    sort_order INT DEFAULT 0, active BOOLEAN DEFAULT TRUE,
    active_from DATETIME, active_until DATETIME, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await ensureColumn(connection, 'banners', 'active_from', 'DATETIME');
  await ensureColumn(connection, 'banners', 'active_until', 'DATETIME');

  await connection.query(`CREATE TABLE IF NOT EXISTS reviews (
    id INT AUTO_INCREMENT PRIMARY KEY, product_id INT, customer_name VARCHAR(255) NOT NULL,
    customer_email VARCHAR(255), rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT, photo_url LONGTEXT, status ENUM('pending','approved','rejected') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id)
  )`);
  await ensureColumn(connection, 'reviews', 'photo_url', 'LONGTEXT');

  await connection.query(`CREATE TABLE IF NOT EXISTS promotion_tickers (
    id INT AUTO_INCREMENT PRIMARY KEY, text VARCHAR(300) NOT NULL,
    emoji VARCHAR(10), color VARCHAR(20), sort_order INT DEFAULT 0,
    active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await connection.query(`CREATE TABLE IF NOT EXISTS coupons (
    id INT AUTO_INCREMENT PRIMARY KEY, code VARCHAR(50) NOT NULL UNIQUE,
    type ENUM('percent','fixed') DEFAULT 'percent', value DECIMAL(10,2) NOT NULL,
    min_order DECIMAL(10,2) DEFAULT 0, max_uses INT DEFAULT 0, used_count INT DEFAULT 0,
    valid_until DATETIME, active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await connection.query(`CREATE TABLE IF NOT EXISTS audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY, admin_id INT, admin_username VARCHAR(100),
    action VARCHAR(100), entity VARCHAR(50), entity_id INT, details TEXT,
    ip_address VARCHAR(45), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  // ── Loyalty Points ──
  await connection.query(`CREATE TABLE IF NOT EXISTS loyalty_points (
    id INT AUTO_INCREMENT PRIMARY KEY, customer_email VARCHAR(255) NOT NULL,
    customer_name VARCHAR(255), points INT DEFAULT 0,
    total_earned INT DEFAULT 0, total_redeemed INT DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_customer (customer_email)
  )`);

  await connection.query(`CREATE TABLE IF NOT EXISTS loyalty_transactions (
    id INT AUTO_INCREMENT PRIMARY KEY, customer_email VARCHAR(255) NOT NULL,
    order_id INT, type ENUM('earn','redeem','expire','bonus') NOT NULL,
    points INT NOT NULL, description VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  // ── Live Chat ──
  await connection.query(`CREATE TABLE IF NOT EXISTS chat_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY, session_id VARCHAR(100) NOT NULL UNIQUE,
    customer_name VARCHAR(255), customer_email VARCHAR(255),
    status ENUM('open','closed') DEFAULT 'open',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`);

  await connection.query(`CREATE TABLE IF NOT EXISTS chat_messages (
    id INT AUTO_INCREMENT PRIMARY KEY, session_id VARCHAR(100) NOT NULL,
    sender ENUM('customer','admin','bot') NOT NULL,
    message TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  // ── Indexes ──
  await ensureIndex(connection, 'products', 'idx_products_active', 'active');
  await ensureIndex(connection, 'products', 'idx_products_brand_id', 'brand_id');
  await ensureIndex(connection, 'products', 'idx_products_featured', 'featured');
  await ensureIndex(connection, 'products', 'idx_products_created_at', 'created_at');
  await ensureIndex(connection, 'products', 'idx_products_slug', 'slug(191)');
  await ensureIndex(connection, 'orders', 'idx_orders_status', 'status');
  await ensureIndex(connection, 'orders', 'idx_orders_created_at', 'created_at');
  await ensureIndex(connection, 'orders', 'idx_orders_email', 'customer_email(191)');
  await ensureIndex(connection, 'reviews', 'idx_reviews_product_status', 'product_id, status');
  await ensureIndex(connection, 'coupons', 'idx_coupons_code', 'code');
  await ensureIndex(connection, 'newsletter_subscribers', 'idx_newsletter_email', 'email(191)');

  // ── Seed admin (first run only) ──
  const [users] = await connection.query('SELECT COUNT(*) as count FROM users');
  if (users[0].count === 0) {
    const bcrypt = require('bcryptjs');
    const pw = await bcrypt.hash(process.env.ADMIN_DEFAULT_PASSWORD || 'admin123', 12);
    await connection.query('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', ['admin', pw, 'super_admin']);
  }

  // ── Seed categories (first run only) ──
  const [cats] = await connection.query('SELECT COUNT(*) as count FROM categories');
  if (cats[0].count === 0) {
    await connection.query(`INSERT INTO categories (name, slug, sort_order) VALUES
      ('Casual','casual',1),('Corrida','corrida',2),('Basquete','basquete',3),
      ('Lifestyle','lifestyle',4),('Skate','skate',5),('Social','social',6)`);
  }

  await connection.end();
  console.log('Database initialized successfully');
}

module.exports = { pool, initDatabase, slugify };
