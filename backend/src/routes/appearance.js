const fs = require('fs');
const express = require('express');
const multer = require('multer');
const { body, param, validationResult } = require('express-validator');
const { requireAdmin } = require('../middleware/auth');
const {
  appearanceController,
  VISUAL_SETTING_KEYS,
  OG_UPLOAD_DIR,
  sanitizeCustomCss,
  sanitizeHtmlContent,
} = require('../controllers/appearanceController');

const router = express.Router();
const visualSettingKeySet = new Set(VISUAL_SETTING_KEYS);
const allowedImageTypes = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

fs.mkdirSync(OG_UPLOAD_DIR, { recursive: true });

const ogUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, OG_UPLOAD_DIR),
    filename: (_req, file, callback) => {
      callback(null, `og-${Date.now()}${allowedImageTypes[file.mimetype]}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (!allowedImageTypes[file.mimetype]) {
      const error = new Error('Apenas imagens JPEG, PNG ou WebP são permitidas');
      error.code = 'INVALID_FILE_TYPE';
      return callback(error);
    }
    callback(null, true);
  },
});

function uploadOg(req, res, next) {
  ogUpload.single('image')(req, res, (error) => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'A imagem deve ter no máximo 5 MB' });
    }
    return res.status(400).json({ error: error.message || 'Arquivo de imagem inválido' });
  });
}

function validateRequest(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    if (req.file?.path) fs.promises.unlink(req.file.path).catch(() => {});
    return res.status(400).json({
      error: 'Dados inválidos',
      details: errors.array().map(({ path: field, msg }) => ({ field, message: msg })),
    });
  }
  next();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateNestedVisualSettings(payload) {
  if (payload.custom_css !== undefined && typeof payload.custom_css !== 'string') {
    throw new Error('custom_css deve ser uma string');
  }
  if (payload.og_tags !== undefined) {
    if (!isPlainObject(payload.og_tags)) throw new Error('og_tags deve ser um objeto');
    if (String(payload.og_tags.title || '').length > 60) throw new Error('og_tags.title deve ter no máximo 60 caracteres');
    if (String(payload.og_tags.description || '').length > 160) {
      throw new Error('og_tags.description deve ter no máximo 160 caracteres');
    }
  }
  if (payload.announcement_bar !== undefined) {
    if (!isPlainObject(payload.announcement_bar)) throw new Error('announcement_bar deve ser um objeto');
    if (String(payload.announcement_bar.text || '').length > 200) {
      throw new Error('announcement_bar.text deve ter no máximo 200 caracteres');
    }
  }
  if (payload.popup_config !== undefined) {
    if (!isPlainObject(payload.popup_config)) throw new Error('popup_config deve ser um objeto');
    const delay = Number(payload.popup_config.delay_seconds);
    if (!Number.isFinite(delay) || delay < 3 || delay > 120) {
      throw new Error('popup_config.delay_seconds deve estar entre 3 e 120');
    }
  }
  return true;
}

function sanitizeSettings(payload) {
  if (!isPlainObject(payload)) return payload;
  const sanitized = { ...payload };
  if (typeof sanitized.custom_css === 'string') sanitized.custom_css = sanitizeCustomCss(sanitized.custom_css);
  return sanitized;
}

function sanitizeThemeConfig(config) {
  if (!isPlainObject(config)) return config;
  const sanitized = { ...config };
  if (typeof sanitized.custom_css === 'string') sanitized.custom_css = sanitizeCustomCss(sanitized.custom_css);
  return sanitized;
}

const positiveId = param('id').isInt({ min: 1 }).withMessage('id deve ser um inteiro positivo').toInt();

router.get('/settings', appearanceController.getSettings);
router.post(
  '/settings',
  ...requireAdmin,
  body().customSanitizer(sanitizeSettings),
  body().custom((payload) => {
    if (!isPlainObject(payload) || Object.keys(payload).length === 0) throw new Error('O body deve ser um objeto não vazio');
    const unknownKeys = Object.keys(payload).filter((key) => !visualSettingKeySet.has(key));
    if (unknownKeys.length) throw new Error(`Chaves desconhecidas: ${unknownKeys.join(', ')}`);
    return validateNestedVisualSettings(payload);
  }),
  validateRequest,
  appearanceController.saveSettings
);

router.get('/sections-config', appearanceController.getSectionsConfig);
router.put(
  '/sections-config',
  ...requireAdmin,
  body('order').isArray({ min: 1 }).withMessage('order deve ser um array não vazio')
    .custom((order) => order.every((item) => typeof item === 'string' && item.trim() !== ''))
    .withMessage('order deve conter apenas strings não vazias'),
  body('visibility').custom((visibility) => isPlainObject(visibility)
      && Object.values(visibility).every((value) => typeof value === 'boolean'))
    .withMessage('visibility deve ser um objeto com valores booleanos'),
  validateRequest,
  appearanceController.saveSectionsConfig
);

router.get('/custom-sections', appearanceController.getCustomSections);
const customSectionValidations = () => [
  body('type').isIn(['video', 'lookbook', 'text_block', 'html']).withMessage('type inválido'),
  body('title').optional({ nullable: true }).isString().trim().isLength({ max: 255 }),
  body('content').custom((content) => isPlainObject(content)).withMessage('content deve ser um objeto')
    .customSanitizer((content, { req }) => req.body.type === 'html' ? sanitizeHtmlContent(content) : content),
  body('position_after').optional({ nullable: true }).isString().trim().isLength({ max: 50 }),
  body('active').optional().isBoolean().withMessage('active deve ser booleano').toBoolean(),
  body('sort_order').optional().isInt().withMessage('sort_order deve ser um inteiro').toInt(),
];
router.post(
  '/custom-sections',
  ...requireAdmin,
  ...customSectionValidations(),
  validateRequest,
  appearanceController.createCustomSection
);
router.put(
  '/custom-sections/:id',
  ...requireAdmin,
  positiveId,
  ...customSectionValidations(),
  validateRequest,
  appearanceController.updateCustomSection
);
router.delete('/custom-sections/:id', ...requireAdmin, positiveId, validateRequest, appearanceController.deleteCustomSection);

router.get('/theme-presets', appearanceController.getThemePresets);
router.post(
  '/theme-presets',
  ...requireAdmin,
  body('name').isString().trim().notEmpty().withMessage('name é obrigatório')
    .isLength({ max: 50 }).withMessage('name deve ter no máximo 50 caracteres'),
  body('config').customSanitizer(sanitizeThemeConfig)
    .custom((config) => isPlainObject(config) && Object.keys(config).length > 0)
    .withMessage('config deve ser um objeto não vazio')
    .custom(validateNestedVisualSettings),
  validateRequest,
  appearanceController.createThemePreset
);
router.put(
  '/theme-presets/:id/activate',
  ...requireAdmin,
  param('id').isInt().withMessage('id deve ser um inteiro').toInt(),
  validateRequest,
  appearanceController.activateThemePreset
);
router.delete('/theme-presets/:id', ...requireAdmin, positiveId, validateRequest, appearanceController.deleteThemePreset);

router.get('/google-fonts', appearanceController.getGoogleFonts);
router.post(
  '/upload-og-image',
  ...requireAdmin,
  uploadOg,
  body('_file').custom((_, { req }) => {
    if (!req.file) throw new Error('A imagem é obrigatória no campo image');
    return true;
  }),
  validateRequest,
  appearanceController.uploadOgImage
);

module.exports = router;
