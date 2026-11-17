import { Router } from 'express';
import { query, tx } from '../db.js';
import { wrap, badRequest, unavailable, notFound, conflict } from '../errors.js';
import { requireLogin, requireActive } from '../auth.js';
import { BLOG_VISIBLE, PUBLIC_READABLE } from '../access.js';
import { ENTRY_CARD, ENTRY_FROM } from '../entrySql.js';
import { text, int, id, date, oneOf, paging } from '../validate.js';
import { logEvent } from '../mongo.js';

const router = Router();

// ---- 公開主題與標籤（選單用） -------------------------------------------
router.get('/themes', wrap(async (_req, res) => {
  const { rows } = await query(
    `SELECT theme_id, theme_name, style_key FROM theme WHERE status = 'active' ORDER BY theme_id`,
  );
  res.json({ themes: rows });
}));

router.get('/tags', wrap(async (_req, res) => {
  const { rows } = await query(
    `SELECT tag_id, tag_name FROM tag WHERE status = 'active' ORDER BY tag_name`,
  );
  res.json({ tags: rows });
}));

// 公開標籤熱度：只計算他人可讀的日記
router.get('/tags/popular', wrap(async (_req, res) => {
  const { rows } = await query(
    `SELECT t.tag_id, t.tag_name, count(*) AS entry_count
       FROM diary_tag dt
       JOIN tag t ON t.tag_id = dt.tag_id
       JOIN diary_entry e ON e.entry_id = dt.entry_id
       JOIN blog b ON b.blog_id = e.blog_id
       JOIN user_account u ON u.user_id = b.user_id
      WHERE ${PUBLIC_READABLE}
      GROUP BY t.tag_id, t.tag_name
      ORDER BY entry_count DESC, t.tag_name
      LIMIT 16`,
  );
  res.json({ tags: rows });
}));

// ---- 公開空間 -----------------------------------------------------------
const BLOG_CARD = `
  b.blog_id, b.blog_name, b.description, b.status, b.created_at,
  u.user_id AS owner_id, u.nickname AS owner_nickname, u.username AS owner_username,
  th.style_key, th.theme_name,
  (SELECT count(*) FROM blog_follow bf WHERE bf.blog_id = b.blog_id) AS follower_count,
  (SELECT count(*) FROM diary_entry e
    WHERE e.blog_id = b.blog_id AND e.visibility = 'public' AND e.status = 'active') AS public_entry_count`;
const BLOG_FROM = `
  FROM blog b
  JOIN user_account u ON u.user_id = b.user_id
  JOIN theme th ON th.theme_id = b.theme_id`;

router.get('/blogs', wrap(async (req, res) => {
  const { limit, offset, page, size } = paging(req, 12);
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const params = [limit + 1, offset];
  let where = BLOG_VISIBLE;
  if (q) {
    params.push(`%${q.replace(/[\\%_]/g, '\\$&')}%`);
    where += ` AND (b.blog_name ILIKE $3 OR u.nickname ILIKE $3 OR u.username ILIKE $3)`;
  }
  const { rows } = await query(
    `SELECT ${BLOG_CARD} ${BLOG_FROM}
      WHERE ${where}
      ORDER BY public_entry_count DESC, b.blog_id
      LIMIT $1 OFFSET $2`,
    params,
  );
  res.json({ blogs: rows.slice(0, size), page, has_more: rows.length > size });
}));

router.get('/blogs/:blogId', wrap(async (req, res) => {
  const blogId = id(req.params.blogId, '空間代號', 'B');
  const viewer = req.user?.user_id ?? null;
  const { rows } = await query(
    `SELECT ${BLOG_CARD},
            (b.user_id = $2) AS is_owner,
            EXISTS (SELECT 1 FROM blog_follow bf WHERE bf.blog_id = b.blog_id AND bf.follower_id = $2) AS is_following
       ${BLOG_FROM}
      WHERE b.blog_id = $1 AND (${BLOG_VISIBLE} OR b.user_id = $2)`,
    [blogId, viewer],
  );
  if (!rows[0]) throw unavailable();
  // 只列出目前有公開可讀日記在使用、或仍為 active 的分類
  const categories = await query(
    `SELECT c.category_no, c.category_name, c.status,
            (SELECT count(*) FROM diary_entry e
              WHERE e.blog_id = c.blog_id AND e.category_no = c.category_no
                AND e.visibility = 'public' AND e.status = 'active') AS public_entry_count
       FROM category c
      WHERE c.blog_id = $1
      ORDER BY c.category_no`,
    [blogId],
  );
  logEvent(req, 'view', { target: blogId, target_type: 'blog' });
  res.json({
    blog: rows[0],
    categories: categories.rows.filter((c) => c.status === 'active' || c.public_entry_count > 0),
  });
}));

