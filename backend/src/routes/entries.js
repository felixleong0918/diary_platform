import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import * as storage from '../storage.js';
import { query, tx } from '../db.js';
import { wrap, badRequest, unavailable, conflict } from '../errors.js';
import { requireLogin, requireActive } from '../auth.js';
import { PUBLIC_READABLE, canRead, isPublicReadable } from '../access.js';
import { ENTRY_CARD, ENTRY_FROM } from '../entrySql.js';
import { text, int, id, date, oneOf, paging, song } from '../validate.js';
import { logEvent } from '../mongo.js';
import { avatarSql, statusSql } from '../people.js';

const router = Router();
const like = (s) => `%${s.replace(/[\\%_]/g, '\\$&')}%`;

// ---- 公開搜尋：標題關鍵字、作者、標籤 -----------------------------------
// sort=latest（預設）依公開時間；sort=hot 取最近 30 天公開的日記，
// 依留言、表情回應與收藏的合計數排序，同分時較新的在前。
const HOT_DAYS = 30;
router.get('/entries', wrap(async (req, res) => {
  const { limit, offset, page, size } = paging(req, 12);
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  const author = typeof req.query.author === 'string' ? req.query.author.trim().slice(0, 50) : '';
  const tag = typeof req.query.tag === 'string' ? req.query.tag.trim().toLowerCase().slice(0, 30) : '';
  const sort = oneOf(req.query.sort ?? 'latest', '排序方式', ['latest', 'hot']);
  const params = [limit + 1, offset];
  let where = PUBLIC_READABLE;
  if (sort === 'hot') where += ` AND e.published_at >= now() - interval '${HOT_DAYS} days'`;
  if (q) { params.push(like(q)); where += ` AND e.title ILIKE $${params.length}`; }
  if (author) {
    params.push(like(author));
    where += ` AND (u.nickname ILIKE $${params.length} OR u.username ILIKE $${params.length})`;
  }
  if (tag) {
    params.push(tag);
    where += ` AND EXISTS (SELECT 1 FROM diary_tag dt JOIN tag t ON t.tag_id = dt.tag_id
                            WHERE dt.entry_id = e.entry_id AND t.tag_name = $${params.length})`;
  }
  const { rows } = await query(
    sort === 'hot'
      ? `SELECT x.*, (x.comment_count + x.reaction_count + x.favorite_count) AS hot_score
           FROM (SELECT ${ENTRY_CARD} ${ENTRY_FROM} WHERE ${where}) x
          ORDER BY hot_score DESC, x.published_at DESC, x.entry_id DESC
          LIMIT $1 OFFSET $2`
      : `SELECT ${ENTRY_CARD} ${ENTRY_FROM}
          WHERE ${where}
          ORDER BY e.published_at DESC, e.entry_id DESC
          LIMIT $1 OFFSET $2`,
    params,
  );
  if ((q || author || tag) && page === 1) {
    logEvent(req, 'search', {
      target: tag || null,
      target_type: tag ? 'tag' : author ? 'author' : 'title',
      keyword: q || author || tag,
    });
  }
  res.json({ entries: rows.slice(0, size), page, has_more: rows.length > size, sort, hot_days: HOT_DAYS });
}));

// ---- 讀取單篇 -----------------------------------------------------------
async function loadContext(entryId) {
  const { rows } = await query(
    `SELECT e.*, e.status AS entry_status, b.status AS blog_status, b.blog_name,
            b.user_id AS owner_id, u.status AS owner_status,
            u.nickname AS author_nickname, u.username AS author_username,
            ${avatarSql('u')} AS author_avatar, ${statusSql('u')} AS author_status_text,
            c.category_name, th.style_key, b.title_font
       FROM diary_entry e
       JOIN blog b ON b.blog_id = e.blog_id
       JOIN user_account u ON u.user_id = b.user_id
       JOIN theme th ON th.theme_id = b.theme_id
       LEFT JOIN category c ON c.blog_id = e.blog_id AND c.category_no = e.category_no
      WHERE e.entry_id = $1`,
    [entryId],
  );
  return rows[0] || null;
}

