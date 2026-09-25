const { upload, handleUpload, processAndSave, UPLOAD_CATEGORIES } = require('../middleware/upload');

const sizePresets = {
  products: { width: 800, height: 800, quality: 85 },
  banners: { width: 1920, height: 800, quality: 88 },
  brands: { width: 400, height: 400, quality: 90 },
  general: { width: 800, height: 800, quality: 82 },
};

function pickCategory(value, fallback) {
  const category = value || fallback;
  return UPLOAD_CATEGORIES.includes(category) ? category : null;
}

const uploadController = {
  // Single image upload
  single: [
    handleUpload(upload.single('image')),
    async (req, res) => {
      try {
        if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada' });

        const category = pickCategory(req.body.category, 'general');
        if (!category) return res.status(400).json({ error: 'Categoria inválida' });

        const url = await processAndSave(req.file.buffer, category, sizePresets[category]);
        res.json({ url, message: 'Imagem enviada com sucesso' });
      } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Erro ao enviar imagem' });
      }
    }
  ],

  // Multiple images upload (up to 4)
  multiple: [
    handleUpload(upload.array('images', 4)),
    async (req, res) => {
      try {
        if (!req.files || req.files.length === 0) {
          return res.status(400).json({ error: 'Nenhuma imagem enviada' });
        }

        // Mesma lista do upload simples: a categoria vira nome de pasta.
        const category = pickCategory(req.body.category, 'products');
        if (!category) return res.status(400).json({ error: 'Categoria inválida' });

        const urls = [];
        for (const file of req.files) {
          const url = await processAndSave(file.buffer, category, sizePresets[category]);
          urls.push(url);
        }

        res.json({ urls, message: `${urls.length} imagem(ns) enviada(s)` });
      } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Erro ao enviar imagens' });
      }
    }
  ]
};

module.exports = uploadController;
