const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

async function migrateImages() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  console.log('Connected to database');

  // Alter table to support LONGTEXT for base64 images
  const columnsToAlter = ['image_url', 'image_url_2', 'image_url_3', 'image_url_4'];
  for (const col of columnsToAlter) {
    try {
      await connection.query(`ALTER TABLE products MODIFY COLUMN ${col} LONGTEXT`);
      console.log(`Altered column ${col} to LONGTEXT`);
    } catch (e) {
      console.log(`Column ${col} already LONGTEXT or error:`, e.message);
    }
  }

  // Also alter brands logo_url to LONGTEXT
  try {
    await connection.query('ALTER TABLE brands MODIFY COLUMN logo_url LONGTEXT');
    console.log('Altered brands.logo_url to LONGTEXT');
  } catch (e) {
    console.log('brands.logo_url error:', e.message);
  }

  // Add site_settings table for banners, logo etc
  await connection.query(`
    CREATE TABLE IF NOT EXISTS site_settings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      setting_key VARCHAR(100) NOT NULL UNIQUE,
      setting_value LONGTEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
  console.log('Created site_settings table');

  // Convert images to base64
  const rootDir = 'd:\\mjsneakers';
  
  const imageMap = {
    // LV Purple: frente tenis 1 = front, lateral tenis 1 = side  
    'lv_purple_front': path.join(rootDir, 'frente tenis 1.jpeg'),
    'lv_purple_side': path.join(rootDir, 'lateral tenis 1.jpeg'),
    'lv_purple_back': path.join(rootDir, 'tenis 1.jpeg'),
    // LV Blue: frente tenis 2 = front, lateral tenis 2 = side
    'lv_blue_front': path.join(rootDir, 'frente tenis 2.jpeg'),
    'lv_blue_side': path.join(rootDir, 'lateral tenis 2.jpeg'),
    'lv_blue_back': path.join(rootDir, 'tenis 2.jpeg'),
    // Logo
    'logo_png': path.join(rootDir, 'mjsenakers logo sem fundo.png'),
    'logo_jpeg': path.join(rootDir, 'logo mjsneakers.jpeg'),
  };

  const base64Images = {};
  for (const [key, filePath] of Object.entries(imageMap)) {
    try {
      const buffer = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
      base64Images[key] = `data:${mime};base64,${buffer.toString('base64')}`;
      console.log(`Converted ${key}: ${Math.round(buffer.length / 1024)}KB`);
    } catch (e) {
      console.log(`Failed to read ${key}: ${e.message}`);
    }
  }

  // Update LV Purple (id=1)
  if (base64Images.lv_purple_front) {
    await connection.query(
      'UPDATE products SET image_url=?, image_url_2=?, image_url_3=? WHERE id=1',
      [base64Images.lv_purple_front, base64Images.lv_purple_side || null, base64Images.lv_purple_back || null]
    );
    console.log('Updated LV Trainer Purple images');
  }

  // Update LV Blue (id=2)
  if (base64Images.lv_blue_front) {
    await connection.query(
      'UPDATE products SET image_url=?, image_url_2=?, image_url_3=? WHERE id=2',
      [base64Images.lv_blue_front, base64Images.lv_blue_side || null, base64Images.lv_blue_back || null]
    );
    console.log('Updated LV Trainer Blue images');
  }

  // Save logo to site_settings
  if (base64Images.logo_png) {
    await connection.query(
      'INSERT INTO site_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)',
      ['site_logo', base64Images.logo_png]
    );
    console.log('Saved logo (PNG transparent) to site_settings');
  }
  if (base64Images.logo_jpeg) {
    await connection.query(
      'INSERT INTO site_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)',
      ['site_logo_dark', base64Images.logo_jpeg]
    );
    console.log('Saved logo (JPEG dark) to site_settings');
  }

  await connection.end();
  console.log('\nMigration complete!');
}

migrateImages().catch(console.error);
