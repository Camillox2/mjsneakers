const { pool } = require('../config/db');
const { sendEmail, newsletterWelcomeEmail } = require('../services/emailService');
const { auditReq } = require('./auditController');
const { pagination, likeTerm } = require('../utils/validate');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WELCOME_COUPON = 'BEMVINDO10';

// Cupom de boas-vindas: 10%, uma vez por e-mail (coupon_redemptions).
async function ensureWelcomeCoupon() {
  await pool.query(
    `INSERT INTO coupons (code, type, value, min_order, active, once_per_email) VALUES (?, 'percent', 10, 0, TRUE, TRUE)
     ON DUPLICATE KEY UPDATE code = code`,
    [WELCOME_COUPON]
  );
}

const newsletterController = {
  // 201 {status:'subscribed'} | 200 {status:'returning'} | 409 {status:'already'}
  async subscribe(req, res) {
    try {
      const email = String(req.body.email || '').toLowerCase().trim();
      const name = req.body.name ? String(req.body.name).trim().slice(0, 255) : null;
      if (!email) return res.status(400).json({ error: 'E-mail obrigatório' });
      if (email.length > 255 || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'E-mail inválido' });

      const [existing] = await pool.query(
        'SELECT id, active, coupon_sent FROM newsletter_subscribers WHERE email = ?',
        [email]
      );

      if (existing.length > 0) {
        if (!existing[0].active) {
          await pool.query('UPDATE newsletter_subscribers SET active=1 WHERE id=?', [existing[0].id]);
          return res.json({ status: 'returning', message: 'Bem-vindo de volta!' });
        }
        return res.status(409).json({ status: 'already', error: 'E-mail já cadastrado' });
      }

      await ensureWelcomeCoupon();
      try {
        await pool.query(
          'INSERT INTO newsletter_subscribers (email, name, coupon_sent) VALUES (?, ?, ?)',
          [email, name, true]
        );
      } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ status: 'already', error: 'E-mail já cadastrado' });
        throw error;
      }

      // E-mail de boas-vindas não segura a resposta nem derruba a inscrição.
      setImmediate(() => {
        sendEmail(email, newsletterWelcomeEmail(email, name, WELCOME_COUPON)).catch(() => {});
      });

      res.status(201).json({ status: 'subscribed', message: 'Inscrito com sucesso! Verifique seu e-mail para o cupom de desconto.' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro ao inscrever no newsletter' });
    }
  },

  // Admin: lista paginada com busca por e-mail ou nome.
  async getAll(req, res) {
    try {
      const { page, limit, offset } = pagination(req.query, 30, 200);
      let where = 'WHERE 1=1';
      const params = [];
      if (req.query.search) {
        const term = likeTerm(req.query.search);
        where += ' AND (email LIKE ? OR name LIKE ?)';
        params.push(term, term);
      }
      if (req.query.active === '1' || req.query.active === '0') {
        where += ' AND active = ?';
        params.push(Number(req.query.active));
      }
      const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM newsletter_subscribers ${where}`, params);
      const [rows] = await pool.query(
        `SELECT id, email, name, active, coupon_sent, created_at FROM newsletter_subscribers ${where}
         ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );
      res.json({
        data: rows.map((row) => ({ ...row, active: Boolean(row.active), coupon_sent: Boolean(row.coupon_sent) })),
        total: Number(total),
        page,
        pages: Math.ceil(Number(total) / limit),
      });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar inscritos' });
    }
  },

  async unsubscribe(req, res) {
    try {
      const email = String(req.body.email || '').toLowerCase().trim();
      if (!email) return res.status(400).json({ error: 'E-mail obrigatório' });
      await pool.query('UPDATE newsletter_subscribers SET active=0 WHERE email=?', [email]);
      // Mesma resposta exista ou não o e-mail (não revela quem é inscrito).
      res.json({ message: 'Descadastrado com sucesso' });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao descadastrar' });
    }
  },

  // Admin: apaga o inscrito de vez (LGPD, pedido de remoção).
  async remove(req, res) {
    try {
      const [rows] = await pool.query('SELECT email FROM newsletter_subscribers WHERE id = ?', [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'Inscrito não encontrado' });
      await pool.query('DELETE FROM newsletter_subscribers WHERE id = ?', [req.params.id]);
      auditReq(req, 'delete', 'newsletter_subscriber', req.params.id);
      res.json({ message: 'Inscrito removido' });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao remover inscrito' });
    }
  },
};

module.exports = newsletterController;
