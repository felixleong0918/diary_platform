import { Router } from 'express';
import { query, tx } from '../db.js';
import { wrap, badRequest, notFound, conflict } from '../errors.js';
import { requireOperator } from '../auth.js';
import { STYLE_KEYS } from '../config.js';
import { PUBLIC_READABLE, BLOG_VISIBLE } from '../access.js';
import { text, int, id, oneOf, paging } from '../validate.js';
import {
  mongoReady, eventsCollection, conversionPipeline, topKeywordsPipeline, dailyEventsPipeline,
} from '../mongo.js';

// 營運介面不提供閱讀他人私密日記的功能：所有查詢都只取 public 的內容
const router = Router();
router.use(requireOperator);
const like = (s) => `%${s.replace(/[\\%_]/g, '\\$&')}%`;

// =====================================================================
// 主題與標籤：新增、更名或停用。停用後不可新選，既有引用仍保留。
// =====================================================================
router.get('/themes', wrap(async (_req, res) => {
  const { rows } = await query(
    `SELECT th.theme_id, th.theme_name, th.style_key, th.status,
            (SELECT count(*) FROM blog b WHERE b.theme_id = th.theme_id) AS blog_count
       FROM theme th ORDER BY th.theme_id`,
  );
  res.json({ themes: rows, style_keys: STYLE_KEYS });
}));

router.post('/themes', wrap(async (req, res) => {
  const name = text(req.body.theme_name, '主題名稱', { max: 50 });
  const styleKey = oneOf(req.body.style_key, '樣式', STYLE_KEYS);
  const { rows } = await query(
    'INSERT INTO theme (theme_name, style_key) VALUES ($1, $2) RETURNING theme_id, theme_name, style_key, status',
    [name, styleKey],
  );
  res.status(201).json({ theme: { ...rows[0], blog_count: 0 } });
}));

router.put('/themes/:themeId', wrap(async (req, res) => {
  const themeId = id(req.params.themeId, '主題代號', 'H');
  const name = text(req.body.theme_name, '主題名稱', { max: 50, optional: true });
  const status = oneOf(req.body.status, '狀態', ['active', 'retired'], { optional: true });
  if (!name && !status) throw badRequest('沒有要更新的內容');
  const row = await tx(async (client) => {
    if (status === 'retired') {
      // 註冊時需要至少一個可選主題
      const others = await client.query(
        `SELECT count(*) AS n FROM theme WHERE status = 'active' AND theme_id <> $1`,
        [themeId],
      );
      if (others.rows[0].n === 0) throw conflict('last_theme', '至少要保留一個可選的主題');
    }
    const { rows } = await client.query(
      `UPDATE theme SET theme_name = COALESCE($2, theme_name), status = COALESCE($3, status)
        WHERE theme_id = $1 RETURNING theme_id, theme_name, style_key, status`,
      [themeId, name, status],
    );
    return rows[0];
  });
  if (!row) throw notFound('找不到這個主題');
  res.json({ theme: row });
}));

router.get('/tags', wrap(async (_req, res) => {
  const { rows } = await query(
    `SELECT t.tag_id, t.tag_name, t.status,
            (SELECT count(*) FROM diary_tag dt WHERE dt.tag_id = t.tag_id) AS usage_count
       FROM tag t ORDER BY t.tag_name`,
  );
  res.json({ tags: rows });
}));

router.post('/tags', wrap(async (req, res) => {
  const name = text(req.body.tag_name, '標籤名稱', { max: 30 }).toLowerCase();
  const { rows } = await query('INSERT INTO tag (tag_name) VALUES ($1) RETURNING tag_id, tag_name, status', [name]);
  res.status(201).json({ tag: { ...rows[0], usage_count: 0 } });
}));

