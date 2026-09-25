const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const {
  signToken, invalidateUserCache, ADMIN_ROLES, SESSION_TTL_SECONDS,
} = require('../middleware/auth');
const { auditReq, logAudit } = require('./auditController');
const { toBool } = require('../utils/validate');
const { ADMIN_COOKIE, CSRF_COOKIE, setSessionCookies, clearCookie } = require('../utils/cookies');
const { totpEncryptionKey, encrypt, decrypt, sha256, safeEqual } = require('../utils/secrets');
const totp = require('../utils/totp');

const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128;
const USERNAME_RE = /^[a-zA-Z0-9._-]{3,50}$/;
// Hash qualquer, só para o login de usuário inexistente gastar o mesmo tempo.
const DUMMY_HASH = bcrypt.hashSync('usuario-inexistente', 12);
const ADMIN_ROLE_LIST = [...ADMIN_ROLES];
const TOTP_ISSUER = 'Pizantt Drop';
// mfa_token: 5 min, só serve para o segundo passo do login; 5 erros travam.
const MFA_TTL_SECONDS = 5 * 60;
const MFA_MAX_FAILS = 5;
const mfaFails = new Map();

function validPassword(value) {
  return typeof value === 'string' && value.length >= MIN_PASSWORD && value.length <= MAX_PASSWORD;
}

function publicUser(user) {
  return { id: user.id, username: user.username, role: user.role, totp_enabled: Boolean(user.totp_enabled) };
}

// Grava a sessão no cookie pz_adm (httpOnly, 12 h) e o pz_csrf. O token só
// volta no corpo com o header X-Auth-Mode: bearer (scripts e testes).
function issueSession(req, res, user) {
  const token = signToken(user);
  const csrfToken = setSessionCookies(res, { name: ADMIN_COOKIE, token, maxAgeMs: SESSION_TTL_SECONDS * 1000 });
  const body = { user: publicUser(user), csrf_token: csrfToken };
  if (String(req.get('x-auth-mode') || '').toLowerCase() === 'bearer') body.token = token;
  return body;
}

function totpSecretOf(user) {
  return user.totp_secret ? decrypt(user.totp_secret, totpEncryptionKey()) : null;
}

// Confere o código TOTP e grava o passo usado (atômico: o mesmo código não
// vale duas vezes, nem em duas requisições ao mesmo tempo).
async function consumeTotp(user, code) {
  const secret = totpSecretOf(user);
  if (!secret) return false;
  const step = totp.verifyTotp(secret, code, { lastStep: user.totp_last_step });
  if (step === null) return false;
  const [result] = await pool.query(
    'UPDATE users SET totp_last_step = ? WHERE id = ? AND (totp_last_step IS NULL OR totp_last_step < ?)',
    [step, user.id, step]
  );
  return result.affectedRows === 1;
}

// Código de recuperação: vale uma vez (o hash sai da lista).
async function consumeRecovery(user, code) {
  const normalized = totp.normalizeRecovery(code);
  if (!normalized) return false;
  let hashes = [];
  try { hashes = JSON.parse(user.totp_recovery || '[]'); } catch (_error) { hashes = []; }
  const target = sha256(normalized);
  const index = hashes.findIndex((hash) => safeEqual(hash, target));
  if (index === -1) return false;
  hashes.splice(index, 1);
  const [result] = await pool.query(
    'UPDATE users SET totp_recovery = ? WHERE id = ? AND totp_recovery = ?',
    [JSON.stringify(hashes), user.id, user.totp_recovery]
  );
  return result.affectedRows === 1;
}

async function freshRecoveryCodes(userId) {
  const codes = totp.recoveryCodes(10);
  await pool.query('UPDATE users SET totp_recovery = ? WHERE id = ?', [JSON.stringify(codes.map(sha256)), userId]);
  return codes;
}

async function loadFullUser(id) {
  const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
  return rows[0] || null;
}

function twoFactorRequired(res) {
  return res.status(403).json({ code: '2fa_required', error: 'Ligue a verificação em duas etapas para fazer isso.' });
}

