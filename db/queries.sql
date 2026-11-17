-- =====================================================================
-- 代表性查詢（與後端實際執行的 SQL 相同，方便以 psql / pgAdmin 單獨展示）
-- 參數以 psql 變數表示，例如：\set viewer '''U00000002'''
-- =====================================================================

-- ---------- 使用者功能 ----------

-- U1. 公開搜尋：標題關鍵字（只回傳他人可讀的日記）
SELECT e.entry_id, e.title, u.nickname, e.published_at
  FROM diary_entry e
  JOIN blog b ON b.blog_id = e.blog_id
  JOIN user_account u ON u.user_id = b.user_id
 WHERE e.visibility = 'public' AND e.status = 'active'
   AND b.status = 'active' AND u.status = 'active'
   AND e.title ILIKE '%散步%'
 ORDER BY e.published_at DESC, e.entry_id DESC
 LIMIT 12;

-- U2. 追蹤動態：追蹤空間的近期公開日記（依 published_at）
SELECT e.entry_id, e.title, b.blog_name, e.published_at
  FROM diary_entry e
  JOIN blog b ON b.blog_id = e.blog_id
  JOIN user_account u ON u.user_id = b.user_id
  JOIN blog_follow bf ON bf.blog_id = e.blog_id AND bf.follower_id = 'U00000002'
 WHERE e.visibility = 'public' AND e.status = 'active'
   AND b.status = 'active' AND u.status = 'active'
 ORDER BY e.published_at DESC, e.entry_id DESC
 LIMIT 12;

-- U3. 作者月回顧：各月篇數與平均心情分數（只查自己的空間）
SELECT to_char(date_trunc('month', entry_date), 'YYYY-MM') AS month,
       count(*) AS entry_count, round(avg(mood_score), 2) AS avg_mood
  FROM diary_entry
 WHERE blog_id = 'B00000002' AND status <> 'deleted'
 GROUP BY 1 ORDER BY 1 DESC;

-- U4. 收藏清單：關聯保留，但不可讀的日記只回傳代號與 available = false
SELECT f.entry_id, f.created_at AS favorited_at,
       (e.visibility = 'public' AND e.status = 'active' AND b.status = 'active' AND u.status = 'active')
         OR (b.user_id = 'U00000002' AND e.status <> 'deleted') AS available
  FROM diary_favorite f
  JOIN diary_entry e ON e.entry_id = f.entry_id
  JOIN blog b ON b.blog_id = e.blog_id
  JOIN user_account u ON u.user_id = b.user_id
 WHERE f.user_id = 'U00000002'
 ORDER BY f.created_at DESC;

-- U5. 編輯日記：以 entry_id 與舊 version 為條件更新（0 列受影響 = 衝突）
-- UPDATE diary_entry
--    SET title = $3, content = $4, updated_at = now(), version = version + 1
--  WHERE entry_id = $1 AND version = $2;

-- ---------- 營運與分析功能 ----------

-- A1. 每日新增公開日記（最近 30 天）
SELECT (published_at AT TIME ZONE 'Asia/Taipei')::date AS day, count(*) AS entry_count
  FROM diary_entry
 WHERE visibility = 'public' AND status <> 'deleted'
   AND published_at >= now() - interval '30 days'
 GROUP BY 1 ORDER BY 1;

-- A2. 熱門標籤（最近 30 天公開且可讀的日記）
SELECT t.tag_name, count(*) AS entry_count
  FROM diary_tag dt
  JOIN tag t ON t.tag_id = dt.tag_id
  JOIN diary_entry e ON e.entry_id = dt.entry_id
  JOIN blog b ON b.blog_id = e.blog_id
  JOIN user_account u ON u.user_id = b.user_id
 WHERE e.visibility = 'public' AND e.status = 'active'
   AND b.status = 'active' AND u.status = 'active'
   AND e.published_at >= now() - interval '30 days'
 GROUP BY t.tag_name
 ORDER BY entry_count DESC, t.tag_name
 LIMIT 10;

-- A3. 公開日記互動量：留言與收藏先分別彙總再合併，避免同時連接使筆數相乘
WITH c AS (
  SELECT entry_id, count(*) AS n FROM comment
   WHERE status = 'visible' AND created_at >= now() - interval '30 days'
   GROUP BY entry_id
), f AS (
  SELECT entry_id, count(*) AS n FROM diary_favorite
   WHERE created_at >= now() - interval '30 days'
   GROUP BY entry_id
)
SELECT e.entry_id, e.title,
       COALESCE(c.n, 0) AS comment_count, COALESCE(f.n, 0) AS favorite_count,
       COALESCE(c.n, 0) + COALESCE(f.n, 0) AS interaction_count
  FROM diary_entry e
  JOIN blog b ON b.blog_id = e.blog_id
  JOIN user_account u ON u.user_id = b.user_id
  LEFT JOIN c ON c.entry_id = e.entry_id
  LEFT JOIN f ON f.entry_id = e.entry_id
 WHERE e.visibility = 'public' AND e.status = 'active'
   AND b.status = 'active' AND u.status = 'active'
   AND (c.n IS NOT NULL OR f.n IS NOT NULL)
 ORDER BY interaction_count DESC, e.entry_id
 LIMIT 10;

-- A4. 每週活躍作者（該週至少公開一篇日記的作者數）
SELECT date_trunc('week', published_at)::date AS week_start,
       count(DISTINCT blog_id) AS active_authors, count(*) AS public_entries
  FROM diary_entry
 WHERE visibility = 'public' AND status <> 'deleted'
   AND published_at >= date_trunc('week', now()) - interval '7 weeks'
 GROUP BY 1 ORDER BY 1;

-- A5. 被追蹤數最多的公開空間
SELECT b.blog_id, b.blog_name, u.nickname, count(bf.follower_id) AS follower_count
  FROM blog b
  JOIN user_account u ON u.user_id = b.user_id
  LEFT JOIN blog_follow bf ON bf.blog_id = b.blog_id
 WHERE b.status = 'active' AND u.status = 'active'
 GROUP BY b.blog_id, b.blog_name, u.nickname
 ORDER BY follower_count DESC, b.blog_id
 LIMIT 10;

-- ---------- 索引效能比較的起點 ----------
-- 先只執行 schema.sql 並匯入資料，對 U1 / U2 / A2 執行 EXPLAIN (ANALYZE, BUFFERS)，
-- 再執行 indexes.sql 後重跑一次比較。
