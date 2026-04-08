const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function initDatabase() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\``);
  await connection.query(`USE \`${process.env.DB_NAME}\``);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(100) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      role ENUM('admin', 'user') DEFAULT 'user',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS brands (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      logo_url LONGTEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      price DECIMAL(10, 2) NOT NULL,
      brand_id INT,
      image_url LONGTEXT,
      image_url_2 LONGTEXT,
      image_url_3 LONGTEXT,
      image_url_4 LONGTEXT,
      sizes VARCHAR(500),
      stock INT DEFAULT 0,
      active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (brand_id) REFERENCES brands(id)
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      customer_name VARCHAR(255),
      customer_email VARCHAR(255),
      customer_phone VARCHAR(50),
      total DECIMAL(10, 2),
      status ENUM('pending', 'confirmed', 'shipped', 'delivered', 'cancelled') DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

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

  await connection.query(`
    CREATE TABLE IF NOT EXISTS site_settings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      setting_key VARCHAR(100) NOT NULL UNIQUE,
      setting_value LONGTEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

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

  // Seed brands
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

  // Seed admin user (password: admin123)
  const [users] = await connection.query('SELECT COUNT(*) as count FROM users');
  if (users[0].count === 0) {
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await connection.query(
      'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
      ['admin', hashedPassword, 'admin']
    );
  }

  // Seed products
  const [products] = await connection.query('SELECT COUNT(*) as count FROM products');
  if (products[0].count === 0) {
    await connection.query(`
      INSERT INTO products (name, description, price, brand_id, image_url, image_url_2, sizes, stock) VALUES
      ('LV Trainer Purple', 'Louis Vuitton LV Trainer Sneaker em tons de roxo. Design icônico com monograma LV e acabamento premium em couro e mesh.', 8900.00, 5, '/products/lv-purple-front.jpg', '/products/lv-purple-side.jpg', '38,39,40,41,42,43,44', 5),
      ('LV Trainer Blue', 'Louis Vuitton LV Trainer Sneaker em tons de azul. Silhueta chunky com detalhes em couro, mesh e monograma LV.', 8900.00, 5, '/products/lv-blue-front.jpg', '/products/lv-blue-side.jpg', '38,39,40,41,42,43,44', 3),
      ('Air Max 90', 'Nike Air Max 90 clássico. Amortecimento Air visível no calcanhar, design atemporal.', 899.90, 1, '/products/placeholder.jpg', NULL, '38,39,40,41,42,43,44', 10),
      ('Ultraboost 22', 'Adidas Ultraboost 22 com tecnologia Boost para máximo retorno de energia.', 999.90, 2, '/products/placeholder.jpg', NULL, '38,39,40,41,42,43', 8),
      ('RS-X', 'Puma RS-X com design futurista e amortecimento Running System.', 699.90, 3, '/products/placeholder.jpg', NULL, '39,40,41,42,43', 12),
      ('574 Classic', 'New Balance 574 clássico. Conforto e estilo atemporal.', 599.90, 4, '/products/placeholder.jpg', NULL, '38,39,40,41,42,43,44', 15),
      ('Air Jordan 1 High', 'Nike Air Jordan 1 High OG. O tênis mais icônico da história do basquete.', 1299.90, 1, '/products/placeholder.jpg', NULL, '39,40,41,42,43,44', 6),
      ('Yeezy 350 V2', 'Adidas Yeezy Boost 350 V2. Design de Kanye West com Boost completo.', 1499.90, 2, '/products/placeholder.jpg', NULL, '38,39,40,41,42,43', 4)
    `);
  }

  await connection.end();
  console.log('Database initialized successfully');
}

module.exports = { pool, initDatabase };