router.put('/tags/:tagId', wrap(async (req, res) => {
  const tagId = id(req.params.tagId, '標籤代號', 'T');
  const name = text(req.body.tag_name, '標籤名稱', { max: 30, optional: true })?.toLowerCase() ?? null;
  const status = oneOf(req.body.status, '狀態', ['active', 'retired'], { optional: true });
  if (!name && !status) throw badRequest('沒有要更新的內容');
  const { rows } = await query(
    `UPDATE tag SET tag_name = COALESCE($2, tag_name), status = COALESCE($3, status)
      WHERE tag_id = $1 RETURNING tag_id, tag_name, status`,
    [tagId, name, status],
  );
  if (!rows[0]) throw notFound('找不到這個標籤');
  res.json({ tag: rows[0] });
}));

// =====================================================================
// 管理公開內容：日記、留言、留言板訊息、空間、帳號
// =====================================================================

// 公開日記；被隱藏期間作者若改為私密，只保留代號與狀態供解除隱藏，不回傳標題與內文
router.get('/entries', wrap(async (req, res) => {
  const { limit, offset, page, size } = paging(req, 15);
  const status = oneOf(req.query.status, '狀態', ['active', 'hidden'], { optional: true });
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const params = [limit + 1, offset];
  let where = `e.status <> 'deleted' AND (e.visibility = 'public' OR e.status = 'hidden')`;
  if (status) { params.push(status); where += ` AND e.status = $${params.length}`; }
  if (q) { params.push(like(q)); where += ` AND e.visibility = 'public' AND e.title ILIKE $${params.length}`; }
  const { rows } = await query(
    `SELECT e.entry_id, e.visibility, e.status, e.published_at, e.hidden_at,
            CASE WHEN e.visibility = 'public' THEN e.title END AS title,
            CASE WHEN e.visibility = 'public' THEN left(e.content, 120) END AS excerpt,
            b.blog_id, b.blog_name, u.nickname AS author_nickname, u.username AS author_username
       FROM diary_entry e
       JOIN blog b ON b.blog_id = e.blog_id
       JOIN user_account u ON u.user_id = b.user_id
      WHERE ${where}
      ORDER BY COALESCE(e.hidden_at, e.published_at) DESC NULLS LAST, e.entry_id DESC
      LIMIT $1 OFFSET $2`,
    params,
  );
  res.json({ entries: rows.slice(0, size), page, has_more: rows.length > size });
}));

router.put('/entries/:entryId/status', wrap(async (req, res) => {
  const entryId = id(req.params.entryId, '日記代號', 'E');
  const status = oneOf(req.body.status, '狀態', ['active', 'hidden']);
  await tx(async (client) => {
    const cur = await client.query(
      'SELECT status, visibility FROM diary_entry WHERE entry_id = $1 FOR UPDATE',
      [entryId],
    );
    const row = cur.rows[0];
    if (!row || row.status === 'deleted') throw notFound('找不到這篇日記');
    if (status === 'hidden') {
      if (row.visibility !== 'public') throw conflict('not_public', '只能隱藏公開日記');
      if (row.status === 'hidden') return;
      await client.query(`UPDATE diary_entry SET status = 'hidden', hidden_at = now() WHERE entry_id = $1`, [entryId]);
    } else {
      if (row.status !== 'hidden') return;
      await client.query(`UPDATE diary_entry SET status = 'active', hidden_at = NULL WHERE entry_id = $1`, [entryId]);
    }
  });
  res.json({ ok: true });
}));

// 公開留言：只列出所屬日記為 public 的留言
router.get('/comments', wrap(async (req, res) => {
  const { limit, offset, page, size } = paging(req, 15);
  const status = oneOf(req.query.status, '狀態', ['visible', 'hidden'], { optional: true });
  const params = [limit + 1, offset];
  let where = `cm.status <> 'deleted' AND e.visibility = 'public' AND e.status <> 'deleted'`;
  if (status) { params.push(status); where += ` AND cm.status = $${params.length}`; }
  const { rows } = await query(
    `SELECT cm.comment_id, cm.content, cm.status, cm.created_at,
            cu.nickname, cu.username, e.entry_id, e.title AS entry_title
       FROM comment cm
       JOIN user_account cu ON cu.user_id = cm.user_id
       JOIN diary_entry e ON e.entry_id = cm.entry_id
      WHERE ${where}
      ORDER BY cm.created_at DESC, cm.comment_id DESC
      LIMIT $1 OFFSET $2`,
    params,
  );
  res.json({ comments: rows.slice(0, size), page, has_more: rows.length > size });
}));

