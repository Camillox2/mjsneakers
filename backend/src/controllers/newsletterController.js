const { pool } = require('../config/db');
const { sendEmail, newsletterWelcomeEmail } = require('../services/emailService');

const newsletterController = {
  async subscribe(req, res) {
    try {
      const { email, name } = req.body;
      if (!email) return res.status(400).json({ error: 'E-mail obrigatório' });

      const [existing] = await pool.query(
        'SELECT id, coupon_sent FROM newsletter_subscribers WHERE email = ?',
        [email.toLowerCase().trim()]
      );

      if (existing.length > 0) {
        if (!existing[0].active) {
          await pool.query('UPDATE newsletter_subscribers SET active=1 WHERE id=?', [existing[0].id]);
          return res.json({ message: 'Bem-vindo de volta!' });
        }
        return res.status(409).json({ error: 'E-mail já cadastrado' });
      }

      // Gerar cupom de boas-vindas
      const couponCode = 'BEMVINDO10';
      const [couponExists] = await pool.query('SELECT id FROM coupons WHERE code = ?', [couponCode]);
      if (couponExists.length === 0) {
        await pool.query(
          'INSERT INTO coupons (code, type, value, min_order, active) VALUES (?, ?, ?, ?, ?)',
          [couponCode, 'percent', 10, 0, true]
        );
      }

      await pool.query(
        'INSERT INTO newsletter_subscribers (email, name, coupon_sent) VALUES (?, ?, ?)',
        [email.toLowerCase().trim(), name || null, true]
      );

      // Enviar email de boas-vindas
      const template = newsletterWelcomeEmail(email, name, couponCode);
      await sendEmail(email, template);

      res.status(201).json({ message: 'Inscrito com sucesso! Verifique seu e-mail para o cupom de desconto.' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro ao inscrever no newsletter' });
    }
  },

  async getAll(req, res) {
    try {
      const [rows] = await pool.query(
        'SELECT * FROM newsletter_subscribers ORDER BY created_at DESC'
      );
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar inscritos' });
    }
  },

  async unsubscribe(req, res) {
    try {
      const { email } = req.body;
      await pool.query(
        'UPDATE newsletter_subscribers SET active=0 WHERE email=?',
        [email?.toLowerCase().trim()]
      );
      res.json({ message: 'Descadastrado com sucesso' });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao descadastrar' });
    }
  },
};

module.exports = newsletterController;
