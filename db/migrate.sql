-- 把較早建立的資料庫升級到目前的結構；可重複執行，不會動到既有資料。
--   npm run db:migrate
-- 2026-11：個人風格（簽名、封面圖案、標題字體）與歌曲連結
ALTER TABLE blog
  ADD COLUMN IF NOT EXISTS tagline        varchar(60),
  ADD COLUMN IF NOT EXISTS cover_pattern  varchar(8) NOT NULL DEFAULT 'shapes',
  ADD COLUMN IF NOT EXISTS title_font     varchar(5) NOT NULL DEFAULT 'serif',
  ADD COLUMN IF NOT EXISTS song_title     varchar(120),
  ADD COLUMN IF NOT EXISTS song_url       varchar(500);
ALTER TABLE diary_entry
  ADD COLUMN IF NOT EXISTS song_title  varchar(120),
  ADD COLUMN IF NOT EXISTS song_url    varchar(500);

DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT * FROM (VALUES
    ('blog', 'blog_tagline_nonblank', 'CHECK (tagline IS NULL OR char_length(btrim(tagline)) > 0)'),
    ('blog', 'blog_cover_domain', $c$CHECK (cover_pattern IN ('shapes', 'waves', 'grid', 'dots'))$c$),
    ('blog', 'blog_font_domain', $c$CHECK (title_font IN ('serif', 'sans', 'mono'))$c$),
    ('blog', 'blog_song_pair', 'CHECK ((song_title IS NULL) = (song_url IS NULL))'),
    ('blog', 'blog_song_https', $c$CHECK (song_url IS NULL OR song_url LIKE 'https://%')$c$),
    ('diary_entry', 'entry_song_pair', 'CHECK ((song_title IS NULL) = (song_url IS NULL))'),
    ('diary_entry', 'entry_song_https', $c$CHECK (song_url IS NULL OR song_url LIKE 'https://%')$c$)
  ) AS t(tbl, name, def)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = c.name) THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I %s', c.tbl, c.name, c.def);
    END IF;
  END LOOP;
END $$;

-- 2026-11：大頭貼、現在的心情、回覆留言、表情回應、通知（資料表由 12 張增為 14 張）
ALTER TABLE user_account
  ADD COLUMN IF NOT EXISTS avatar_url         text,
  ADD COLUMN IF NOT EXISTS status_text        varchar(60),
  ADD COLUMN IF NOT EXISTS status_expires_at  timestamptz;
ALTER TABLE comment ADD COLUMN IF NOT EXISTS parent_id char(9);
CREATE SEQUENCE IF NOT EXISTS notification_seq AS bigint MAXVALUE 99999999 NO CYCLE;

DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT * FROM (VALUES
    ('user_account', 'user_status_text_pair', 'CHECK ((status_text IS NULL) = (status_expires_at IS NULL))'),
    ('user_account', 'user_status_text_nonblank', 'CHECK (status_text IS NULL OR char_length(btrim(status_text)) > 0)'),
    ('comment', 'comment_id_entry_unique', 'UNIQUE (comment_id, entry_id)'),
    ('comment', 'comment_parent_same_entry', 'FOREIGN KEY (parent_id, entry_id) REFERENCES comment (comment_id, entry_id) ON DELETE RESTRICT ON UPDATE RESTRICT'),
    ('comment', 'comment_parent_not_self', 'CHECK (parent_id <> comment_id)')
  ) AS t(tbl, name, def)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = c.name) THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I %s', c.tbl, c.name, c.def);
    END IF;
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS diary_reaction (
  user_id     char(9)     NOT NULL REFERENCES user_account (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  entry_id    char(9)     NOT NULL REFERENCES diary_entry (entry_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  reaction    varchar(5)  NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, entry_id),
  CONSTRAINT reaction_domain CHECK (reaction IN ('like', 'hug', 'cheer', 'haha', 'sad'))
);
CREATE TABLE IF NOT EXISTS notification (
  notification_id  char(9)     PRIMARY KEY DEFAULT make_id('N', 'notification_seq'),
  user_id          char(9)     NOT NULL REFERENCES user_account (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  actor_id         char(9)     NOT NULL REFERENCES user_account (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  kind             varchar(9)  NOT NULL,
  entry_id         char(9)     REFERENCES diary_entry (entry_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  comment_id       char(9)     REFERENCES comment (comment_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  created_at       timestamptz NOT NULL DEFAULT now(),
  read_at          timestamptz,
  CONSTRAINT notification_kind_domain CHECK (kind IN ('comment', 'reply', 'mention', 'favorite', 'reaction', 'follow', 'guestbook')),
  CONSTRAINT notification_not_self    CHECK (user_id <> actor_id),
  CONSTRAINT notification_entry_kinds CHECK ((kind IN ('follow', 'guestbook')) = (entry_id IS NULL)),
  CONSTRAINT notification_read_after  CHECK (read_at IS NULL OR read_at >= created_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS notification_once_idx
  ON notification (user_id, actor_id, kind, COALESCE(entry_id, '-'))
  WHERE kind IN ('favorite', 'reaction', 'follow');
CREATE INDEX IF NOT EXISTS diary_reaction_entry_idx ON diary_reaction (entry_id, reaction);
CREATE INDEX IF NOT EXISTS comment_parent_idx       ON comment (parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS notification_user_idx    ON notification (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notification_unread_idx  ON notification (user_id) WHERE read_at IS NULL;
ALTER TABLE diary_reaction ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification   ENABLE ROW LEVEL SECURITY;

-- 2026-11：個人主頁的自訂背景圖與主題套用範圍
ALTER TABLE blog
  ADD COLUMN IF NOT EXISTS background_url text,
  ADD COLUMN IF NOT EXISTS theme_scope    varchar(6) NOT NULL DEFAULT 'header';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'blog_theme_scope_domain') THEN
    ALTER TABLE blog ADD CONSTRAINT blog_theme_scope_domain CHECK (theme_scope IN ('header', 'page'));
  END IF;
END $$;
