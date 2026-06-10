const { upload, processAndSave } = require('../middleware/upload');

const uploadController = {
  // Single image upload
  single: [
    upload.single('image'),
    async (req, res) => {
      try {
        if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada' });

        const category = req.body.category || 'general';
        const allowedCategories = ['products', 'banners', 'brands', 'general'];
        if (!allowedCategories.includes(category)) {
          return res.status(400).json({ error: 'Categoria inválida' });
        }

        const sizePresets = {
          products: { width: 800, height: 800, quality: 85 },
          banners: { width: 1920, height: 800, quality: 88 },
          brands: { width: 400, height: 400, quality: 90 },
          general: { width: 800, height: 800, quality: 82 },
        };

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
    upload.array('images', 4),
    async (req, res) => {
      try {
        if (!req.files || req.files.length === 0) {
          return res.status(400).json({ error: 'Nenhuma imagem enviada' });
        }

        const category = req.body.category || 'products';
        const sizePresets = {
          products: { width: 800, height: 800, quality: 85 },
          banners: { width: 1920, height: 800, quality: 88 },
          brands: { width: 400, height: 400, quality: 90 },
          general: { width: 800, height: 800, quality: 82 },
        };

        const urls = [];
        for (const file of req.files) {
          const url = await processAndSave(file.buffer, category, sizePresets[category] || sizePresets.general);
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
