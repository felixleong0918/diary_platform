import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { config } from './config.js';
import { query } from './db.js';
import { unauthorized, forbidden, wrap } from './errors.js';

const COOKIE = 'token';
const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: config.cookieSecure,
  path: '/',
};

export function issueSession(res, userId) {
  const token = jwt.sign({ uid: userId }, config.jwtSecret, { expiresIn: '7d' });
  res.cookie(COOKIE, token, { ...cookieOptions, maxAge: 7 * 24 * 3600 * 1000 });
}

export function clearSession(res) {
  res.clearCookie(COOKIE, cookieOptions);
}

export async function loadUser(userId) {
  const { rows } = await query(
    `SELECT u.user_id, u.username, u.email, u.nickname, u.status, u.created_at,
            b.blog_id,
            ARRAY(SELECT role FROM user_role r WHERE r.user_id = u.user_id ORDER BY role) AS roles
       FROM user_account u
       LEFT JOIN blog b ON b.user_id = u.user_id
      WHERE u.user_id = $1`,
    [userId],
  );
  return rows[0] || null;
}

/**
 * 每個請求都重新讀取帳號狀態與身分，停權或停用會立即生效。
 * 另外核發匿名工作階段代號 sid，只用於 MongoDB 的瀏覽事件分析。
 */
export const attachUser = wrap(async (req, res, next) => {
  req.user = null;
  const token = req.cookies?.[COOKIE];
  if (token) {
    try {
      const { uid } = jwt.verify(token, config.jwtSecret);
      const user = await loadUser(uid);
      if (user && user.status !== 'deactivated') req.user = user;
      else clearSession(res);
    } catch {
      clearSession(res);
    }
  }
  let sid = req.cookies?.sid;
  if (!sid || !/^[0-9a-f-]{36}$/.test(sid)) {
    sid = crypto.randomUUID();
    res.cookie('sid', sid, { ...cookieOptions, maxAge: 30 * 24 * 3600 * 1000 });
  }
  req.sessionId = sid;
  next();
});

export function requireLogin(req, _res, next) {
  if (!req.user) return next(unauthorized());
  next();
}

/** 寫入操作：停權帳號僅保留唯讀管理。 */
export function requireActive(req, _res, next) {
  if (!req.user) return next(unauthorized());
  if (req.user.status !== 'active') return next(forbidden('帳號已被停權，目前只能瀏覽自己的內容'));
  next();
}

export function requireOperator(req, _res, next) {
  if (!req.user) return next(unauthorized());
  if (req.user.status !== 'active' || !req.user.roles.includes('Operator')) {
    return next(forbidden('需要平台營運者身分'));
  }
  next();
}