router.put('/comments/:commentId/status', wrap(async (req, res) => {
  const commentId = id(req.params.commentId, '留言代號', 'C');
  const status = oneOf(req.body.status, '狀態', ['visible', 'hidden']);
  const { rowCount } = await query(
    `UPDATE comment SET status = $2 WHERE comment_id = $1 AND status <> 'deleted'`,
    [commentId, status],
  );
  if (!rowCount) throw notFound('找不到這則留言');
  res.json({ ok: true });
}));

router.get('/guestbook', wrap(async (req, res) => {
  const { limit, offset, page, size } = paging(req, 15);
  const status = oneOf(req.query.status, '狀態', ['visible', 'hidden'], { optional: true });
  const params = [limit + 1, offset];
  let where = `g.status <> 'deleted'`;
  if (status) { params.push(status); where += ` AND g.status = $${params.length}`; }
  const { rows } = await query(
    `SELECT g.guestbook_id, g.content, g.status, g.created_at,
            gu.nickname, gu.username, b.blog_id, b.blog_name
       FROM guestbook_entry g
       JOIN user_account gu ON gu.user_id = g.user_id
       JOIN blog b ON b.blog_id = g.blog_id
      WHERE ${where}
      ORDER BY g.created_at DESC, g.guestbook_id DESC
      LIMIT $1 OFFSET $2`,
    params,
  );
  res.json({ messages: rows.slice(0, size), page, has_more: rows.length > size });
}));

router.put('/guestbook/:guestbookId/status', wrap(async (req, res) => {
  const guestbookId = id(req.params.guestbookId, '訊息代號', 'G');
  const status = oneOf(req.body.status, '狀態', ['visible', 'hidden']);
  const { rowCount } = await query(
    `UPDATE guestbook_entry SET status = $2 WHERE guestbook_id = $1 AND status <> 'deleted'`,
    [guestbookId, status],
  );
  if (!rowCount) throw notFound('找不到這則訊息');
  res.json({ ok: true });
}));

// 空間與帳號
router.get('/blogs', wrap(async (req, res) => {
  const { limit, offset, page, size } = paging(req, 15);
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const status = oneOf(req.query.status, '狀態', ['active', 'hidden', 'closed'], { optional: true });
  const accountStatus = oneOf(req.query.account_status, '帳號狀態', ['active', 'suspended', 'deactivated'], { optional: true });
  const role = oneOf(req.query.role, '身分', ['User', 'Operator'], { optional: true });
  const params = [limit + 1, offset];
  let where = 'TRUE';
  if (q) {
    params.push(like(q));
    where += ` AND (b.blog_name ILIKE $${params.length} OR u.nickname ILIKE $${params.length} OR u.username ILIKE $${params.length})`;
  }
  if (status) { params.push(status); where += ` AND b.status = $${params.length}`; }
  if (accountStatus) { params.push(accountStatus); where += ` AND u.status = $${params.length}`; }
  if (role) { params.push(role); where += ` AND EXISTS (SELECT 1 FROM user_role r WHERE r.user_id = u.user_id AND r.role = $${params.length})`; }
  const { rows } = await query(
    `SELECT b.blog_id, b.blog_name, b.status AS blog_status, b.created_at,
            u.user_id, u.username, u.nickname, u.email, u.status AS account_status,
            ARRAY(SELECT role FROM user_role r WHERE r.user_id = u.user_id ORDER BY role) AS roles,
            (SELECT count(*) FROM diary_entry e
              WHERE e.blog_id = b.blog_id AND e.visibility = 'public' AND e.status <> 'deleted') AS public_entry_count
       FROM blog b JOIN user_account u ON u.user_id = b.user_id
      WHERE ${where}
      ORDER BY b.blog_id
      LIMIT $1 OFFSET $2`,
    params,
  );
  res.json({ blogs: rows.slice(0, size), page, has_more: rows.length > size });
}));

