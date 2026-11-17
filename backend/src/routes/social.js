import { Router } from 'express';
import { query, tx } from '../db.js';
import { wrap, unavailable, forbidden, notFound, badRequest } from '../errors.js';
import { requireLogin, requireActive } from '../auth.js';
import {
  BLOG_VISIBLE, PUBLIC_READABLE, readableBy, canRead, lockEntryContext, lockBlogContext,
} from '../access.js';
import { ENTRY_CARD, ENTRY_FROM } from '../entrySql.js';
import { text, id, paging } from '../validate.js';

const router = Router();
const messageText = (v) => text(v, '留言內容', { max: 1000 });

// =====================================================================
// 日記留言：寫入與讀取均依日記當下權限檢查
// =====================================================================
router.get('/entries/:entryId/comments', wrap(async (req, res) => {
  const entryId = id(req.params.entryId, '日記代號', 'E');
  const viewer = req.user?.user_id ?? null;
  const readable = await query(
    `SELECT b.user_id AS owner_id FROM diary_entry e
       JOIN blog b ON b.blog_id = e.blog_id
       JOIN user_account u ON u.user_id = b.user_id
      WHERE e.entry_id = $1 AND ${readableBy(2)}`,
    [entryId, viewer],
  );
  if (!readable.rows[0]) throw unavailable();
  const isEntryOwner = readable.rows[0].owner_id === viewer;
  // 一般讀者只看到 visible；留言者本人另外看得到自己被隱藏的留言
  const { rows } = await query(
    `SELECT cm.comment_id, cm.content, cm.status, cm.created_at, cm.updated_at,
            cu.user_id, cu.nickname, cu.username, cb.blog_id AS author_blog_id,
            (cm.user_id = $2) AS is_mine
       FROM comment cm
       JOIN user_account cu ON cu.user_id = cm.user_id
       LEFT JOIN blog cb ON cb.user_id = cu.user_id
      WHERE cm.entry_id = $1
        AND (cm.status = 'visible' OR (cm.status = 'hidden' AND cm.user_id = $2))
      ORDER BY cm.created_at, cm.comment_id`,
    [entryId, viewer],
  );
  res.json({ comments: rows.map((c) => ({ ...c, can_remove: c.is_mine || isEntryOwner })) });
}));

router.post('/entries/:entryId/comments', requireActive, wrap(async (req, res) => {
  const entryId = id(req.params.entryId, '日記代號', 'E');
  const content = messageText(req.body.content);
  const comment = await tx(async (client) => {
    const ctx = await lockEntryContext(client, entryId, 'SHARE');
    // 只能在有權閱讀的「有效」日記留言；私密日記僅作者本人可留言
    if (!canRead(ctx, req.user.user_id) || ctx.entry_status !== 'active') throw unavailable();
    const { rows } = await client.query(
      `INSERT INTO comment (entry_id, user_id, content) VALUES ($1, $2, $3)
       RETURNING comment_id, content, status, created_at, updated_at`,
      [entryId, req.user.user_id, content],
    );
    return rows[0];
  });
  res.status(201).json({ comment });
}));

// 編輯不會將 hidden 自動改回 visible
router.put('/comments/:commentId', requireActive, wrap(async (req, res) => {
  const commentId = id(req.params.commentId, '留言代號', 'C');
  const content = messageText(req.body.content);
  await tx(async (client) => {
    const cur = await client.query('SELECT entry_id, user_id, status FROM comment WHERE comment_id = $1', [commentId]);
    const row = cur.rows[0];
    if (!row || row.status === 'deleted') throw notFound('找不到這則留言');
    if (row.user_id !== req.user.user_id) throw forbidden('只能編輯自己的留言');
    const ctx = await lockEntryContext(client, row.entry_id, 'SHARE');
    if (!canRead(ctx, req.user.user_id)) throw unavailable();
    await client.query(
      `UPDATE comment SET content = $2, updated_at = now() WHERE comment_id = $1 AND status <> 'deleted'`,
      [commentId, content],
    );
  });
  res.json({ ok: true });
}));

// 留言者本人或該日記所屬空間的主人可移除（設為 deleted）
router.delete('/comments/:commentId', requireActive, wrap(async (req, res) => {
  const commentId = id(req.params.commentId, '留言代號', 'C');
  const { rowCount } = await query(
    `UPDATE comment cm SET status = 'deleted', updated_at = now()
       FROM diary_entry e JOIN blog b ON b.blog_id = e.blog_id
      WHERE cm.comment_id = $1 AND e.entry_id = cm.entry_id AND cm.status <> 'deleted'
        AND (cm.user_id = $2 OR b.user_id = $2)`,
    [commentId, req.user.user_id],
  );
  if (!rowCount) throw notFound('找不到這則留言，或沒有移除權限');
  res.json({ ok: true });
}));

