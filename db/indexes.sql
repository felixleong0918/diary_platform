-- =====================================================================
-- 次要索引。與 schema.sql 分開，方便期末比較「加索引前後」的執行計畫：
--   先只跑 schema.sql + 匯入資料，EXPLAIN ANALYZE 後再執行本檔比較。
-- =====================================================================

-- 空間內依日期列出日記、作者月回顧
CREATE INDEX IF NOT EXISTS diary_entry_blog_date_idx
  ON diary_entry (blog_id, entry_date DESC);

-- 公開動態與追蹤動態：只索引他人可能讀到的列，依公開時間排序
CREATE INDEX IF NOT EXISTS diary_entry_public_feed_idx
  ON diary_entry (published_at DESC)
  WHERE visibility = 'public' AND status = 'active';

CREATE INDEX IF NOT EXISTS diary_entry_blog_public_idx
  ON diary_entry (blog_id, published_at DESC)
  WHERE visibility = 'public' AND status = 'active';

-- 複合外鍵（分類）反查
CREATE INDEX IF NOT EXISTS diary_entry_category_idx
  ON diary_entry (blog_id, category_no);

-- 標題關鍵字搜尋（ILIKE '%關鍵字%'）
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS diary_entry_title_trgm_idx
  ON diary_entry USING gin (title gin_trgm_ops);

-- 由標籤找日記（主鍵是 entry_id 在前，反向需要另一個索引）
CREATE INDEX IF NOT EXISTS diary_tag_tag_idx ON diary_tag (tag_id, entry_id);

-- 留言、留言板依目標列出
CREATE INDEX IF NOT EXISTS comment_entry_idx   ON comment (entry_id, created_at);
CREATE INDEX IF NOT EXISTS comment_user_idx    ON comment (user_id);
CREATE INDEX IF NOT EXISTS guestbook_blog_idx  ON guestbook_entry (blog_id, created_at DESC);
CREATE INDEX IF NOT EXISTS guestbook_user_idx  ON guestbook_entry (user_id);

-- 互動數量彙總、被追蹤數
CREATE INDEX IF NOT EXISTS diary_favorite_entry_idx ON diary_favorite (entry_id);
CREATE INDEX IF NOT EXISTS blog_follow_blog_idx     ON blog_follow (blog_id);