router.put('/blogs/:blogId/status', wrap(async (req, res) => {
  const blogId = id(req.params.blogId, '空間代號', 'B');
  const status = oneOf(req.body.status, '狀態', ['active', 'hidden']);
  const { rowCount } = await query(
    `UPDATE blog SET status = $2 WHERE blog_id = $1 AND status <> 'closed'`,
    [blogId, status],
  );
  if (!rowCount) throw notFound('找不到這個空間，或空間已關閉');
  res.json({ ok: true });
}));

// 單一帳號：基本資料、各項筆數與最近的公開日記。私密日記只回傳篇數，不回傳標題與內文
router.get('/users/:userId', wrap(async (req, res) => {
  const userId = id(req.params.userId, '使用者代號', 'U');
  const [account, recent] = await Promise.all([
    query(
      `SELECT u.user_id, u.username, u.nickname, u.email, u.status AS account_status, u.created_at,
              b.blog_id, b.blog_name, b.status AS blog_status,
              ARRAY(SELECT role FROM user_role r WHERE r.user_id = u.user_id ORDER BY role) AS roles,
              (SELECT count(*) FROM diary_entry e WHERE e.blog_id = b.blog_id AND e.visibility = 'public' AND e.status = 'active') AS public_entries,
              (SELECT count(*) FROM diary_entry e WHERE e.blog_id = b.blog_id AND e.visibility = 'private' AND e.status <> 'deleted') AS private_entries,
              (SELECT count(*) FROM diary_entry e WHERE e.blog_id = b.blog_id AND e.status = 'hidden') AS hidden_entries,
              (SELECT count(*) FROM comment c WHERE c.user_id = u.user_id AND c.status <> 'deleted') AS comments,
              (SELECT count(*) FROM comment c WHERE c.user_id = u.user_id AND c.status = 'hidden') AS hidden_comments,
              (SELECT count(*) FROM blog_follow f WHERE f.blog_id = b.blog_id) AS followers,
              (SELECT count(*) FROM blog_follow f WHERE f.follower_id = u.user_id) AS following,
              (SELECT max(e.published_at) FROM diary_entry e WHERE e.blog_id = b.blog_id AND e.visibility = 'public' AND e.status <> 'deleted') AS last_published_at
         FROM user_account u JOIN blog b ON b.user_id = u.user_id
        WHERE u.user_id = $1`,
      [userId],
    ),
    query(
      `SELECT e.entry_id, e.title, e.status, e.published_at, e.hidden_at
         FROM diary_entry e JOIN blog b ON b.blog_id = e.blog_id
        WHERE b.user_id = $1 AND e.visibility = 'public' AND e.status <> 'deleted'
        ORDER BY e.published_at DESC, e.entry_id DESC LIMIT 6`,
      [userId],
    ),
  ]);
  if (!account.rows[0]) throw notFound('找不到這個帳號');
  res.json({ account: account.rows[0], recent_public_entries: recent.rows });
}));

router.put('/users/:userId/status', wrap(async (req, res) => {
  const userId = id(req.params.userId, '使用者代號', 'U');
  const status = oneOf(req.body.status, '狀態', ['active', 'suspended']);
  if (userId === req.user.user_id) throw badRequest('不能變更自己的帳號狀態');
  const { rowCount } = await query(
    `UPDATE user_account SET status = $2 WHERE user_id = $1 AND status <> 'deactivated'`,
    [userId, status],
  );
  if (!rowCount) throw notFound('找不到這個帳號，或帳號已停用');
  res.json({ ok: true });
}));

