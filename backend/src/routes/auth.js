import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query, tx } from '../db.js';
import { wrap, badRequest, unauthorized, forbidden, conflict } from '../errors.js';
import { issueSession, clearSession, loadUser, requireLogin } from '../auth.js';
import { text } from '../validate.js';

const router = Router();

const publicUser = (u) => ({
  user_id: u.user_id,
  username: u.username,
  email: u.email,
  nickname: u.nickname,
  status: u.status,
  roles: u.roles,
  blog_id: u.blog_id,
  avatar: u.avatar,
  status_text: u.status_text,
  status_expires_at: u.status_expires_at,
});

function password(value, name = '密碼') {
  if (typeof value !== 'string' || value.length < 8) throw badRequest(`${name}至少需要 8 個字元`);
  if (value.length > 72) throw badRequest(`${name}最多 72 個字元`);
  return value;
}

// 註冊：同一交易建立帳號、User 身分與空間，避免有帳號卻沒有空間
router.post('/register', wrap(async (req, res) => {
  const username = text(req.body.username, '登入帳號', { min: 3, max: 30 }).toLowerCase();
  if (!/^[a-z0-9_.]+$/.test(username)) throw badRequest('登入帳號只能使用英文字母、數字、底線與句點');
  const email = text(req.body.email, '電子郵件', { max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest('電子郵件格式不正確');
  const pw = password(req.body.password);
  const nickname = text(req.body.nickname, '暱稱', { max: 50 });
  const blogName = text(req.body.blog_name, '空間名稱', { max: 100, optional: true }) || `${nickname}的日記`;
  const hash = await bcrypt.hash(pw, 10);

  const userId = await tx(async (client) => {
    const theme = await client.query(
      `SELECT theme_id FROM theme WHERE status = 'active' ORDER BY theme_id LIMIT 1 FOR SHARE`,
    );
    if (!theme.rows[0]) throw conflict('no_theme', '平台尚未提供任何主題，暫時無法註冊');
    const user = await client.query(
      `INSERT INTO user_account (username, email, password_hash, nickname)
       VALUES ($1, $2, $3, $4) RETURNING user_id`,
      [username, email, hash, nickname],
    );
    const id = user.rows[0].user_id;
    await client.query(`INSERT INTO user_role (user_id, role) VALUES ($1, 'User')`, [id]);
    await client.query(
      `INSERT INTO blog (user_id, theme_id, blog_name) VALUES ($1, $2, $3)`,
      [id, theme.rows[0].theme_id, blogName],
    );
    return id;
  });

  issueSession(res, userId);
  res.status(201).json({ user: publicUser(await loadUser(userId)) });
}));

router.post('/login', wrap(async (req, res) => {
  const login = text(req.body.username, '登入帳號或電子郵件', { max: 254 }).toLowerCase();
  const pw = typeof req.body.password === 'string' ? req.body.password : '';
  const { rows } = await query(
    'SELECT user_id, password_hash, status FROM user_account WHERE username = $1 OR email = $1',
    [login],
  );
  const row = rows[0];
  const ok = row ? await bcrypt.compare(pw, row.password_hash) : false;
  if (!ok) throw unauthorized('帳號或密碼不正確');
  if (row.status === 'deactivated') throw forbidden('這個帳號已停用');
  issueSession(res, row.user_id);
  res.json({ user: publicUser(await loadUser(row.user_id)) });
}));

router.post('/logout', (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  res.json({ user: req.user ? publicUser(req.user) : null });
});

// 修改密碼：停權帳號仍可修改自己的密碼
router.put('/password', requireLogin, wrap(async (req, res) => {
  const current = typeof req.body.current_password === 'string' ? req.body.current_password : '';
  const next = password(req.body.new_password, '新密碼');
  const { rows } = await query('SELECT password_hash FROM user_account WHERE user_id = $1', [req.user.user_id]);
  if (!(await bcrypt.compare(current, rows[0].password_hash))) throw badRequest('目前的密碼不正確');
  await query('UPDATE user_account SET password_hash = $1 WHERE user_id = $2', [
    await bcrypt.hash(next, 10),
    req.user.user_id,
  ]);
  res.json({ ok: true });
}));

export default router;
