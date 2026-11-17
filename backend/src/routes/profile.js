// 大頭貼、現在的心情、表情回應與通知
import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import * as storage from '../storage.js';
import { query, tx } from '../db.js';
import { wrap, badRequest, unavailable, notFound } from '../errors.js';
import { requireLogin, requireActive } from '../auth.js';
import { readableBy, canRead, lockEntryContext } from '../access.js';
import { text, id, oneOf, paging } from '../validate.js';
import { avatarSql, notify, REACTIONS } from '../people.js';

const router = Router();

// ---- 大頭貼：公開顯示，不含權限檢查；資料庫只存位置 ---------------------
const MIME_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (MIME_EXT[file.mimetype]) cb(null, true);
    else cb(badRequest('大頭貼只接受 JPG、PNG 或 WebP'));
  },
});

router.get('/avatars/:userId', wrap(async (req, res) => {
  const userId = id(req.params.userId, '使用者代號', 'U');
  const { rows } = await query('SELECT avatar_url FROM user_account WHERE user_id = $1', [userId]);
  const file = rows[0]?.avatar_url ? await storage.read(rows[0].avatar_url) : null;
  if (!file) throw notFound('沒有大頭貼');
  res.set('Content-Type', file.contentType);
  res.set('X-Content-Type-Options', 'nosniff');
  // 網址帶有檔名片段，換圖後網址會變，所以可以長時間快取
  res.set('Cache-Control', req.query.v ? 'public, max-age=31536000, immutable' : 'no-cache');
  res.send(file.buffer);
}));

router.put('/me/avatar', requireActive, upload.single('avatar'), wrap(async (req, res) => {
  if (!req.file) throw badRequest('請選擇一張圖片');
  const location = await storage.save(`avatar-${crypto.randomUUID()}${MIME_EXT[req.file.mimetype]}`, req.file.buffer);
  try {
    const old = await tx(async (client) => {
      const cur = await client.query('SELECT avatar_url FROM user_account WHERE user_id = $1 FOR UPDATE', [req.user.user_id]);
      await client.query('UPDATE user_account SET avatar_url = $2 WHERE user_id = $1', [req.user.user_id, location]);
      return cur.rows[0].avatar_url;
    });
    await storage.remove(old);
    res.json({ ok: true });
  } catch (err) {
    await storage.remove(location);
    throw err;
  }
}));

router.delete('/me/avatar', requireActive, wrap(async (req, res) => {
  const { rows } = await query(
    `UPDATE user_account u SET avatar_url = NULL
       FROM (SELECT user_id, avatar_url FROM user_account WHERE user_id = $1 FOR UPDATE) old
      WHERE u.user_id = old.user_id RETURNING old.avatar_url`,
    [req.user.user_id],
  );
  await storage.remove(rows[0]?.avatar_url);
  res.json({ ok: true });
}));

// ---- 現在的心情：一句話，到期後自動不再顯示 -----------------------------
const STATUS_HOURS = { '4h': 4, '24h': 24, '7d': 168 };
router.put('/me/status', requireActive, wrap(async (req, res) => {
  const statusText = text(req.body.status_text, '現在的心情', { max: 60 });
  const duration = oneOf(req.body.duration ?? '24h', '顯示時間', Object.keys(STATUS_HOURS));
  const { rows } = await query(
    `UPDATE user_account SET status_text = $2, status_expires_at = now() + make_interval(hours => $3)
      WHERE user_id = $1 RETURNING status_text, status_expires_at`,
    [req.user.user_id, statusText, STATUS_HOURS[duration]],
  );
  res.json(rows[0]);
}));

router.delete('/me/status', requireLogin, wrap(async (req, res) => {
  await query('UPDATE user_account SET status_text = NULL, status_expires_at = NULL WHERE user_id = $1', [req.user.user_id]);
  res.json({ ok: true });
}));

// ---- 表情回應：每人對每篇日記一種，只能回應目前可讀的有效日記 -----------
async function reactionSummary(entryId, viewer) {
  const { rows } = await query(
    `SELECT reaction, count(*) AS n, bool_or(user_id = $2) AS mine
       FROM diary_reaction WHERE entry_id = $1 GROUP BY reaction`,
    [entryId, viewer],
  );
  const counts = Object.fromEntries(REACTIONS.map((r) => [r, 0]));
  let mine = null;
  for (const r of rows) { counts[r.reaction] = r.n; if (r.mine) mine = r.reaction; }
  return { reactions: counts, my_reaction: mine };
}