// =====================================================================
// 營運統計（只用公開內容，不提供他人私密內文或心情分數）
// =====================================================================
router.get('/stats', wrap(async (req, res) => {
  const days = int(req.query.days, '天數', { min: 1, max: 365, optional: true }) || 30;
  const [totals, daily, tags, interactions, weekly] = await Promise.all([
    query(
      `SELECT (SELECT count(*) FROM user_account) AS accounts,
              (SELECT count(*) FROM diary_entry e JOIN blog b ON b.blog_id = e.blog_id
                 JOIN user_account u ON u.user_id = b.user_id WHERE ${PUBLIC_READABLE}) AS public_entries,
              (SELECT count(*) FROM diary_entry WHERE status = 'hidden') AS hidden_entries,
              (SELECT count(*) FROM user_account WHERE status = 'suspended') AS suspended_accounts`,
    ),
    // 新增公開日記：依 published_at 逐日計數
    query(
      `SELECT to_char(d.day, 'YYYY-MM-DD') AS day, count(e.entry_id) AS entry_count
         FROM generate_series((now() AT TIME ZONE 'Asia/Taipei')::date - ($1::int - 1),
                              (now() AT TIME ZONE 'Asia/Taipei')::date, interval '1 day') AS d(day)
         LEFT JOIN diary_entry e
           ON (e.published_at AT TIME ZONE 'Asia/Taipei')::date = d.day::date
          AND e.visibility = 'public' AND e.status <> 'deleted'
        GROUP BY d.day ORDER BY d.day`,
      [days],
    ),
    // 熱門標籤：期間內公開且可讀的日記
    query(
      `SELECT t.tag_id, t.tag_name, t.status, count(*) AS entry_count
         FROM diary_tag dt
         JOIN tag t ON t.tag_id = dt.tag_id
         JOIN diary_entry e ON e.entry_id = dt.entry_id
         JOIN blog b ON b.blog_id = e.blog_id
         JOIN user_account u ON u.user_id = b.user_id
        WHERE ${PUBLIC_READABLE} AND e.published_at >= now() - make_interval(days => $1::int)
        GROUP BY t.tag_id, t.tag_name, t.status
        ORDER BY entry_count DESC, t.tag_name
        LIMIT 10`,
      [days],
    ),
    // 公開日記互動量：留言與收藏先分別彙總再合併，避免同時連接使筆數相乘
    query(
      `WITH c AS (
         SELECT entry_id, count(*) AS n FROM comment
          WHERE status = 'visible' AND created_at >= now() - make_interval(days => $1::int)
          GROUP BY entry_id
       ), f AS (
         SELECT entry_id, count(*) AS n FROM diary_favorite
          WHERE created_at >= now() - make_interval(days => $1::int)
          GROUP BY entry_id
       )
       SELECT e.entry_id, e.title, b.blog_name, u.nickname AS author_nickname,
              COALESCE(c.n, 0) AS comment_count, COALESCE(f.n, 0) AS favorite_count,
              COALESCE(c.n, 0) + COALESCE(f.n, 0) AS interaction_count
         FROM diary_entry e
         JOIN blog b ON b.blog_id = e.blog_id
         JOIN user_account u ON u.user_id = b.user_id
         LEFT JOIN c ON c.entry_id = e.entry_id
         LEFT JOIN f ON f.entry_id = e.entry_id
        WHERE ${PUBLIC_READABLE} AND (c.n IS NOT NULL OR f.n IS NOT NULL)
        ORDER BY interaction_count DESC, e.entry_id
        LIMIT 10`,
      [days],
    ),
    // 每週活躍作者：該週至少公開一篇日記的作者數
    query(
      `SELECT to_char(w.week, 'YYYY-MM-DD') AS week_start,
              count(DISTINCT e.blog_id) AS active_authors,
              count(e.entry_id) AS public_entries
         FROM generate_series(date_trunc('week', now()) - interval '7 weeks',
                              date_trunc('week', now()), interval '1 week') AS w(week)
         LEFT JOIN diary_entry e
           ON e.published_at >= w.week AND e.published_at < w.week + interval '1 week'
          AND e.visibility = 'public' AND e.status <> 'deleted'
        GROUP BY w.week ORDER BY w.week`,
    ),
  ]);
  res.json({
    days,
    totals: totals.rows[0],
    new_public_entries: daily.rows,
    hot_tags: tags.rows,
    top_interactions: interactions.rows,
    weekly_active_authors: weekly.rows,
  });
}));

