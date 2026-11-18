// 顯示使用者時共用的 SQL 片段與通知寫入。
/** 大頭貼網址（沒有上傳時為 NULL）；網址帶上檔名片段，換圖後瀏覽器會重新抓取。 */
export const avatarSql = (alias) =>
  `CASE WHEN ${alias}.avatar_url IS NOT NULL
        THEN '/api/avatars/' || ${alias}.user_id || '?v=' || right(${alias}.avatar_url, 12) END`;

/** 空間的自訂背景圖網址（沒有上傳時為 NULL）。 */
export const backgroundSql = (alias) =>
  `CASE WHEN ${alias}.background_url IS NOT NULL
        THEN '/api/blogs/' || ${alias}.blog_id || '/background?v=' || right(${alias}.background_url, 12) END`;

/** 尚未到期的「現在的心情」。 */
export const statusSql = (alias) =>
  `CASE WHEN ${alias}.status_expires_at > now() THEN ${alias}.status_text END`;

export const REACTIONS = ['like', 'hug', 'cheer', 'haha', 'sad'];

/**
 * 寫入一則通知。自己對自己的動作不通知；收藏、表情與追蹤重複發生時只保留第一則。
 * db 可以是交易中的 client 或 { query }。
 */
export async function notify(db, { user_id, actor_id, kind, entry_id = null, comment_id = null }) {
  if (!user_id || user_id === actor_id) return;
  await db.query(
    `INSERT INTO notification (user_id, actor_id, kind, entry_id, comment_id)
     VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
    [user_id, actor_id, kind, entry_id, comment_id],
  );
}

/** 從留言文字找出被 @ 的帳號（最多 5 個，不重複）。 */
export function mentionedUsernames(content) {
  const found = new Set();
  for (const m of content.matchAll(/(?:^|[^a-z0-9_@])@([a-z0-9_]{3,30})/gi)) {
    found.add(m[1].toLowerCase());
    if (found.size === 5) break;
  }
  return [...found];
}
