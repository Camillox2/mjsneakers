const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const { signToken, invalidateUserCache, ADMIN_ROLES } = require('../middleware/auth');
const { auditReq, logAudit } = require('./auditController');
const { toBool } = require('../utils/validate');

const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128;
const USERNAME_RE = /^[a-zA-Z0-9._-]{3,50}$/;
// Hash qualquer, só para o login de usuário inexistente gastar o mesmo tempo.
const DUMMY_HASH = bcrypt.hashSync('usuario-inexistente', 12);
const ADMIN_ROLE_LIST = [...ADMIN_ROLES];

function validPassword(value) {
  return typeof value === 'string' && value.length >= MIN_PASSWORD && value.length <= MAX_PASSWORD;
}

const authController = {
  async login(req, res) {
    try {
      const { username, password } = req.body;

      if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
        return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
      }
      if (username.length > 100 || password.length > MAX_PASSWORD) {
        return res.status(401).json({ error: 'Credenciais inválidas' });
      }

      const [users] = await pool.query('SELECT * FROM users WHERE username = ? AND active = TRUE', [username]);
      const user = users[0];
      const validPasswordMatch = await bcrypt.compare(password, user ? user.password : DUMMY_HASH);

      if (!user || !validPasswordMatch) {
        return res.status(401).json({ error: 'Credenciais inválidas' });
      }

      // Update last_login
      await pool.query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);
      logAudit({ adminId: user.id, adminUsername: user.username, action: 'login', entity: 'user', entityId: user.id, ip: String(req.ip || '').slice(0, 45) });

      res.json({
        token: signToken(user),
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

  // Admin: lista quem tem acesso ao painel (admin e super_admin).
  async listAdmins(req, res) {
    try {
      const [rows] = await pool.query(
        'SELECT id, username, role, active, last_login, created_at FROM users WHERE role IN (?) ORDER BY created_at DESC',
        [ADMIN_ROLE_LIST]
      );
      res.json(rows.map((row) => ({ ...row, active: Boolean(row.active), is_self: row.id === req.user.id })));
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar admins' });
    }
  },

  // Admin: cria admin. role 'admin' (padrão) ou 'super_admin'; só um
  // super_admin cria outro super_admin.
  async createAdmin(req, res) {
    try {
      const { username, password } = req.body;
      const role = req.body.role === undefined || req.body.role === null || req.body.role === '' ? 'admin' : req.body.role;
      if (!ADMIN_ROLES.has(role)) return res.status(400).json({ error: 'role deve ser admin ou super_admin' });
      if (role === 'super_admin' && req.user.role !== 'super_admin') {
        return res.status(403).json({ error: 'Só um super_admin pode criar outro super_admin' });
      }
      if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
        return res.status(400).json({ error: 'Usuário deve ter de 3 a 50 letras, números, ponto, _ ou -' });
      }
      if (!validPassword(password)) {
        return res.status(400).json({ error: `Senha deve ter de ${MIN_PASSWORD} a ${MAX_PASSWORD} caracteres` });
      }
      const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
      if (existing.length > 0) {
        return res.status(409).json({ error: 'Usuário já existe' });
      }

      const hashedPassword = await bcrypt.hash(password, 12);
      const [result] = await pool.query(
        'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
        [username, hashedPassword, role]
      );
      auditReq(req, 'create', 'admin', result.insertId, { username, role });
      res.status(201).json({ id: result.insertId, message: 'Admin criado' });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao criar admin' });
    }
  },

  // Admin: {active: boolean}, ou inverte se não vier. Ninguém desativa a si
  // mesmo nem o último admin ativo, e só super_admin mexe em super_admin.
  async toggleAdmin(req, res) {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'id inválido' });
    let requested;
    if (req.body && req.body.active !== undefined) {
      requested = toBool(req.body.active);
      if (requested === undefined) return res.status(400).json({ error: 'active deve ser booleano' });
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query('SELECT id, username, role, active FROM users WHERE id = ? FOR UPDATE', [id]);
      const target = rows[0];
      if (!target || !ADMIN_ROLES.has(target.role)) {
        await conn.rollback();
        return res.status(404).json({ error: 'Admin não encontrado' });
      }
      const active = requested === undefined ? !target.active : requested;
      if (target.role === 'super_admin' && req.user.role !== 'super_admin') {
        await conn.rollback();
        return res.status(403).json({ error: 'Só um super_admin pode ativar ou desativar outro super_admin' });
      }

      if (!active) {
        if (id === req.user.id) {
          await conn.rollback();
          return res.status(400).json({ error: 'Não é possível desativar seu próprio usuário' });
        }
        const [[{ others }]] = await conn.query(
          'SELECT COUNT(*) AS others FROM users WHERE role IN (?) AND active = TRUE AND id <> ?',
          [ADMIN_ROLE_LIST, id]
        );
        if (Number(others) === 0) {
          await conn.rollback();
          return res.status(400).json({ error: 'Não é possível desativar o último admin ativo' });
        }
      }

      await conn.query('UPDATE users SET active = ? WHERE id = ?', [active, id]);
      await conn.commit();
      invalidateUserCache(id);
      auditReq(req, active ? 'activate' : 'deactivate', 'admin', id, { username: target.username });
      res.json({ message: active ? 'Admin ativado' : 'Admin desativado', active });
    } catch (error) {
      await conn.rollback();
      res.status(500).json({ error: 'Erro ao atualizar admin' });
    } finally {
      conn.release();
    }
  },

  // Troca a própria senha. Exige a senha atual; tokens antigos deixam de
  // valer e a resposta traz um token novo.
  async changePassword(req, res) {
    try {
      const { current_password, new_password } = req.body;
      if (typeof current_password !== 'string' || !current_password) {
        return res.status(400).json({ error: 'Informe a senha atual' });
      }
      if (!validPassword(new_password)) {
        return res.status(400).json({ error: `Nova senha deve ter de ${MIN_PASSWORD} a ${MAX_PASSWORD} caracteres` });
      }

      const [users] = await pool.query('SELECT id, username, role, password, token_version FROM users WHERE id = ?', [req.user.id]);
      if (users.length === 0) return res.status(404).json({ error: 'Usuário não encontrado' });

      const valid = await bcrypt.compare(current_password, users[0].password);
      if (!valid) return res.status(401).json({ error: 'Senha atual incorreta' });
      if (await bcrypt.compare(new_password, users[0].password)) {
        return res.status(400).json({ error: 'A nova senha deve ser diferente da atual' });
      }

      const hashed = await bcrypt.hash(new_password, 12);
      await pool.query('UPDATE users SET password = ?, token_version = token_version + 1 WHERE id = ?', [hashed, req.user.id]);
      invalidateUserCache(req.user.id);
      auditReq(req, 'change_password', 'admin', req.user.id);
      const user = { ...users[0], token_version: Number(users[0].token_version || 0) + 1 };
      res.json({ message: 'Senha alterada com sucesso', token: signToken(user) });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao alterar senha' });
    }
  }
};

module.exports = authController;