router.get('/entries/:entryId', wrap(async (req, res) => {
  const entryId = id(req.params.entryId, '日記代號', 'E');
  const viewer = req.user?.user_id ?? null;
  const ctx = await loadContext(entryId);
  if (!ctx || !canRead(ctx, viewer)) throw unavailable();
  const isOwner = ctx.owner_id === viewer;
  const [tags, counts] = await Promise.all([
    query(
      `SELECT t.tag_id, t.tag_name, t.status FROM diary_tag dt JOIN tag t ON t.tag_id = dt.tag_id
        WHERE dt.entry_id = $1 ORDER BY t.tag_name`,
      [entryId],
    ),
    query(
      `SELECT (SELECT count(*) FROM diary_favorite WHERE entry_id = $1) AS favorite_count,
              EXISTS (SELECT 1 FROM diary_favorite WHERE entry_id = $1 AND user_id = $2) AS is_favorited`,
      [entryId, viewer],
    ),
  ]);
  const entry = {
    entry_id: ctx.entry_id,
    blog_id: ctx.blog_id,
    blog_name: ctx.blog_name,
    style_key: ctx.style_key,
    title_font: ctx.title_font,
    author_id: ctx.owner_id,
    author_nickname: ctx.author_nickname,
    author_username: ctx.author_username,
    author_avatar: ctx.author_avatar,
    author_status_text: ctx.author_status_text,
    category_no: ctx.category_no,
    category_name: ctx.category_name,
    entry_date: ctx.entry_date,
    title: ctx.title,
    content: ctx.content,
    has_photo: ctx.photo_url !== null,
    song_title: ctx.song_title,
    song_url: ctx.song_url,
    visibility: ctx.visibility,
    status: ctx.entry_status,
    published_at: ctx.published_at,
    updated_at: ctx.updated_at,
    tags: tags.rows,
    favorite_count: counts.rows[0].favorite_count,
    is_favorited: counts.rows[0].is_favorited,
    is_owner: isOwner,
  };
  if (isOwner) {
    // 只有作者本人看得到心情分數、版本與隱藏時間
    Object.assign(entry, {
      mood_score: ctx.mood_score,
      version: ctx.version,
      created_at: ctx.created_at,
      hidden_at: ctx.hidden_at,
    });
  }
  if (isPublicReadable(ctx) && !isOwner) logEvent(req, 'view', { target: entryId, target_type: 'entry' });
  res.json({ entry });
}));

// ---- 新增與編輯 ---------------------------------------------------------
function readEntryBody(body) {
  const tagIds = Array.isArray(body.tag_ids) ? [...new Set(body.tag_ids)] : [];
  if (tagIds.length > 10) throw badRequest('一篇日記最多 10 個標籤');
  tagIds.forEach((t) => id(t, '標籤', 'T'));
  const content = text(body.content, '內文', { max: 20000, trim: false });
  return {
    entry_date: date(body.entry_date, '日期'),
    title: text(body.title, '標題', { max: 150 }),
    content,
    mood_score: int(body.mood_score, '心情分數', { min: 1, max: 5 }),
    category_no: int(body.category_no, '分類', { min: 1, optional: true }),
    visibility: oneOf(body.visibility ?? 'public', '可見度', ['public', 'private']),
    tag_ids: tagIds,
    ...song(body),
  };
}

async function assertCategoryActive(client, blogId, categoryNo) {
  const { rows } = await client.query(
    'SELECT status FROM category WHERE blog_id = $1 AND category_no = $2 FOR SHARE',
    [blogId, categoryNo],
  );
  if (!rows[0]) throw badRequest('找不到這個分類');
  if (rows[0].status !== 'active') throw conflict('retired', '這個分類已停用，不能新選');
}

async function assertTagsActive(client, tagIds) {
  if (tagIds.length === 0) return;
  const { rows } = await client.query(
    'SELECT tag_id, status FROM tag WHERE tag_id = ANY($1) ORDER BY tag_id FOR SHARE',
    [tagIds],
  );
  if (rows.length !== tagIds.length) throw badRequest('包含不存在的標籤');
  if (rows.some((t) => t.status !== 'active')) throw conflict('retired', '包含已停用的標籤，不能新選');
}

// 日記與標籤一併儲存，採同一交易
router.post('/entries', requireActive, wrap(async (req, res) => {
  const data = readEntryBody(req.body);
  const blogId = req.user.blog_id;
  const entry = await tx(async (client) => {
    await client.query('SELECT 1 FROM blog WHERE blog_id = $1 FOR SHARE', [blogId]);
    if (data.category_no) await assertCategoryActive(client, blogId, data.category_no);
    await assertTagsActive(client, data.tag_ids);
    const { rows } = await client.query(
      `INSERT INTO diary_entry (blog_id, category_no, entry_date, title, content, mood_score, visibility, published_at,
                                song_title, song_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7::varchar, CASE WHEN $7::varchar = 'public' THEN now() END, $8, $9)
       RETURNING entry_id, version`,
      [blogId, data.category_no, data.entry_date, data.title, data.content, data.mood_score, data.visibility,
        data.song_title, data.song_url],
    );
    if (data.tag_ids.length) {
      await client.query(
        'INSERT INTO diary_tag (entry_id, tag_id) SELECT $1, unnest($2::char(9)[])',
        [rows[0].entry_id, data.tag_ids],
      );
    }
    return rows[0];
  });
  res.status(201).json({ entry });
}));

