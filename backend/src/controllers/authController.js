const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

const authController = {
  async login(req, res) {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
      }

      const [users] = await pool.query('SELECT * FROM users WHERE username = ? AND active = TRUE', [username]);

      if (users.length === 0) {
        return res.status(401).json({ error: 'Credenciais inválidas' });
      }

      const user = users[0];
      const validPassword = await bcrypt.compare(password, user.password);

      if (!validPassword) {
        return res.status(401).json({ error: 'Credenciais inválidas' });
      }

      // Update last_login
      await pool.query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);

      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.json({
        token,
        user: { id: user.id, username: user.username, role: user.role }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Erro no login' });
    }
  },

  async verifyToken(req, res) {
    res.json({ user: req.user });
  },

  // Admin: list all admin users
  async listAdmins(req, res) {
    try {
      const [rows] = await pool.query(
        'SELECT id, username, role, active, last_login, created_at FROM users WHERE role = ? ORDER BY created_at DESC',
        ['admin']
      );
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar admins' });
    }
  },

  // Admin: create new admin
  async createAdmin(req, res) {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
      }
      if (password.length < 6) {
        return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres' });
      }
      const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
      if (existing.length > 0) {
        return res.status(409).json({ error: 'Usuário já existe' });
      }

      const hashedPassword = await bcrypt.hash(password, 12);
      const [result] = await pool.query(
        'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
        [username, hashedPassword, 'admin']
      );
      res.status(201).json({ id: result.insertId, message: 'Admin criado' });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao criar admin' });
    }
  },

  // Admin: toggle active status
  async toggleAdmin(req, res) {
    try {
      const { active } = req.body;
      // Prevent disabling yourself
      if (parseInt(req.params.id) === req.user.id && !active) {
        return res.status(400).json({ error: 'Não é possível desativar seu próprio usuário' });
      }
      await pool.query('UPDATE users SET active = ? WHERE id = ?', [active, req.params.id]);
      res.json({ message: active ? 'Admin ativado' : 'Admin desativado' });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao atualizar admin' });
    }
  },

  // Admin: change password
  async changePassword(req, res) {
    try {
      const { current_password, new_password } = req.body;
      if (!new_password || new_password.length < 6) {
        return res.status(400).json({ error: 'Nova senha deve ter no mínimo 6 caracteres' });
      }

      const [users] = await pool.query('SELECT password FROM users WHERE id = ?', [req.user.id]);
      if (users.length === 0) return res.status(404).json({ error: 'Usuário não encontrado' });

      if (current_password) {
        const valid = await bcrypt.compare(current_password, users[0].password);
        if (!valid) return res.status(401).json({ error: 'Senha atual incorreta' });
      }

      const hashed = await bcrypt.hash(new_password, 12);
      await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashed, req.user.id]);
      res.json({ message: 'Senha alterada com sucesso' });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao alterar senha' });
    }
  }
};

module.exports = authController;
