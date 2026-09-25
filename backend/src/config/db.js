const mysql = require('mysql2/promise');
const crypto = require('crypto');
require('dotenv').config();

// Fuso das datas no banco. O Brasil não tem mais horário de verão, então um
// deslocamento fixo basta; DB_TIMEZONE troca (formato +HH:MM ou -HH:MM).
const DEFAULT_DB_TIMEZONE = '-03:00';
const DB_TIMEZONE = /^[+-](0\d|1[0-4]):[0-5]\d$/.test(process.env.DB_TIMEZONE || '')
  ? process.env.DB_TIMEZONE
  : DEFAULT_DB_TIMEZONE;
if (process.env.DB_TIMEZONE && process.env.DB_TIMEZONE !== DB_TIMEZONE) {
  console.warn(`[Aviso] DB_TIMEZONE "${process.env.DB_TIMEZONE}" inválido; usando ${DEFAULT_DB_TIMEZONE}.`);
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // DECIMAL chega como Number (preço, total, valor de cupom), não string.
  decimalNumbers: true,
  // Datas lidas e gravadas no mesmo fuso da sessão do banco (abaixo).
  timezone: DB_TIMEZONE
});

// Cada conexão nova do pool usa o fuso da loja: NOW(), CURDATE() e a
// leitura de TIMESTAMP ficam no horário de Brasília.
pool.on('connection', (connection) => {
  connection.query('SET time_zone = ?', [DB_TIMEZONE], (error) => {
    if (error) console.error('Erro ao ajustar o fuso da conexão:', error.message);
  });
});