// 編輯以 entry_id 與舊 version 為條件更新；衝突時提示重新載入。編輯不會重設隱藏狀態。
router.put('/entries/:entryId', requireActive, wrap(async (req, res) => {
  const entryId = id(req.params.entryId, '日記代號', 'E');
  const version = int(req.body.version, '版本', { min: 1 });
  const data = readEntryBody(req.body);
  const blogId = req.user.blog_id;

  const entry = await tx(async (client) => {
    const cur = await client.query(
      `SELECT category_no, visibility, version FROM diary_entry
        WHERE entry_id = $1 AND blog_id = $2 AND status <> 'deleted' FOR UPDATE`,
      [entryId, blogId],
    );
    if (!cur.rows[0]) throw unavailable();
    if (cur.rows[0].version !== version) {
      throw conflict('version_conflict', '這篇日記已在別處被修改，請重新載入後再編輯');
    }
    // 既有的停用引用可以保留，改選時才檢查 active
    if (data.category_no && data.category_no !== cur.rows[0].category_no) {
      await assertCategoryActive(client, blogId, data.category_no);
    }
    const existing = await client.query('SELECT tag_id FROM diary_tag WHERE entry_id = $1', [entryId]);
    const had = new Set(existing.rows.map((r) => r.tag_id));
    const added = data.tag_ids.filter((t) => !had.has(t));
    await assertTagsActive(client, added);

    const becamePublic = data.visibility === 'public' && cur.rows[0].visibility !== 'public';
    const { rows } = await client.query(
      `UPDATE diary_entry
          SET category_no = $3, entry_date = $4, title = $5, content = $6, mood_score = $7,
              visibility = $8, published_at = CASE WHEN $9::boolean THEN now() ELSE published_at END,
              song_title = $10, song_url = $11,
              updated_at = now(), version = version + 1
        WHERE entry_id = $1 AND version = $2
        RETURNING entry_id, version`,
      [entryId, version, data.category_no, data.entry_date, data.title, data.content,
        data.mood_score, data.visibility, becamePublic, data.song_title, data.song_url],
    );
    if (!rows[0]) throw conflict('version_conflict', '這篇日記已在別處被修改，請重新載入後再編輯');
    await client.query('DELETE FROM diary_tag WHERE entry_id = $1 AND tag_id <> ALL($2::char(9)[])', [
      entryId,
      data.tag_ids,
    ]);
    if (added.length) {
      await client.query('INSERT INTO diary_tag (entry_id, tag_id) SELECT $1, unnest($2::char(9)[])', [
        entryId,
        added,
      ]);
    }
    return rows[0];
  });
  res.json({ entry });
}));

// 移除採狀態更新，不連鎖刪除留言或收藏
router.delete('/entries/:entryId', requireActive, wrap(async (req, res) => {
  const entryId = id(req.params.entryId, '日記代號', 'E');
  const { rowCount } = await query(
    `UPDATE diary_entry SET status = 'deleted', updated_at = now()
      WHERE entry_id = $1 AND blog_id = $2 AND status <> 'deleted'`,
    [entryId, req.user.blog_id],
  );
  if (!rowCount) throw unavailable();
  res.json({ ok: true });
}));

// ---- 照片：資料庫只存位置，讀取仍須通過日記權限檢查 ---------------------
const MIME_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
// 檔案先放在記憶體再交給 storage（本機資料夾或 Supabase Storage）。
// 上限 4 MB：Vercel 函式的請求內容上限是 4.5 MB。
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (MIME_EXT[file.mimetype]) cb(null, true);
    else cb(badRequest('照片只接受 JPG、PNG、WebP 或 GIF'));
  },
});

router.put('/entries/:entryId/photo', requireActive, upload.single('photo'), wrap(async (req, res) => {
  if (!req.file) throw badRequest('請選擇一張照片');
  const entryId = id(req.params.entryId, '日記代號', 'E');
  const owned = await query(
    `SELECT 1 FROM diary_entry WHERE entry_id = $1 AND blog_id = $2 AND status <> 'deleted'`,
    [entryId, req.user.blog_id],
  );
  if (!owned.rows[0]) throw unavailable();
  const location = await storage.save(crypto.randomUUID() + MIME_EXT[req.file.mimetype], req.file.buffer);
  try {
    const old = await tx(async (client) => {
      const cur = await client.query(
        `SELECT photo_url FROM diary_entry
          WHERE entry_id = $1 AND blog_id = $2 AND status <> 'deleted' FOR UPDATE`,
        [entryId, req.user.blog_id],
      );
      if (!cur.rows[0]) throw unavailable();
      await client.query('UPDATE diary_entry SET photo_url = $2, updated_at = now() WHERE entry_id = $1', [
        entryId,
        location,
      ]);
      return cur.rows[0].photo_url;
    });
    await storage.remove(old);
    res.json({ ok: true });
  } catch (err) {
    await storage.remove(location);
    throw err;
  }
}));

