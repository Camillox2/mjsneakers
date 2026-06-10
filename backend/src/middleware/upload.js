const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');

// Ensure directories exist
const dirs = ['products', 'banners', 'brands', 'general'];
dirs.forEach(dir => {
  const fullPath = path.join(UPLOAD_DIR, dir);
  if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true });
});

// Multer memory storage (for sharp processing)
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Formato de imagem não suportado. Use JPG, PNG, WebP ou GIF.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});

/**
 * Process uploaded file: convert to WebP, resize, save to disk
 * @param {Buffer} buffer - file buffer from multer
 * @param {string} category - 'products' | 'banners' | 'brands' | 'general'
 * @param {object} options - { width, height, quality }
 * @returns {string} - relative URL path: /uploads/category/filename.webp
 */
async function processAndSave(buffer, category = 'general', options = {}) {
  const { width = 800, height = 800, quality = 82 } = options;
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.webp`;
  const outputPath = path.join(UPLOAD_DIR, category, filename);

  await sharp(buffer)
    .resize(width, height, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality })
    .toFile(outputPath);

  return `/uploads/${category}/${filename}`;
}

module.exports = { upload, processAndSave };