const authController = {
  // {username, password}. Com 2FA ligado, responde {mfa_required, mfa_token}.
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

      if (user.totp_enabled) {
        const mfaToken = jwt.sign(
          { sub: String(user.id), tv: Number(user.token_version || 0) },
          process.env.JWT_SECRET,
          { algorithm: 'HS256', audience: 'mfa', expiresIn: MFA_TTL_SECONDS, jwtid: crypto.randomUUID() }
        );
        return res.json({ mfa_required: true, mfa_token: mfaToken });
      }

      await pool.query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);
      logAudit({ adminId: user.id, adminUsername: user.username, action: 'login', entity: 'user', entityId: user.id, ip: String(req.ip || '').slice(0, 45) });
      res.json(issueSession(req, res, user));
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Erro no login' });
    }
  },

  // Segundo passo: {mfa_token, code | recovery_code}.
  async loginMfa(req, res) {
    const { mfa_token: mfaToken, code, recovery_code: recoveryCode } = req.body || {};
    let decoded;
    try {
      decoded = jwt.verify(String(mfaToken || ''), process.env.JWT_SECRET, { algorithms: ['HS256'], audience: 'mfa' });
    } catch (_error) {
      return res.status(401).json({ error: 'Login expirado. Entre de novo com usuário e senha.' });
    }
    const jti = decoded.jti;
    const now = Date.now();
    for (const [key, entry] of mfaFails) if (entry.expires < now) mfaFails.delete(key);
    const fails = mfaFails.get(jti);
    if (fails && fails.count >= MFA_MAX_FAILS) {
      return res.status(401).json({ code: 'mfa_locked', error: 'Muitos códigos errados. Entre de novo com usuário e senha.' });
    }
    try {
      const user = await loadFullUser(Number(decoded.sub));
      if (!user || !user.active || !user.totp_enabled || Number(user.token_version || 0) !== Number(decoded.tv || 0)) {
        return res.status(401).json({ error: 'Login expirado. Entre de novo com usuário e senha.' });
      }
      const ok = recoveryCode ? await consumeRecovery(user, recoveryCode) : await consumeTotp(user, code);
      if (!ok) {
        const entry = mfaFails.get(jti) || { count: 0, expires: decoded.exp * 1000 };
        entry.count += 1;
        mfaFails.set(jti, entry);
        return res.status(401).json({ error: 'Código inválido', attempts_left: Math.max(MFA_MAX_FAILS - entry.count, 0) });
      }
      mfaFails.set(jti, { count: MFA_MAX_FAILS, expires: decoded.exp * 1000 });
      await pool.query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);
      logAudit({
        adminId: user.id, adminUsername: user.username, action: recoveryCode ? 'login_recovery_code' : 'login', entity: 'user',
        entityId: user.id, ip: String(req.ip || '').slice(0, 45),
      });
      invalidateUserCache(user.id);
      res.json(issueSession(req, res, user));
    } catch (error) {
      console.error('Login MFA error:', error.message);
      res.status(500).json({ error: 'Erro no login' });
    }
  },

  async verifyToken(req, res) {
    res.json({ user: req.user });
  },

  async me(req, res) {
    res.json({ user: publicUser(req.user) });
  },

  // Sai desta sessão: limpa os cookies (não precisa estar logado).
  logout(req, res) {
    clearCookie(res, ADMIN_COOKIE);
    clearCookie(res, CSRF_COOKIE);
    res.json({ message: 'Sessão encerrada' });
  },

  // Sai de todas as sessões: sobe o token_version.
  async logoutAll(req, res) {
    try {
      await pool.query('UPDATE users SET token_version = token_version + 1 WHERE id = ?', [req.user.id]);
      invalidateUserCache(req.user.id);
      auditReq(req, 'logout_all', 'admin', req.user.id);
      clearCookie(res, ADMIN_COOKIE);
      clearCookie(res, CSRF_COOKIE);
      res.json({ message: 'Todas as sessões foram encerradas' });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao encerrar sessões' });
    }
  },

  // ---------- Verificação em duas etapas ----------
  async setup2fa(req, res) {
    try {
      const user = await loadFullUser(req.user.id);
      if (user.totp_enabled) return res.status(409).json({ error: 'A verificação em duas etapas já está ligada' });
      const secret = totp.generateSecret();
      await pool.query('UPDATE users SET totp_secret = ?, totp_last_step = NULL WHERE id = ?', [encrypt(secret, totpEncryptionKey()), user.id]);
      res.json({ secret, otpauth_url: totp.otpauthUrl({ secret, account: user.username, issuer: TOTP_ISSUER }) });
    } catch (error) {
      console.error('2FA setup error:', error.message);
      res.status(500).json({ error: 'Erro ao preparar a verificação em duas etapas' });
    }
  },

  async enable2fa(req, res) {
    try {
      const user = await loadFullUser(req.user.id);
      if (user.totp_enabled) return res.status(409).json({ error: 'A verificação em duas etapas já está ligada' });
      if (!user.totp_secret) return res.status(400).json({ error: 'Gere o código QR antes (POST /auth/2fa/setup)' });
      if (!(await consumeTotp(user, req.body?.code))) return res.status(400).json({ error: 'Código inválido' });
      await pool.query('UPDATE users SET totp_enabled = TRUE WHERE id = ?', [user.id]);
      const codes = await freshRecoveryCodes(user.id);
      invalidateUserCache(user.id);
      auditReq(req, 'enable_2fa', 'admin', user.id);
      res.json({ recovery_codes: codes });
    } catch (error) {
      console.error('2FA enable error:', error.message);
      res.status(500).json({ error: 'Erro ao ligar a verificação em duas etapas' });
    }
  },

  // {password, code}
  async disable2fa(req, res) {
    try {
      const user = await loadFullUser(req.user.id);
      if (!user.totp_enabled) return res.status(409).json({ error: 'A verificação em duas etapas já está desligada' });
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      if (!password || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ error: 'Senha incorreta' });
      if (!(await consumeTotp(user, req.body?.code))) return res.status(400).json({ error: 'Código inválido' });
      await pool.query(
        'UPDATE users SET totp_enabled = FALSE, totp_secret = NULL, totp_last_step = NULL, totp_recovery = NULL WHERE id = ?',
        [user.id]
      );
      invalidateUserCache(user.id);
      auditReq(req, 'disable_2fa', 'admin', user.id);
      res.json({ message: 'Verificação em duas etapas desligada' });
    } catch (error) {
      console.error('2FA disable error:', error.message);
      res.status(500).json({ error: 'Erro ao desligar a verificação em duas etapas' });
    }
  },

  // {code}: gera 10 códigos de recuperação novos (os antigos deixam de valer).
  async recoveryCodes(req, res) {
    try {
      const user = await loadFullUser(req.user.id);
      if (!user.totp_enabled) return twoFactorRequired(res);
      if (!(await consumeTotp(user, req.body?.code))) return res.status(400).json({ error: 'Código inválido' });
      const codes = await freshRecoveryCodes(user.id);
      auditReq(req, 'recovery_codes', 'admin', user.id);
      res.json({ recovery_codes: codes });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao gerar códigos de recuperação' });
    }
  },

  // ---------- Admins ----------
  // Lista quem tem acesso ao painel (admin e super_admin), com totp_enabled.
  async listAdmins(req, res) {
    try {
      const [rows] = await pool.query(
        'SELECT id, username, role, active, totp_enabled, last_login, created_at FROM users WHERE role IN (?) ORDER BY created_at DESC',
        [ADMIN_ROLE_LIST]
      );
      res.json(rows.map((row) => ({
        ...row, active: Boolean(row.active), totp_enabled: Boolean(row.totp_enabled), is_self: row.id === req.user.id,
      })));
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar admins' });
    }
  },

  // Cria admin (exige 2FA em quem cria). role 'admin' (padrão) ou
  // 'super_admin'; só um super_admin cria outro super_admin.
  async createAdmin(req, res) {
    try {
      if (!req.user.totp_enabled) return twoFactorRequired(res);
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

  // {active: boolean}, ou inverte se não vier. Desativar exige 2FA em quem faz.
  // Ninguém desativa a si mesmo nem o último admin ativo, e só super_admin
  // mexe em super_admin.
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
        if (!req.user.totp_enabled) {
          await conn.rollback();
          return twoFactorRequired(res);
        }
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

  // Troca a própria senha. Exige a senha atual; as outras sessões caem
  // (token_version) e esta recebe cookie novo (token no corpo só no modo bearer).
  async changePassword(req, res) {
    try {
      const { current_password, new_password } = req.body;
      if (typeof current_password !== 'string' || !current_password) {
        return res.status(400).json({ error: 'Informe a senha atual' });
      }
      if (!validPassword(new_password)) {
        return res.status(400).json({ error: `Nova senha deve ter de ${MIN_PASSWORD} a ${MAX_PASSWORD} caracteres` });
      }

      const [users] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
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
      res.json({ message: 'Senha alterada com sucesso', ...issueSession(req, res, user) });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao alterar senha' });
    }
  }
};

module.exports = authController;