router.delete('/entries/:entryId/photo', requireActive, wrap(async (req, res) => {
  const entryId = id(req.params.entryId, '日記代號', 'E');
  const { rows } = await query(
    `UPDATE diary_entry e SET photo_url = NULL, updated_at = now()
       FROM (SELECT entry_id, photo_url FROM diary_entry
              WHERE entry_id = $1 AND blog_id = $2 AND status <> 'deleted' FOR UPDATE) old
      WHERE e.entry_id = old.entry_id
      RETURNING old.photo_url`,
    [entryId, req.user.blog_id],
  );
  if (!rows[0]) throw unavailable();
  await storage.remove(rows[0].photo_url);
  res.json({ ok: true });
}));

router.get('/entries/:entryId/photo', wrap(async (req, res) => {
  const entryId = id(req.params.entryId, '日記代號', 'E');
  const ctx = await loadContext(entryId);
  if (!ctx || !ctx.photo_url || !canRead(ctx, req.user?.user_id ?? null)) throw unavailable();
  const file = await storage.read(ctx.photo_url);
  if (!file) throw unavailable();
  res.set('Cache-Control', 'private, no-store');
  res.type(file.contentType).send(file.buffer);
}));

// ---- 回顧個人紀錄 -------------------------------------------------------
function reviewFilter(req) {
  const params = [req.user.blog_id];
  let where = `e.blog_id = $1 AND e.status <> 'deleted'`;
  const month = typeof req.query.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(req.query.month)
    ? req.query.month : null;
  if (month) {
    params.push(`${month}-01`);
    where += ` AND e.entry_date >= $${params.length}::date
               AND e.entry_date < $${params.length}::date + interval '1 month'`;
  }
  if (req.query.category_no === 'none') where += ' AND e.category_no IS NULL';
  else {
    const categoryNo = int(req.query.category_no, '分類', { min: 1, optional: true });
    if (categoryNo) { params.push(categoryNo); where += ` AND e.category_no = $${params.length}`; }
  }
  if (req.query.tag_id) {
    params.push(id(req.query.tag_id, '標籤', 'T'));
    where += ` AND EXISTS (SELECT 1 FROM diary_tag dt WHERE dt.entry_id = e.entry_id AND dt.tag_id = $${params.length})`;
  }
  return { params, where };
}

// 作者依月份、分類或標籤查詢全部有效日記，並回傳篇數與平均心情分數
router.get('/me/entries', requireLogin, wrap(async (req, res) => {
  const { limit, offset, page, size } = paging(req, 20);
  const { params, where } = reviewFilter(req);
  const stats = await query(
    `SELECT count(*) AS entry_count, round(avg(e.mood_score), 2) AS avg_mood
       FROM diary_entry e WHERE ${where}`,
    params,
  );
  const list = await query(
    `SELECT ${ENTRY_CARD}, e.mood_score, e.hidden_at ${ENTRY_FROM}
      WHERE ${where}
      ORDER BY e.entry_date DESC, e.entry_id DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit + 1, offset],
  );
  res.json({ entries: list.rows.slice(0, size), page, has_more: list.rows.length > size, stats: stats.rows[0] });
}));

// 月回顧：各月篇數與平均心情分數
router.get('/me/review/monthly', requireLogin, wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT to_char(date_trunc('month', e.entry_date), 'YYYY-MM') AS month,
            count(*) AS entry_count,
            round(avg(e.mood_score), 2) AS avg_mood
       FROM diary_entry e
      WHERE e.blog_id = $1 AND e.status <> 'deleted'
      GROUP BY 1
      ORDER BY 1 DESC
      LIMIT 24`,
    [req.user.blog_id],
  );
  // 作者自己用過的標籤（含已停用），供回顧篩選
  const tags = await query(
    `SELECT t.tag_id, t.tag_name, count(*) AS entry_count
       FROM diary_tag dt
       JOIN diary_entry e ON e.entry_id = dt.entry_id
       JOIN tag t ON t.tag_id = dt.tag_id
      WHERE e.blog_id = $1 AND e.status <> 'deleted'
      GROUP BY t.tag_id, t.tag_name
      ORDER BY entry_count DESC, t.tag_name`,
    [req.user.blog_id],
  );
  res.json({ months: rows, tags: tags.rows });
}));

export default router;
