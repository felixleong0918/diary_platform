import { unavailable } from './errors.js';

/**
 * 可見性規則（計畫書 1.3）。SQL 片段假設別名：
 *   e = diary_entry, b = blog, u = user_account（空間擁有者）
 */

// 他人可讀：帳號、空間、日記皆為 active，且日記為 public
export const PUBLIC_READABLE = `(e.visibility = 'public' AND e.status = 'active'
  AND b.status = 'active' AND u.status = 'active')`;

// 空間對他人可見：空間與擁有者皆為 active
export const BLOG_VISIBLE = `(b.status = 'active' AND u.status = 'active')`;

/** 指定讀者（參數位置 $n，可為 NULL）可讀：公開可讀，或作者本人讀自己尚未刪除的內容 */
export const readableBy = (n) =>
  `(${PUBLIC_READABLE} OR (b.user_id = $${n} AND e.status <> 'deleted'))`;

export function isPublicReadable(ctx) {
  return (
    ctx.visibility === 'public' &&
    ctx.entry_status === 'active' &&
    ctx.blog_status === 'active' &&
    ctx.owner_status === 'active'
  );
}

export function canRead(ctx, viewerId) {
  if (viewerId && ctx.owner_id === viewerId && ctx.entry_status !== 'deleted') return true;
  return isPublicReadable(ctx);
}

/**
 * 在交易內依固定順序（帳號 → 空間 → 日記）鎖定並重查目標，
 * 避免檢查之後權限改變仍寫入。mode: 'SHARE'（互動寫入）或 'UPDATE'（狀態切換）。
 */
export async function lockEntryContext(client, entryId, mode = 'SHARE') {
  const ref = await client.query(
    `SELECT e.blog_id, b.user_id AS owner_id
       FROM diary_entry e JOIN blog b ON b.blog_id = e.blog_id
      WHERE e.entry_id = $1`,
    [entryId],
  );
  if (!ref.rows[0]) throw unavailable();
  const { blog_id, owner_id } = ref.rows[0];
  const owner = await client.query('SELECT status FROM user_account WHERE user_id = $1 FOR SHARE', [owner_id]);
  const blog = await client.query('SELECT status FROM blog WHERE blog_id = $1 FOR SHARE', [blog_id]);
  const entry = await client.query(`SELECT * FROM diary_entry WHERE entry_id = $1 FOR ${mode}`, [entryId]);
  const e = entry.rows[0];
  return {
    ...e,
    owner_id,
    entry_status: e.status,
    blog_status: blog.rows[0].status,
    owner_status: owner.rows[0].status,
  };
}

/** 鎖定空間與其擁有者（帳號 → 空間）。 */
export async function lockBlogContext(client, blogId, mode = 'SHARE') {
  const ref = await client.query('SELECT user_id FROM blog WHERE blog_id = $1', [blogId]);
  if (!ref.rows[0]) throw unavailable();
  const owner_id = ref.rows[0].user_id;
  const owner = await client.query('SELECT status FROM user_account WHERE user_id = $1 FOR SHARE', [owner_id]);
  const blog = await client.query(`SELECT * FROM blog WHERE blog_id = $1 FOR ${mode}`, [blogId]);
  return { ...blog.rows[0], owner_id, blog_status: blog.rows[0].status, owner_status: owner.rows[0].status };
}