router.get('/entries/:entryId/reactions', wrap(async (req, res) => {
  const entryId = id(req.params.entryId, '日記代號', 'E');
  const viewer = req.user?.user_id ?? null;
  const readable = await query(
    `SELECT 1 FROM diary_entry e JOIN blog b ON b.blog_id = e.blog_id JOIN user_account u ON u.user_id = b.user_id
      WHERE e.entry_id = $1 AND ${readableBy(2)}`,
    [entryId, viewer],
  );
  if (!readable.rows[0]) throw unavailable();
  res.json(await reactionSummary(entryId, viewer));
}));

router.put('/entries/:entryId/reaction', requireActive, wrap(async (req, res) => {
  const entryId = id(req.params.entryId, '日記代號', 'E');
  const reaction = oneOf(req.body.reaction, '表情', REACTIONS);
  await tx(async (client) => {
    const ctx = await lockEntryContext(client, entryId, 'SHARE');
    if (!canRead(ctx, req.user.user_id) || ctx.entry_status !== 'active') throw unavailable();
    await client.query(
      `INSERT INTO diary_reaction (user_id, entry_id, reaction) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, entry_id) DO UPDATE SET reaction = EXCLUDED.reaction, created_at = now()`,
      [req.user.user_id, entryId, reaction],
    );
    await notify(client, { user_id: ctx.owner_id, actor_id: req.user.user_id, kind: 'reaction', entry_id: entryId });
  });
  res.json(await reactionSummary(entryId, req.user.user_id));
}));

router.delete('/entries/:entryId/reaction', requireLogin, wrap(async (req, res) => {
  const entryId = id(req.params.entryId, '日記代號', 'E');
  await query('DELETE FROM diary_reaction WHERE user_id = $1 AND entry_id = $2', [req.user.user_id, entryId]);
  res.json(await reactionSummary(entryId, req.user.user_id));
}));

// ---- 通知 ---------------------------------------------------------------
// 日記標題只在收件者目前仍可閱讀該日記時回傳
router.get('/me/notifications', requireLogin, wrap(async (req, res) => {
  const { limit, offset, page, size } = paging(req, 20);
  const [list, unread] = await Promise.all([
    query(
      `SELECT n.notification_id, n.kind, n.created_at, n.read_at, n.comment_id,
              a.nickname AS actor_nickname, a.username AS actor_username, ab.blog_id AS actor_blog_id,
              ${avatarSql('a')} AS actor_avatar,
              CASE WHEN ${readableBy(1)} THEN e.entry_id END AS entry_id,
              CASE WHEN ${readableBy(1)} THEN e.title END AS entry_title,
              CASE WHEN ${readableBy(1)} AND cm.status = 'visible' THEN left(cm.content, 80) END AS comment_excerpt,
              CASE WHEN n.kind = 'reaction' THEN
                (SELECT r.reaction FROM diary_reaction r WHERE r.entry_id = n.entry_id AND r.user_id = n.actor_id) END AS reaction
         FROM notification n
         JOIN user_account a ON a.user_id = n.actor_id
         LEFT JOIN blog ab ON ab.user_id = a.user_id
         LEFT JOIN diary_entry e ON e.entry_id = n.entry_id
         LEFT JOIN blog b ON b.blog_id = e.blog_id
         LEFT JOIN user_account u ON u.user_id = b.user_id
         LEFT JOIN comment cm ON cm.comment_id = n.comment_id
        WHERE n.user_id = $1
        ORDER BY n.created_at DESC, n.notification_id DESC
        LIMIT $2 OFFSET $3`,
      [req.user.user_id, limit + 1, offset],
    ),
    query('SELECT count(*) AS n FROM notification WHERE user_id = $1 AND read_at IS NULL', [req.user.user_id]),
  ]);
  res.json({ notifications: list.rows.slice(0, size), page, has_more: list.rows.length > size, unread_count: unread.rows[0].n });
}));

router.get('/me/notifications/unread-count', requireLogin, wrap(async (req, res) => {
  const { rows } = await query('SELECT count(*) AS n FROM notification WHERE user_id = $1 AND read_at IS NULL', [req.user.user_id]);
  res.json({ unread_count: rows[0].n });
}));

router.post('/me/notifications/read', requireLogin, wrap(async (req, res) => {
  await query('UPDATE notification SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [req.user.user_id]);
  res.json({ unread_count: 0 });
}));

export default router;
