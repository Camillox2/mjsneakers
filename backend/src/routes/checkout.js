const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/db');

const router = express.Router();

function validateRequest(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Dados inválidos',
      details: errors.array().map(({ path: field, msg }) => ({ field, message: msg })),
    });
  }
  next();
}

router.post(
  '/event',
  body('session_id').optional({ nullable: true }).isString().trim().isLength({ max: 100 })
    .withMessage('session_id deve ter no máximo 100 caracteres'),
  body('step').isIn(['cart', 'personal_data', 'address', 'shipping', 'confirmed'])
    .withMessage('step inválido'),
  validateRequest,
  async (req, res) => {
    try {
      await pool.query(
        'INSERT INTO checkout_events (session_id, step) VALUES (?, ?)',
        [req.body.session_id || null, req.body.step]
      );
      res.status(201).json({ success: true });
    } catch (error) {
      console.error('Checkout event error:', error);
      res.status(500).json({ error: 'Erro ao registrar evento do checkout' });
    }
  }
);

module.exports = router;