// =====================================================================
// 空間留言板：公開呈現，必須登入才能留言；訪客只能閱讀
// =====================================================================
router.get('/blogs/:blogId/guestbook', wrap(async (req, res) => {
  const blogId = id(req.params.blogId, '空間代號', 'B');
  const viewer = req.user?.user_id ?? null;
  const { limit, offset, page, size } = paging(req, 20);
  const blog = await query(
    `SELECT b.user_id AS owner_id FROM blog b JOIN user_account u ON u.user_id = b.user_id
      WHERE b.blog_id = $1 AND (${BLOG_VISIBLE} OR b.user_id = $2)`,
    [blogId, viewer],
  );
  if (!blog.rows[0]) throw unavailable();
  const isOwner = blog.rows[0].owner_id === viewer;
  const { rows } = await query(
    `SELECT g.guestbook_id, g.content, g.status, g.created_at, g.updated_at,
            gu.user_id, gu.nickname, gu.username, gb.blog_id AS author_blog_id,
            (g.user_id = $2) AS is_mine
       FROM guestbook_entry g
       JOIN user_account gu ON gu.user_id = g.user_id
       LEFT JOIN blog gb ON gb.user_id = gu.user_id
      WHERE g.blog_id = $1
        AND (g.status = 'visible' OR (g.status = 'hidden' AND g.user_id = $2))
      ORDER BY g.created_at DESC, g.guestbook_id DESC
      LIMIT $3 OFFSET $4`,
    [blogId, viewer, limit + 1, offset],
  );
  res.json({
    messages: rows.slice(0, size).map((m) => ({ ...m, can_remove: m.is_mine || isOwner })),
    page,
    has_more: rows.length > size,
  });
}));

router.post('/blogs/:blogId/guestbook', requireActive, wrap(async (req, res) => {
  const blogId = id(req.params.blogId, '空間代號', 'B');
  const content = messageText(req.body.content);
  const message = await tx(async (client) => {
    const ctx = await lockBlogContext(client, blogId, 'SHARE');
    if (ctx.blog_status !== 'active' || ctx.owner_status !== 'active') throw unavailable();
    const { rows } = await client.query(
      `INSERT INTO guestbook_entry (blog_id, user_id, content) VALUES ($1, $2, $3)
       RETURNING guestbook_id, content, status, created_at, updated_at`,
      [blogId, req.user.user_id, content],
    );
    return rows[0];
  });
  res.status(201).json({ message });
}));

router.put('/guestbook/:guestbookId', requireActive, wrap(async (req, res) => {
  const guestbookId = id(req.params.guestbookId, '訊息代號', 'G');
  const content = messageText(req.body.content);
  const cur = await query('SELECT user_id, status FROM guestbook_entry WHERE guestbook_id = $1', [guestbookId]);
  const row = cur.rows[0];
  if (!row || row.status === 'deleted') throw notFound('找不到這則訊息');
  if (row.user_id !== req.user.user_id) throw forbidden('只能編輯自己的訊息');
  await query(
    `UPDATE guestbook_entry SET content = $2, updated_at = now()
      WHERE guestbook_id = $1 AND status <> 'deleted'`,
    [guestbookId, content],
  );
  res.json({ ok: true });
}));

// 留言者本人或空間主人可移除（設為 deleted）
router.delete('/guestbook/:guestbookId', requireActive, wrap(async (req, res) => {
  const guestbookId = id(req.params.guestbookId, '訊息代號', 'G');
  const { rowCount } = await query(
    `UPDATE guestbook_entry g SET status = 'deleted', updated_at = now()
       FROM blog b
      WHERE g.guestbook_id = $1 AND b.blog_id = g.blog_id AND g.status <> 'deleted'
        AND (g.user_id = $2 OR b.user_id = $2)`,
    [guestbookId, req.user.user_id],
  );
  if (!rowCount) throw notFound('找不到這則訊息，或沒有移除權限');
  res.json({ ok: true });
}));