// 同一空間依分類與日期篩選；一律只回傳他人可讀的日記（作者的完整清單在 /me/entries）
router.get('/blogs/:blogId/entries', wrap(async (req, res) => {
  const blogId = id(req.params.blogId, '空間代號', 'B');
  const { limit, offset, page, size } = paging(req, 10);
  const params = [blogId, limit + 1, offset];
  let where = `e.blog_id = $1 AND ${PUBLIC_READABLE}`;
  const categoryNo = int(req.query.category_no, '分類', { min: 1, optional: true });
  if (categoryNo) { params.push(categoryNo); where += ` AND e.category_no = $${params.length}`; }
  const from = date(req.query.from, '起始日期', { optional: true });
  if (from) { params.push(from); where += ` AND e.entry_date >= $${params.length}`; }
  const to = date(req.query.to, '結束日期', { optional: true });
  if (to) { params.push(to); where += ` AND e.entry_date <= $${params.length}`; }
  const { rows } = await query(
    `SELECT ${ENTRY_CARD} ${ENTRY_FROM}
      WHERE ${where}
      ORDER BY e.entry_date DESC, e.entry_id DESC
      LIMIT $2 OFFSET $3`,
    params,
  );
  res.json({ entries: rows.slice(0, size), page, has_more: rows.length > size });
}));

// ---- 管理個人空間 -------------------------------------------------------
router.get('/me/space', requireLogin, wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT b.blog_id, b.blog_name, b.description, b.status, b.theme_id, th.style_key, th.theme_name,
            th.status AS theme_status
       FROM blog b JOIN theme th ON th.theme_id = b.theme_id
      WHERE b.user_id = $1`,
    [req.user.user_id],
  );
  const categories = await query(
    `SELECT c.category_no, c.category_name, c.status,
            (SELECT count(*) FROM diary_entry e
              WHERE e.blog_id = c.blog_id AND e.category_no = c.category_no AND e.status <> 'deleted') AS entry_count
       FROM category c WHERE c.blog_id = $1 ORDER BY c.category_no`,
    [req.user.blog_id],
  );
  res.json({ nickname: req.user.nickname, blog: rows[0], categories: categories.rows });
}));

router.put('/me/space', requireActive, wrap(async (req, res) => {
  const nickname = text(req.body.nickname, '暱稱', { max: 50 });
  const blogName = text(req.body.blog_name, '空間名稱', { max: 100 });
  const description = text(req.body.description, '簡介', { max: 1000, optional: true });
  const themeId = id(req.body.theme_id, '主題', 'H');
  await tx(async (client) => {
    const blog = await client.query('SELECT theme_id FROM blog WHERE user_id = $1 FOR UPDATE', [req.user.user_id]);
    if (blog.rows[0].theme_id !== themeId) {
      // 新選主題須為 active；既有停用引用仍保留
      const theme = await client.query('SELECT status FROM theme WHERE theme_id = $1 FOR SHARE', [themeId]);
      if (!theme.rows[0]) throw badRequest('找不到這個主題');
      if (theme.rows[0].status !== 'active') throw conflict('retired', '這個主題已停用，不能新選');
    }
    await client.query('UPDATE user_account SET nickname = $1 WHERE user_id = $2', [nickname, req.user.user_id]);
    await client.query(
      'UPDATE blog SET blog_name = $1, description = $2, theme_id = $3 WHERE user_id = $4',
      [blogName, description, themeId, req.user.user_id],
    );
  });
  res.json({ ok: true });
}));

// 新增分類：先鎖定空間資料列再配號，不直接使用未加鎖的最大值加一
router.post('/me/categories', requireActive, wrap(async (req, res) => {
  const name = text(req.body.category_name, '分類名稱', { max: 40 });
  const row = await tx(async (client) => {
    await client.query('SELECT 1 FROM blog WHERE blog_id = $1 FOR UPDATE', [req.user.blog_id]);
    const next = await client.query(
      'SELECT COALESCE(max(category_no), 0) + 1 AS no FROM category WHERE blog_id = $1',
      [req.user.blog_id],
    );
    const inserted = await client.query(
      `INSERT INTO category (blog_id, category_no, category_name) VALUES ($1, $2, $3)
       RETURNING category_no, category_name, status`,
      [req.user.blog_id, next.rows[0].no, name],
    );
    return inserted.rows[0];
  });
  res.status(201).json({ category: { ...row, entry_count: 0 } });
}));

router.put('/me/categories/:no', requireActive, wrap(async (req, res) => {
  const no = int(req.params.no, '分類編號', { min: 1 });
  const name = text(req.body.category_name, '分類名稱', { max: 40, optional: true });
  const status = oneOf(req.body.status, '分類狀態', ['active', 'retired'], { optional: true });
  if (!name && !status) throw badRequest('沒有要更新的內容');
  const { rows } = await query(
    `UPDATE category
        SET category_name = COALESCE($3, category_name), status = COALESCE($4, status)
      WHERE blog_id = $1 AND category_no = $2
      RETURNING category_no, category_name, status`,
    [req.user.blog_id, no, name, status],
  );
  if (!rows[0]) throw notFound('找不到這個分類');
  res.json({ category: rows[0] });
}));

export default router;
