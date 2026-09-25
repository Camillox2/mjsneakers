const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');

// Pastas aceitas. A categoria vem do cliente, então só nomes desta lista
// entram no caminho do arquivo.
const UPLOAD_CATEGORIES = ['products', 'banners', 'brands', 'general'];

// Ensure directories exist
UPLOAD_CATEGORIES.forEach(dir => {
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
    const error = new Error('Formato de imagem não suportado. Use JPG, PNG, WebP ou GIF.');
    error.code = 'INVALID_FILE_TYPE';
    cb(error, false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024, files: 4 } // 10MB max
});

// Converte erro do multer em resposta 4xx em vez de cair no handler genérico.
function handleUpload(middleware) {
  return (req, res, next) => {
    middleware(req, res, (error) => {
      if (!error) return next();
      if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'A imagem deve ter no máximo 10 MB' });
      if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({ error: 'Envie no máximo 4 imagens' });
      }
      return res.status(400).json({ error: error.message || 'Arquivo de imagem inválido' });
    });
  };
}

/**
 * Process uploaded file: convert to WebP, resize, save to disk
 * @param {Buffer} buffer - file buffer from multer
 * @param {string} category - 'products' | 'banners' | 'brands' | 'general'
 * @param {object} options - { width, height, quality }
 * @returns {string} - relative URL path: /uploads/category/filename.webp
 */
async function processAndSave(buffer, category = 'general', options = {}) {
  if (!UPLOAD_CATEGORIES.includes(category)) throw new Error('Categoria de upload inválida');
  const { width = 800, height = 800, quality = 82 } = options;
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.webp`;
  const outputPath = path.join(UPLOAD_DIR, category, filename);

  await sharp(buffer)
    .resize(width, height, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality })
    .toFile(outputPath);

  return `/uploads/${category}/${filename}`;
}

module.exports = { upload, handleUpload, processAndSave, UPLOAD_CATEGORIES };