// =====================================================================
// 追蹤：相同關聯不重複建立；取消追蹤直接刪除關聯列
// =====================================================================
router.post('/blogs/:blogId/follow', requireActive, wrap(async (req, res) => {
  const blogId = id(req.params.blogId, '空間代號', 'B');
  await tx(async (client) => {
    const ctx = await lockBlogContext(client, blogId, 'SHARE');
    if (ctx.owner_id === req.user.user_id) throw badRequest('不能追蹤自己的空間');
    if (ctx.blog_status !== 'active' || ctx.owner_status !== 'active') throw unavailable();
    await client.query(
      `INSERT INTO blog_follow (follower_id, blog_id) VALUES ($1, $2)
       ON CONFLICT (follower_id, blog_id) DO NOTHING`,
      [req.user.user_id, blogId],
    );
  });
  res.json({ is_following: true });
}));

router.delete('/blogs/:blogId/follow', requireLogin, wrap(async (req, res) => {
  const blogId = id(req.params.blogId, '空間代號', 'B');
  await query('DELETE FROM blog_follow WHERE follower_id = $1 AND blog_id = $2', [req.user.user_id, blogId]);
  res.json({ is_following: false });
}));

// 追蹤清單：關聯保留；空間目前不可見時不顯示名稱等內容
router.get('/me/following', requireLogin, wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT bf.blog_id, bf.followed_at, ${BLOG_VISIBLE} AS available,
            b.blog_name, u.nickname AS owner_nickname, u.username AS owner_username, th.style_key,
            (SELECT count(*) FROM diary_entry e
              WHERE e.blog_id = b.blog_id AND e.visibility = 'public' AND e.status = 'active') AS public_entry_count
       FROM blog_follow bf
       JOIN blog b ON b.blog_id = bf.blog_id
       JOIN user_account u ON u.user_id = b.user_id
       JOIN theme th ON th.theme_id = b.theme_id
      WHERE bf.follower_id = $1
      ORDER BY bf.followed_at DESC`,
    [req.user.user_id],
  );
  res.json({
    following: rows.map((r) =>
      r.available ? r : { blog_id: r.blog_id, followed_at: r.followed_at, available: false }),
  });
}));

// 追蹤動態：追蹤空間的近期公開日記，依公開時間 published_at 排序
router.get('/me/feed', requireLogin, wrap(async (req, res) => {
  const { limit, offset, page, size } = paging(req, 12);
  const { rows } = await query(
    `SELECT ${ENTRY_CARD} ${ENTRY_FROM}
       JOIN blog_follow bf ON bf.blog_id = e.blog_id AND bf.follower_id = $1
      WHERE ${PUBLIC_READABLE}
      ORDER BY e.published_at DESC, e.entry_id DESC
      LIMIT $2 OFFSET $3`,
    [req.user.user_id, limit + 1, offset],
  );
  res.json({ entries: rows.slice(0, size), page, has_more: rows.length > size });
}));

// =====================================================================
// 收藏：只能收藏目前可讀的日記
// =====================================================================
router.post('/entries/:entryId/favorite', requireActive, wrap(async (req, res) => {
  const entryId = id(req.params.entryId, '日記代號', 'E');
  await tx(async (client) => {
    const ctx = await lockEntryContext(client, entryId, 'SHARE');
    if (!canRead(ctx, req.user.user_id)) throw unavailable();
    await client.query(
      `INSERT INTO diary_favorite (user_id, entry_id) VALUES ($1, $2)
       ON CONFLICT (user_id, entry_id) DO NOTHING`,
      [req.user.user_id, entryId],
    );
  });
  res.json({ is_favorited: true });
}));

router.delete('/entries/:entryId/favorite', requireLogin, wrap(async (req, res) => {
  const entryId = id(req.params.entryId, '日記代號', 'E');
  await query('DELETE FROM diary_favorite WHERE user_id = $1 AND entry_id = $2', [req.user.user_id, entryId]);
  res.json({ is_favorited: false });
}));

// 收藏清單：改為私密、被隱藏或刪除的日記仍保留關聯，
// 但對無權者只回傳「內容目前無法瀏覽」，不洩漏標題、摘要或照片
router.get('/me/favorites', requireLogin, wrap(async (req, res) => {
  const { limit, offset, page, size } = paging(req, 12);
  const { rows } = await query(
    `SELECT f.created_at AS favorited_at, ${readableBy(1)} AS available, ${ENTRY_CARD}
       ${ENTRY_FROM}
       JOIN diary_favorite f ON f.entry_id = e.entry_id AND f.user_id = $1
      ORDER BY f.created_at DESC, e.entry_id DESC
      LIMIT $2 OFFSET $3`,
    [req.user.user_id, limit + 1, offset],
  );
  res.json({
    favorites: rows.slice(0, size).map((r) =>
      r.available ? r : { entry_id: r.entry_id, favorited_at: r.favorited_at, available: false }),
    page,
    has_more: rows.length > size,
  });
}));

export default router;