// =====================================================================
// 永久刪除：設為 deleted 後任何人都無法再讀取或復原；資料列保留以維持外鍵與統計
// =====================================================================
router.delete('/entries/:entryId', wrap(async (req, res) => {
  const entryId = id(req.params.entryId, '日記代號', 'E');
  // 與隱藏相同的範圍：公開日記，或先前被營運者隱藏的日記
  const { rowCount } = await query(
    `UPDATE diary_entry SET status = 'deleted', updated_at = now()
      WHERE entry_id = $1 AND status <> 'deleted' AND (visibility = 'public' OR status = 'hidden')`,
    [entryId],
  );
  if (!rowCount) throw notFound('找不到這篇日記，或它不是公開內容');
  res.json({ ok: true });
}));

router.delete('/comments/:commentId', wrap(async (req, res) => {
  const commentId = id(req.params.commentId, '留言代號', 'C');
  const { rowCount } = await query(
    `UPDATE comment SET status = 'deleted', updated_at = now() WHERE comment_id = $1 AND status <> 'deleted'`,
    [commentId],
  );
  if (!rowCount) throw notFound('找不到這則留言');
  res.json({ ok: true });
}));

router.delete('/guestbook/:guestbookId', wrap(async (req, res) => {
  const guestbookId = id(req.params.guestbookId, '訊息代號', 'G');
  const { rowCount } = await query(
    `UPDATE guestbook_entry SET status = 'deleted', updated_at = now() WHERE guestbook_id = $1 AND status <> 'deleted'`,
    [guestbookId],
  );
  if (!rowCount) throw notFound('找不到這則訊息');
  res.json({ ok: true });
}));

// =====================================================================
// 身分管理：授予或撤銷 Operator。不能變更自己；系統至少保留一位營運者
// =====================================================================
router.put('/users/:userId/roles', wrap(async (req, res) => {
  const userId = id(req.params.userId, '使用者代號', 'U');
  if (typeof req.body.operator !== 'boolean') throw badRequest('請指定是否具有營運者身分');
  if (userId === req.user.user_id) throw badRequest('不能變更自己的營運者身分');
  await tx(async (client) => {
    const target = await client.query('SELECT status FROM user_account WHERE user_id = $1 FOR UPDATE', [userId]);
    if (!target.rows[0]) throw notFound('找不到這個帳號');
    // 鎖住所有營運者身分列，避免兩位營運者同時互相撤銷
    const ops = await client.query(`SELECT user_id FROM user_role WHERE role = 'Operator' ORDER BY user_id FOR UPDATE`);
    if (!ops.rows.some((r) => r.user_id === req.user.user_id)) throw conflict('not_operator', '你的營運者身分已被撤銷');
    if (req.body.operator) {
      if (target.rows[0].status !== 'active') throw conflict('not_active', '只能授予狀態正常的帳號');
      await client.query(`INSERT INTO user_role (user_id, role) VALUES ($1, 'Operator') ON CONFLICT DO NOTHING`, [userId]);
    } else {
      await client.query(`DELETE FROM user_role WHERE user_id = $1 AND role = 'Operator'`, [userId]);
    }
  });
  res.json({ ok: true });
}));

// =====================================================================
// Dashboard：成長、貼文數量、互動、內容組成、發文時段
// 私密日記只計入筆數；心情、分類與時段只統計他人可讀的公開日記
// =====================================================================
const TPE_TODAY = `(now() AT TIME ZONE 'Asia/Taipei')::date`;
const tpeDay = (col) => `(${col} AT TIME ZONE 'Asia/Taipei')::date`;
// 期間起點（含今天共 $1 天）與上一期起點，皆為台北時間的 00:00
const CUR = `((${TPE_TODAY} - ($1::int - 1))::timestamp AT TIME ZONE 'Asia/Taipei')`;
const PREV = `((${TPE_TODAY} - ($1::int * 2 - 1))::timestamp AT TIME ZONE 'Asia/Taipei')`;