// Devolve true quando a coluna acabou de ser criada (útil para migrar dado
// uma única vez junto com ela).
async function ensureColumn(connection, tableName, columnName, definition) {
  try {
    const [rows] = await connection.query(`SHOW COLUMNS FROM \`${tableName}\` LIKE ?`, [columnName]);
    if (rows.length === 0) {
      await connection.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`);
      return true;
    }
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }
  return false;
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
    timezone: DB_TIMEZONE,
  });
  await connection.query('SET time_zone = ?', [DB_TIMEZONE]);

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
  // Sobe a cada troca de senha: tokens emitidos antes deixam de valer.
  await ensureColumn(connection, 'users', 'token_version', 'INT NOT NULL DEFAULT 0');
  // Verificação em duas etapas (TOTP): segredo cifrado (AES-256-GCM), último
  // passo usado (não aceita o mesmo código duas vezes) e hashes dos códigos de recuperação.
  await ensureColumn(connection, 'users', 'totp_secret', 'TEXT DEFAULT NULL');
  await ensureColumn(connection, 'users', 'totp_enabled', 'BOOLEAN NOT NULL DEFAULT FALSE');
  await ensureColumn(connection, 'users', 'totp_last_step', 'BIGINT DEFAULT NULL');
  await ensureColumn(connection, 'users', 'totp_recovery', 'TEXT DEFAULT NULL');

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

  // Aviso por tamanho: '' significa "qualquer tamanho". A chave única passa a
  // incluir o tamanho (a antiga, só produto e e-mail, sai depois da nova existir).
  await ensureColumn(connection, 'stock_alerts', 'size', "VARCHAR(10) NOT NULL DEFAULT ''");
  const [alertSizeIndex] = await connection.query("SHOW INDEX FROM stock_alerts WHERE Key_name = 'unique_alert_size'");
  if (alertSizeIndex.length === 0) {
    await connection.query('ALTER TABLE stock_alerts ADD UNIQUE KEY unique_alert_size (product_id, email, size)');
  }
  const [alertOldIndex] = await connection.query("SHOW INDEX FROM stock_alerts WHERE Key_name = 'unique_alert'");
  if (alertOldIndex.length > 0) {
    await connection.query('ALTER TABLE stock_alerts DROP INDEX unique_alert');
  }

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
  // Imagem própria para celular (a principal continua em image_url).
  await ensureColumn(connection, 'banners', 'image_url_mobile', 'VARCHAR(2048) DEFAULT NULL');

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
  // 'reversal': estorno de pontos de pedido cancelado depois de entregue.
  // 'refund_redeem': devolução dos pontos usados num pedido cancelado.
  const [loyaltyType] = await connection.query("SHOW COLUMNS FROM loyalty_transactions LIKE 'type'");
  if (loyaltyType.length && !String(loyaltyType[0].Type).includes("'refund_redeem'")) {
    await connection.query(
      "ALTER TABLE loyalty_transactions MODIFY COLUMN type ENUM('earn','redeem','expire','bonus','reversal','refund_redeem') NOT NULL"
    );
  }
  await ensureIndex(connection, 'loyalty_transactions', 'idx_loyalty_tx_email', 'customer_email(191), created_at');

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
  // Último aviso por e-mail de mensagem sem atendente (no máximo 1 a cada 30 min).
  await ensureColumn(connection, 'chat_sessions', 'admin_notified_at', 'DATETIME DEFAULT NULL');

  // ── Advanced stock management ──
  await connection.query(`CREATE TABLE IF NOT EXISTS product_sizes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    size VARCHAR(10) NOT NULL,
    stock INT DEFAULT 0 CHECK (stock >= 0),
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    UNIQUE KEY unique_product_size (product_id, size)
  )`);

  await connection.query(`CREATE TABLE IF NOT EXISTS stock_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    size VARCHAR(10),
    type ENUM('sale','adjustment','return','import') NOT NULL,
    quantity_change INT NOT NULL,
    quantity_before INT NOT NULL,
    quantity_after INT NOT NULL,
    reason VARCHAR(255),
    admin_username VARCHAR(100),
    order_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  )`);

  await connection.query(`CREATE TABLE IF NOT EXISTS stock_thresholds (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL UNIQUE,
    threshold INT DEFAULT 5,
    notify_email VARCHAR(255),
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  )`);

  await connection.query(`CREATE TABLE IF NOT EXISTS cart_reservations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(100) NOT NULL,
    product_id INT NOT NULL,
    size VARCHAR(10) NOT NULL,
    quantity INT DEFAULT 1,
    reserved_until DATETIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  )`);

  await connection.query(`CREATE TABLE IF NOT EXISTS suppliers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    contact_name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    lead_days INT DEFAULT 7,
    notes TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await ensureColumn(connection, 'products', 'supplier_id', 'INT');

  // ── Advanced shipping management ──
  await connection.query(`CREATE TABLE IF NOT EXISTS shipping_zones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    states VARCHAR(200) NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await connection.query(`CREATE TABLE IF NOT EXISTS shipping_rules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    zone_id INT,
    name VARCHAR(100) NOT NULL,
    type ENUM('fixed','free','by_weight') DEFAULT 'fixed',
    price DECIMAL(10,2) DEFAULT 0 CHECK (price >= 0),
    free_above DECIMAL(10,2) DEFAULT NULL,
    estimated_days_min INT DEFAULT 3,
    estimated_days_max INT DEFAULT 10,
    max_weight_g INT DEFAULT NULL,
    active BOOLEAN DEFAULT TRUE,
    sort_order INT DEFAULT 0,
    FOREIGN KEY (zone_id) REFERENCES shipping_zones(id) ON DELETE SET NULL,
    CHECK (estimated_days_min <= estimated_days_max)
  )`);

  await connection.query(`CREATE TABLE IF NOT EXISTS shipping_labels (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL UNIQUE,
    carrier VARCHAR(50),
    tracking_code VARCHAR(100),
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id)
  )`);

  await connection.query(`CREATE TABLE IF NOT EXISTS whatsapp_notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    phone VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    wa_link TEXT NOT NULL,
    status ENUM('pending','sent','failed') DEFAULT 'pending',
    sent_at DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id)
  )`);

  await ensureColumn(connection, 'products', 'weight_g', 'INT DEFAULT 300');
  await ensureColumn(connection, 'products', 'height_cm', 'DECIMAL(5,1) DEFAULT 0');
  await ensureColumn(connection, 'products', 'width_cm', 'DECIMAL(5,1) DEFAULT 0');
  await ensureColumn(connection, 'products', 'length_cm', 'DECIMAL(5,1) DEFAULT 0');
  await ensureColumn(connection, 'orders', 'shipping_rule_id', 'INT');
  await ensureColumn(connection, 'orders', 'gift_wrap', 'BOOLEAN DEFAULT FALSE');
  await ensureColumn(connection, 'orders', 'gift_message', 'TEXT');
  // Valores calculados no servidor e marcas de "já feito" para cancelamento
  // (estoque devolvido) e entrega (pontos de fidelidade creditados).
  await ensureColumn(connection, 'orders', 'subtotal', 'DECIMAL(10,2) DEFAULT NULL');
  await ensureColumn(connection, 'orders', 'gift_wrap_price', 'DECIMAL(10,2) DEFAULT 0');
  await ensureColumn(connection, 'orders', 'stock_restored', 'BOOLEAN DEFAULT FALSE');
  await ensureColumn(connection, 'orders', 'loyalty_awarded', 'BOOLEAN DEFAULT FALSE');
  await ensureColumn(connection, 'orders', 'loyalty_reversed', 'BOOLEAN DEFAULT FALSE');

  // ── Pagamento online (Mercado Pago) ──
  await ensureColumn(connection, 'orders', 'payment_status',
    "ENUM('unpaid','pending','approved','rejected','refunded','charged_back','expired') DEFAULT 'unpaid'");
  await ensureColumn(connection, 'orders', 'payment_method', 'VARCHAR(20) DEFAULT NULL');
  await ensureColumn(connection, 'orders', 'payment_installments', 'INT DEFAULT NULL');
  await ensureColumn(connection, 'orders', 'paid_at', 'DATETIME DEFAULT NULL');
  // sha256 do token que a loja recebe ao criar o pedido (o token não fica no banco).
  await ensureColumn(connection, 'orders', 'access_token_hash', 'CHAR(64) DEFAULT NULL');
  await ensureColumn(connection, 'orders', 'pix_discount_amount', 'DECIMAL(10,2) DEFAULT 0');
  await connection.query(`CREATE TABLE IF NOT EXISTS payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    provider VARCHAR(20) NOT NULL DEFAULT 'mercadopago',
    provider_payment_id VARCHAR(40) DEFAULT NULL,
    method VARCHAR(20),
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    status_detail VARCHAR(80),
    amount DECIMAL(10,2) NOT NULL,
    installments INT DEFAULT NULL,
    qr_code TEXT,
    qr_code_base64 MEDIUMTEXT,
    ticket_url VARCHAR(500),
    expires_at DATETIME DEFAULT NULL,
    idempotency_key VARCHAR(64) NOT NULL,
    superseded BOOLEAN NOT NULL DEFAULT FALSE,
    raw JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_provider_payment (provider_payment_id),
    KEY idx_payments_order (order_id, id),
    KEY idx_payments_status_expires (status, expires_at),
    FOREIGN KEY (order_id) REFERENCES orders(id)
  )`);

  // Cupom de uso único por e-mail (ex.: BEMVINDO10 da newsletter).
  const addedOncePerEmail = await ensureColumn(connection, 'coupons', 'once_per_email', 'BOOLEAN DEFAULT FALSE');
  if (addedOncePerEmail) {
    await connection.query("UPDATE coupons SET once_per_email = TRUE WHERE code = 'BEMVINDO10'");
  }
  await connection.query(`CREATE TABLE IF NOT EXISTS coupon_redemptions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    coupon_id INT NOT NULL,
    customer_email VARCHAR(255) NOT NULL,
    order_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_coupon_email (coupon_id, customer_email),
    FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE CASCADE
  )`);
  // Cupons na conta do cliente: visível na conta, exclusivo de um e-mail
  // (NULL = todos) e descrição curta.
  await ensureColumn(connection, 'coupons', 'visible_in_account', 'BOOLEAN NOT NULL DEFAULT FALSE');
  await ensureColumn(connection, 'coupons', 'customer_email', 'VARCHAR(255) DEFAULT NULL');
  await ensureColumn(connection, 'coupons', 'description', 'VARCHAR(160) DEFAULT NULL');

  // ── Conta do cliente (login por código, sem senha) ──
  await connection.query(`CREATE TABLE IF NOT EXISTS customers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255),
    phone VARCHAR(50),
    marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
    token_version INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login_at DATETIME DEFAULT NULL,
    deleted_at DATETIME DEFAULT NULL
  )`);
  await connection.query(`CREATE TABLE IF NOT EXISTS customer_login_codes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    purpose VARCHAR(20) NOT NULL DEFAULT 'login',
    code_hash CHAR(64) NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    expires_at DATETIME NOT NULL,
    used_at DATETIME DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    KEY idx_login_codes_email (email(191), purpose, created_at)
  )`);
  await connection.query(`CREATE TABLE IF NOT EXISTS customer_wishlist (
    customer_id INT NOT NULL,
    product_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (customer_id, product_id),
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  )`);
  // Pontos usados como desconto no pedido (e se já voltaram no cancelamento).
  await ensureColumn(connection, 'orders', 'points_used', 'INT NOT NULL DEFAULT 0');
  await ensureColumn(connection, 'orders', 'points_discount', 'DECIMAL(10,2) NOT NULL DEFAULT 0');
  await ensureColumn(connection, 'orders', 'points_refunded', 'BOOLEAN NOT NULL DEFAULT FALSE');

  // ── LGPD: pedidos de titular e anonimização ──
  await connection.query(`CREATE TABLE IF NOT EXISTS privacy_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    type ENUM('access','correction','deletion','revoke_marketing') NOT NULL,
    email VARCHAR(255) NOT NULL,
    message TEXT,
    status ENUM('pending_verification','open','done','rejected') NOT NULL DEFAULT 'pending_verification',
    code_hash CHAR(64) DEFAULT NULL,
    code_expires_at DATETIME DEFAULT NULL,
    attempts INT NOT NULL DEFAULT 0,
    verified_at DATETIME DEFAULT NULL,
    admin_note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_privacy_status (status, created_at),
    KEY idx_privacy_email (email(191))
  )`);
  await ensureColumn(connection, 'orders', 'anonymized_at', 'DATETIME DEFAULT NULL');
  await ensureColumn(connection, 'orders', 'privacy_note', 'VARCHAR(120) DEFAULT NULL');

  // ── Nota fiscal (NF-e) ──
  await ensureColumn(connection, 'products', 'ncm', 'VARCHAR(8) DEFAULT NULL');
  await ensureColumn(connection, 'products', 'origin', 'VARCHAR(1) DEFAULT NULL');
  await ensureColumn(connection, 'products', 'gtin', 'VARCHAR(14) DEFAULT NULL');
  await connection.query(`CREATE TABLE IF NOT EXISTS invoices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    provider VARCHAR(20) NOT NULL DEFAULT 'focusnfe',
    ref VARCHAR(60) NOT NULL UNIQUE,
    status ENUM('processing','authorized','cancelled','error') NOT NULL DEFAULT 'processing',
    number VARCHAR(20) DEFAULT NULL,
    series VARCHAR(5) DEFAULT NULL,
    access_key VARCHAR(44) DEFAULT NULL,
    danfe_url VARCHAR(500) DEFAULT NULL,
    xml_url VARCHAR(500) DEFAULT NULL,
    error_message VARCHAR(1000) DEFAULT NULL,
    emailed_at DATETIME DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_invoices_order (order_id, id),
    KEY idx_invoices_status (status),
    FOREIGN KEY (order_id) REFERENCES orders(id)
  )`);

  // ── Visual site editor ──
  await connection.query(`CREATE TABLE IF NOT EXISTS custom_sections (
    id INT AUTO_INCREMENT PRIMARY KEY,
    type ENUM('video','lookbook','text_block','html') NOT NULL,
    title VARCHAR(255),
    content LONGTEXT,
    position_after VARCHAR(50),
    active BOOLEAN DEFAULT TRUE,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`);

  await connection.query(`CREATE TABLE IF NOT EXISTS theme_presets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    config LONGTEXT NOT NULL,
    is_active BOOLEAN DEFAULT FALSE,
    thumbnail VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await connection.query(`CREATE TABLE IF NOT EXISTS checkout_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(100),
    step ENUM('cart','personal_data','address','shipping','confirmed') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  const visualSettingDefaults = {
    home_sections_order: ['banner', 'ticker', 'brands', 'featured', 'catalog', 'newsletter', 'bottom_banner'],
    home_sections_visibility: {
      banner: true, ticker: true, brands: true, featured: true,
      catalog: true, newsletter: true, bottom_banner: true,
    },
    typography_heading_font: 'Inter',
    typography_body_font: 'Inter',
    typography_heading_size: '2.5rem',
    grid_columns_desktop: '3',
    show_price_strikethrough: 'true',
    show_discount_badge: 'true',
    show_product_rating: 'true',
    custom_css: '',
    announcement_bar: { active: false, text: '', bg_color: '#000000', text_color: '#ffffff', link: '' },
    popup_config: {
      active: false, trigger: 'time', delay_seconds: 10, title: '', text: '',
      button_text: '', coupon_code: '', image_url: '',
    },
    og_tags: { title: '', description: '', image_url: '' },
    hero_texts: {
      headline: '', subtitle: '', cta_primary_text: '', cta_primary_link: '',
      cta_secondary_text: '', cta_secondary_link: '',
    },
    trust_strip: [
      { icon: '', text: 'Frete Grátis' },
      { icon: '✅', text: 'Qualidade 100% garantida' },
      { icon: '', text: 'Troca Fácil' },
      { icon: '⚡', text: 'Entrega Rápida' },
    ],
    footer_texts: { email: '', phone: '', instagram: '', address: '', credits: '' },
    active_theme_id: '',
    // Programa de pontos: 10 pontos por real; 100 pontos = R$ 1; até 30% do
    // subtotal; mínimo de 500 pontos para usar.
    loyalty_enabled: 'true',
    loyalty_points_per_real: '10',
    loyalty_points_per_real_discount: '100',
    loyalty_max_redeem_percent: '30',
    loyalty_min_redeem: '500',
  };
  for (const [key, value] of Object.entries(visualSettingDefaults)) {
    const serialized = typeof value === 'object' ? JSON.stringify(value) : String(value);
    await connection.query(
      'INSERT IGNORE INTO site_settings (setting_key, setting_value) VALUES (?, ?)',
      [key, serialized]
    );
  }

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
  await ensureIndex(connection, 'stock_history', 'idx_stock_history_product_created', 'product_id, created_at');
  await ensureIndex(connection, 'cart_reservations', 'idx_cart_reservations_lookup', 'product_id, size, reserved_until');
  await ensureIndex(connection, 'cart_reservations', 'idx_cart_reservations_session', 'session_id');
  await ensureIndex(connection, 'shipping_rules', 'idx_shipping_rules_zone_active', 'zone_id, active, sort_order');
  await ensureIndex(connection, 'whatsapp_notifications', 'idx_whatsapp_order_created', 'order_id, created_at');
  await ensureIndex(connection, 'custom_sections', 'idx_custom_sections_active_sort', 'active, sort_order');
  await ensureIndex(connection, 'checkout_events', 'idx_checkout_events_session_created', 'session_id, created_at');
  await ensureIndex(connection, 'coupon_redemptions', 'idx_coupon_redemptions_order', 'order_id');
  await ensureIndex(connection, 'stock_alerts', 'idx_stock_alerts_notified', 'notified');
  await ensureIndex(connection, 'chat_messages', 'idx_chat_messages_session', 'session_id, id');
  await ensureIndex(connection, 'chat_sessions', 'idx_chat_sessions_status_updated', 'status, updated_at');
  await ensureIndex(connection, 'audit_logs', 'idx_audit_logs_entity_action', 'entity, action');
  await ensureIndex(connection, 'orders', 'idx_orders_status_payment', 'status, payment_status, created_at');

  // ── Seed admin (first run only) ──
  // Sem ADMIN_DEFAULT_PASSWORD, gera uma senha aleatória e mostra uma única
  // vez no console. Nunca existe senha padrão fixa.
  const [users] = await connection.query('SELECT COUNT(*) as count FROM users');
  if (Number(users[0].count) === 0) {
    const bcrypt = require('bcryptjs');
    const fromEnv = process.env.ADMIN_DEFAULT_PASSWORD;
    const initialPassword = fromEnv || crypto.randomBytes(12).toString('base64url');
    const pw = await bcrypt.hash(initialPassword, 12);
    await connection.query('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', ['admin', pw, 'super_admin']);
    if (fromEnv) {
      console.log('[Seed] Usuário "admin" criado com a senha de ADMIN_DEFAULT_PASSWORD.');
    } else {
      console.log(`[Seed] Usuário "admin" criado. Senha inicial (anote, não será mostrada de novo): ${initialPassword}`);
    }
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

module.exports = { pool, initDatabase, slugify, DB_TIMEZONE };