router.get('/dashboard', wrap(async (req, res) => {
  const days = int(req.query.days, '天數', { min: 1, max: 365, optional: true }) || 30;
  const pair = (table, col, extra = 'TRUE') => `
    (SELECT count(*) FROM ${table} WHERE ${col} >= ${CUR} AND ${extra}) AS cur,
    (SELECT count(*) FROM ${table} WHERE ${col} >= ${PREV} AND ${col} < ${CUR} AND ${extra}) AS prev`;
  const daily = (table, col, extra = 'TRUE') =>
    `SELECT ${tpeDay(col)} AS day, count(*) AS n FROM ${table} WHERE ${col} >= ${CUR} AND ${extra} GROUP BY 1`;
  const PUB = `visibility = 'public' AND status <> 'deleted'`;
  const PRIV = `visibility = 'private' AND status <> 'deleted'`;
  const JOINED = `diary_entry e JOIN blog b ON b.blog_id = e.blog_id JOIN user_account u ON u.user_id = b.user_id`;

  const [kAcc, kEnt, kCom, kFav, kFol, kRea, reactionKinds, series, before, visibility, status, mood, categories,
    topBlogs, topAuthors, heat] = await Promise.all([
    query(`SELECT ${pair('user_account', 'created_at')}`, [days]),
    query(`SELECT ${pair('diary_entry', 'published_at', PUB)}`, [days]),
    query(`SELECT ${pair('comment', 'created_at', `status <> 'deleted'`)}`, [days]),
    query(`SELECT ${pair('diary_favorite', 'created_at')}`, [days]),
    query(`SELECT ${pair('blog_follow', 'followed_at')}`, [days]),
    query(`SELECT ${pair('diary_reaction', 'created_at')}`, [days]),
    query('SELECT reaction, count(*) AS n FROM diary_reaction GROUP BY 1'),
    query(
      `WITH a AS (${daily('user_account', 'created_at')}),
            p AS (${daily('diary_entry', 'published_at', PUB)}),
            v AS (${daily('diary_entry', 'created_at', PRIV)}),
            c AS (${daily('comment', 'created_at', `status <> 'deleted'`)}),
            f AS (${daily('diary_favorite', 'created_at')}),
            w AS (${daily('blog_follow', 'followed_at')}),
            r AS (${daily('diary_reaction', 'created_at')})
       SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
              COALESCE(a.n, 0) AS accounts, COALESCE(p.n, 0) AS public_entries, COALESCE(v.n, 0) AS private_entries,
              COALESCE(c.n, 0) AS comments, COALESCE(f.n, 0) AS favorites, COALESCE(w.n, 0) AS follows,
              COALESCE(r.n, 0) AS reactions
         FROM generate_series(${TPE_TODAY} - ($1::int - 1), ${TPE_TODAY}, interval '1 day') AS d(day)
         LEFT JOIN a ON a.day = d.day::date LEFT JOIN p ON p.day = d.day::date LEFT JOIN v ON v.day = d.day::date
         LEFT JOIN c ON c.day = d.day::date LEFT JOIN f ON f.day = d.day::date LEFT JOIN w ON w.day = d.day::date
         LEFT JOIN r ON r.day = d.day::date
        ORDER BY d.day`,
      [days],
    ),
    query(
      `SELECT (SELECT count(*) FROM user_account WHERE created_at < ${CUR}) AS accounts,
              (SELECT count(*) FROM diary_entry WHERE status <> 'deleted' AND created_at < ${CUR}) AS entries`,
      [days],
    ),
    query(`SELECT visibility, count(*) AS n FROM diary_entry WHERE status <> 'deleted' GROUP BY 1`),
    query(`SELECT status, count(*) AS n FROM diary_entry GROUP BY 1`),
    query(
      `SELECT s.mood_score, count(e.entry_id) AS n
         FROM generate_series(1, 5) AS s(mood_score)
         LEFT JOIN (SELECT e.entry_id, e.mood_score FROM ${JOINED} WHERE ${PUBLIC_READABLE}) e
           ON e.mood_score = s.mood_score
        GROUP BY s.mood_score ORDER BY s.mood_score`,
    ),
    query(
      `SELECT COALESCE(c.category_name, '未分類') AS category_name, count(*) AS n
         FROM ${JOINED}
         LEFT JOIN category c ON c.blog_id = e.blog_id AND c.category_no = e.category_no
        WHERE ${PUBLIC_READABLE}
        GROUP BY 1 ORDER BY n DESC, 1 LIMIT 8`,
    ),
    query(
      `SELECT b.blog_id, b.blog_name, count(*) AS n
         FROM blog_follow f JOIN blog b ON b.blog_id = f.blog_id JOIN user_account u ON u.user_id = b.user_id
        WHERE ${BLOG_VISIBLE}
        GROUP BY b.blog_id, b.blog_name ORDER BY n DESC, b.blog_id LIMIT 8`,
    ),
    query(
      `SELECT b.blog_id, u.nickname, count(*) AS n
         FROM ${JOINED}
        WHERE ${PUBLIC_READABLE} AND e.published_at >= ${CUR}
        GROUP BY b.blog_id, u.nickname ORDER BY n DESC, b.blog_id LIMIT 8`,
      [days],
    ),
    query(
      `SELECT extract(isodow FROM e.published_at AT TIME ZONE 'Asia/Taipei')::int AS dow,
              extract(hour FROM e.published_at AT TIME ZONE 'Asia/Taipei')::int AS hour, count(*) AS n
         FROM ${JOINED}
        WHERE ${PUBLIC_READABLE} AND e.published_at >= ${CUR}
        GROUP BY 1, 2`,
      [days],
    ),
  ]);
  const byKey = (rows, key) => Object.fromEntries(rows.map((r) => [r[key], r.n]));
  res.json({
    days,
    period: {
      accounts: kAcc.rows[0], public_entries: kEnt.rows[0], comments: kCom.rows[0],
      favorites: kFav.rows[0], follows: kFol.rows[0], reactions: kRea.rows[0],
    },
    daily: series.rows,
    before: before.rows[0],
    composition: {
      visibility: { public: 0, private: 0, ...byKey(visibility.rows, 'visibility') },
      status: { active: 0, hidden: 0, deleted: 0, ...byKey(status.rows, 'status') },
      public_mood: mood.rows,
      public_categories: categories.rows,
      reactions: { like: 0, hug: 0, cheer: 0, haha: 0, sad: 0, ...byKey(reactionKinds.rows, 'reaction') },
    },
    top_followed_blogs: topBlogs.rows,
    top_authors: topAuthors.rows,
    publish_heatmap: heat.rows,
  });
}));

// MongoDB：公開搜尋與頁面瀏覽事件，分析搜尋後閱讀的轉換率
router.get('/analytics', wrap(async (req, res) => {
  const days = int(req.query.days, '天數', { min: 1, max: 365, optional: true }) || 30;
  if (!mongoReady()) return res.json({ available: false, days });
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);
  const events = eventsCollection();
  const [conversion, keywords, daily] = await Promise.all([
    events.aggregate(conversionPipeline(since)).toArray(),
    events.aggregate(topKeywordsPipeline(since)).toArray(),
    events.aggregate(dailyEventsPipeline(since)).toArray(),
  ]);
  const c = conversion[0] || { sessions_with_search: 0, converted_sessions: 0, searches: 0, converted_searches: 0 };
  res.json({
    available: true,
    days,
    window_minutes: 30,
    conversion: {
      sessions_with_search: c.sessions_with_search,
      converted_sessions: c.converted_sessions,
      searches: c.searches,
      converted_searches: c.converted_searches,
      session_rate: c.sessions_with_search ? c.converted_sessions / c.sessions_with_search : null,
    },
    top_keywords: keywords,
    daily,
  });
}));

export default router;
