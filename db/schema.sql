-- =====================================================================
-- 日記與個人部落格平台  —  PostgreSQL schema（第 16 組）
-- 依計畫書 2.3–2.5 的 12 張關聯式資料表建立，另新增 DIARY_REACTION 與 NOTIFICATION 兩張。
--
-- 與計畫書不同之處（依計畫書 1.2.1 第 6 點的批註新增）：
--   DIARY_ENTRY.published_at  最近一次改為 public 的時間；從未公開則為 NULL
--   DIARY_ENTRY.hidden_at     被營運者設為 hidden 的時間；解除隱藏後回到 NULL
-- 其餘欄位、型態、鍵與限制皆依資料字典。
-- 所有外鍵統一 ON DELETE RESTRICT ON UPDATE RESTRICT。
-- =====================================================================

BEGIN;

-- 代號：一位實體前綴 + 八位十進位流水號，由獨立序列產生且不重用
CREATE SEQUENCE user_account_seq   AS bigint MAXVALUE 99999999 NO CYCLE;
CREATE SEQUENCE theme_seq          AS bigint MAXVALUE 99999999 NO CYCLE;
CREATE SEQUENCE blog_seq           AS bigint MAXVALUE 99999999 NO CYCLE;
CREATE SEQUENCE diary_entry_seq    AS bigint MAXVALUE 99999999 NO CYCLE;
CREATE SEQUENCE tag_seq            AS bigint MAXVALUE 99999999 NO CYCLE;
CREATE SEQUENCE comment_seq        AS bigint MAXVALUE 99999999 NO CYCLE;
CREATE SEQUENCE guestbook_seq      AS bigint MAXVALUE 99999999 NO CYCLE;
CREATE SEQUENCE notification_seq   AS bigint MAXVALUE 99999999 NO CYCLE;

CREATE FUNCTION make_id(prefix char, seq regclass) RETURNS char(9)
LANGUAGE sql VOLATILE AS
$$ SELECT (prefix || lpad(nextval(seq)::text, 8, '0'))::char(9) $$;

-- ---------------------------------------------------------------------
-- 表 1  USER_ACCOUNT
-- ---------------------------------------------------------------------
CREATE TABLE user_account (
  user_id        char(9)      PRIMARY KEY DEFAULT make_id('U', 'user_account_seq'),
  username       varchar(30)  NOT NULL UNIQUE,
  email          varchar(254) NOT NULL UNIQUE,
  password_hash  text         NOT NULL,
  nickname       varchar(50)  NOT NULL,
  status         varchar(12)  NOT NULL DEFAULT 'active',
  created_at     timestamptz  NOT NULL DEFAULT now(),
  avatar_url         text,                -- 新增：大頭貼的儲存位置
  status_text        varchar(60),         -- 新增：現在的心情
  status_expires_at  timestamptz,         -- 新增：心情的到期時間
  CONSTRAINT user_status_text_pair    CHECK ((status_text IS NULL) = (status_expires_at IS NULL)),
  CONSTRAINT user_status_text_nonblank CHECK (status_text IS NULL OR char_length(btrim(status_text)) > 0),
  CONSTRAINT user_username_normalized CHECK (username = lower(btrim(username)) AND char_length(username) > 0),
  CONSTRAINT user_email_normalized    CHECK (email = lower(btrim(email)) AND char_length(email) > 0),
  CONSTRAINT user_nickname_nonblank   CHECK (char_length(btrim(nickname)) > 0),
  CONSTRAINT user_status_domain       CHECK (status IN ('active', 'suspended', 'deactivated'))
);

-- ---------------------------------------------------------------------
-- 表 2  USER_ROLE（多值屬性 Role 拆出）
-- ---------------------------------------------------------------------
CREATE TABLE user_role (
  user_id  char(9)     NOT NULL REFERENCES user_account (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  role     varchar(10) NOT NULL,
  PRIMARY KEY (user_id, role),
  CONSTRAINT user_role_domain CHECK (role IN ('User', 'Operator'))
);

-- ---------------------------------------------------------------------
-- 表 3  THEME
-- ---------------------------------------------------------------------
CREATE TABLE theme (
  theme_id    char(9)     PRIMARY KEY DEFAULT make_id('H', 'theme_seq'),
  theme_name  varchar(50) NOT NULL UNIQUE,
  style_key   varchar(50) NOT NULL UNIQUE,
  status      varchar(8)  NOT NULL DEFAULT 'active',
  CONSTRAINT theme_name_nonblank  CHECK (char_length(btrim(theme_name)) > 0),
  CONSTRAINT theme_style_nonblank CHECK (char_length(btrim(style_key)) > 0),
  CONSTRAINT theme_status_domain  CHECK (status IN ('active', 'retired'))
);

-- ---------------------------------------------------------------------
-- 表 4  BLOG（每個帳號擁有且僅擁有一個空間）
-- ---------------------------------------------------------------------
CREATE TABLE blog (
  blog_id      char(9)      PRIMARY KEY DEFAULT make_id('B', 'blog_seq'),
  user_id      char(9)      NOT NULL UNIQUE REFERENCES user_account (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  theme_id     char(9)      NOT NULL REFERENCES theme (theme_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  blog_name    varchar(100) NOT NULL,
  description  text,
  status       varchar(8)   NOT NULL DEFAULT 'active',
  created_at   timestamptz  NOT NULL DEFAULT now(),
  tagline        varchar(60),                               -- 新增：一句話簽名
  cover_pattern  varchar(8)   NOT NULL DEFAULT 'shapes',    -- 新增：封面圖案
  title_font     varchar(5)   NOT NULL DEFAULT 'serif',     -- 新增：標題字體
  song_title     varchar(120),                              -- 新增：代表歌曲名稱
  song_url       varchar(500),                              -- 新增：代表歌曲連結（https）
  background_url text,                                      -- 新增：自訂背景圖的儲存位置
  theme_scope    varchar(6)   NOT NULL DEFAULT 'header',    -- 新增：主題套用範圍（標頭或整個主頁）
  CONSTRAINT blog_theme_scope_domain CHECK (theme_scope IN ('header', 'page')),
  CONSTRAINT blog_tagline_nonblank CHECK (tagline IS NULL OR char_length(btrim(tagline)) > 0),
  CONSTRAINT blog_cover_domain    CHECK (cover_pattern IN ('shapes', 'waves', 'grid', 'dots')),
  CONSTRAINT blog_font_domain     CHECK (title_font IN ('serif', 'sans', 'mono')),
  CONSTRAINT blog_song_pair       CHECK ((song_title IS NULL) = (song_url IS NULL)),
  CONSTRAINT blog_song_https      CHECK (song_url IS NULL OR song_url LIKE 'https://%'),
  CONSTRAINT blog_name_nonblank   CHECK (char_length(btrim(blog_name)) > 0),
  CONSTRAINT blog_description_len CHECK (description IS NULL OR char_length(description) <= 1000),
  CONSTRAINT blog_status_domain   CHECK (status IN ('active', 'hidden', 'closed'))
);

-- ---------------------------------------------------------------------
-- 表 5  CATEGORY（弱實體，部分鍵 category_no）
-- ---------------------------------------------------------------------
CREATE TABLE category (
  blog_id        char(9)     NOT NULL REFERENCES blog (blog_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  category_no    integer     NOT NULL,
  category_name  varchar(40) NOT NULL,
  status         varchar(8)  NOT NULL DEFAULT 'active',
  PRIMARY KEY (blog_id, category_no),
  UNIQUE (blog_id, category_name),
  CONSTRAINT category_no_positive    CHECK (category_no > 0),
  CONSTRAINT category_name_nonblank  CHECK (category_name = btrim(category_name) AND char_length(category_name) > 0),
  CONSTRAINT category_status_domain  CHECK (status IN ('active', 'retired'))
);
-- 名稱唯一性以標準化後（去空白、統一大小寫）的值判斷
CREATE UNIQUE INDEX category_name_normalized_uq ON category (blog_id, lower(category_name));

-- ---------------------------------------------------------------------
-- 表 6  DIARY_ENTRY
-- ---------------------------------------------------------------------
CREATE TABLE diary_entry (
  entry_id      char(9)      PRIMARY KEY DEFAULT make_id('E', 'diary_entry_seq'),
  blog_id       char(9)      NOT NULL REFERENCES blog (blog_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  category_no   integer,
  entry_date    date         NOT NULL,
  title         varchar(150) NOT NULL,
  content       text         NOT NULL,
  mood_score    smallint     NOT NULL,
  photo_url     text,
  visibility    varchar(7)   NOT NULL DEFAULT 'private',
  status        varchar(7)   NOT NULL DEFAULT 'active',
  created_at    timestamptz  NOT NULL DEFAULT now(),
  updated_at    timestamptz  NOT NULL DEFAULT now(),
  version       integer      NOT NULL DEFAULT 1,
  published_at  timestamptz,           -- 新增：最近一次公開的時間
  hidden_at     timestamptz,           -- 新增：被營運者隱藏的時間
  song_title    varchar(120),          -- 新增：歌曲名稱
  song_url      varchar(500),          -- 新增：歌曲連結（https）
  -- 複合外鍵（MATCH SIMPLE）：category_no 為空時可不分類，非空時不能引用他人空間的分類
  CONSTRAINT diary_entry_category_fk FOREIGN KEY (blog_id, category_no)
    REFERENCES category (blog_id, category_no) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT entry_title_nonblank   CHECK (char_length(btrim(title)) > 0),
  CONSTRAINT entry_content_len      CHECK (char_length(btrim(content)) > 0 AND char_length(content) <= 20000),
  CONSTRAINT entry_mood_range       CHECK (mood_score BETWEEN 1 AND 5),
  CONSTRAINT entry_song_pair        CHECK ((song_title IS NULL) = (song_url IS NULL)),
  CONSTRAINT entry_song_https       CHECK (song_url IS NULL OR song_url LIKE 'https://%'),
  CONSTRAINT entry_visibility_domain CHECK (visibility IN ('public', 'private')),
  CONSTRAINT entry_status_domain    CHECK (status IN ('active', 'hidden', 'deleted')),
  CONSTRAINT entry_updated_after_created CHECK (updated_at >= created_at),
  CONSTRAINT entry_version_positive CHECK (version > 0),
  CONSTRAINT entry_public_has_published_at CHECK (visibility <> 'public' OR published_at IS NOT NULL),
  CONSTRAINT entry_hidden_has_hidden_at    CHECK (status <> 'hidden' OR hidden_at IS NOT NULL)
);

-- ---------------------------------------------------------------------
-- 表 7  TAG（全站共用字典）
-- ---------------------------------------------------------------------
CREATE TABLE tag (
  tag_id    char(9)     PRIMARY KEY DEFAULT make_id('T', 'tag_seq'),
  tag_name  varchar(30) NOT NULL UNIQUE,
  status    varchar(8)  NOT NULL DEFAULT 'active',
  -- 名稱去除首尾空白並統一英文大小寫後設唯一限制
  CONSTRAINT tag_name_normalized CHECK (tag_name = lower(btrim(tag_name)) AND char_length(tag_name) > 0),
  CONSTRAINT tag_status_domain   CHECK (status IN ('active', 'retired'))
);

-- ---------------------------------------------------------------------
-- 表 8  COMMENT（日記留言）
-- ---------------------------------------------------------------------
CREATE TABLE comment (
  comment_id  char(9)     PRIMARY KEY DEFAULT make_id('C', 'comment_seq'),
  entry_id    char(9)     NOT NULL REFERENCES diary_entry (entry_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  user_id     char(9)     NOT NULL REFERENCES user_account (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  content     text        NOT NULL,
  status      varchar(7)  NOT NULL DEFAULT 'visible',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  parent_id   char(9),               -- 新增：回覆的對象；NULL 表示直接對日記留言
  -- 回覆必須與上層留言屬於同一篇日記
  CONSTRAINT comment_id_entry_unique UNIQUE (comment_id, entry_id),
  CONSTRAINT comment_parent_same_entry FOREIGN KEY (parent_id, entry_id)
    REFERENCES comment (comment_id, entry_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT comment_parent_not_self CHECK (parent_id <> comment_id),
  CONSTRAINT comment_content_len   CHECK (char_length(btrim(content)) > 0 AND char_length(content) <= 1000),
  CONSTRAINT comment_status_domain CHECK (status IN ('visible', 'hidden', 'deleted')),
  CONSTRAINT comment_updated_after_created CHECK (updated_at >= created_at)
);

-- ---------------------------------------------------------------------
-- 表 9  GUESTBOOK_ENTRY（空間留言板，必須登入才能留言）
-- ---------------------------------------------------------------------
CREATE TABLE guestbook_entry (
  guestbook_id  char(9)     PRIMARY KEY DEFAULT make_id('G', 'guestbook_seq'),
  blog_id       char(9)     NOT NULL REFERENCES blog (blog_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  user_id       char(9)     NOT NULL REFERENCES user_account (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  content       text        NOT NULL,
  status        varchar(7)  NOT NULL DEFAULT 'visible',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guestbook_content_len   CHECK (char_length(btrim(content)) > 0 AND char_length(content) <= 1000),
  CONSTRAINT guestbook_status_domain CHECK (status IN ('visible', 'hidden', 'deleted')),
  CONSTRAINT guestbook_updated_after_created CHECK (updated_at >= created_at)
);

-- ---------------------------------------------------------------------
-- 表 10  DIARY_FAVORITE
-- ---------------------------------------------------------------------
CREATE TABLE diary_favorite (
  user_id     char(9)     NOT NULL REFERENCES user_account (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  entry_id    char(9)     NOT NULL REFERENCES diary_entry (entry_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, entry_id)
);

-- ---------------------------------------------------------------------
-- 表 11  BLOG_FOLLOW
-- ---------------------------------------------------------------------
CREATE TABLE blog_follow (
  follower_id  char(9)     NOT NULL REFERENCES user_account (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  blog_id      char(9)     NOT NULL REFERENCES blog (blog_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  followed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, blog_id)
);

-- ---------------------------------------------------------------------
-- 表 12  DIARY_TAG
-- ---------------------------------------------------------------------
CREATE TABLE diary_tag (
  entry_id  char(9) NOT NULL REFERENCES diary_entry (entry_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  tag_id    char(9) NOT NULL REFERENCES tag (tag_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  PRIMARY KEY (entry_id, tag_id)
);

-- ---------------------------------------------------------------------
-- 表 13  DIARY_REACTION（新增：對日記的表情回應，每人每篇一種）
-- ---------------------------------------------------------------------
CREATE TABLE diary_reaction (
  user_id     char(9)     NOT NULL REFERENCES user_account (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  entry_id    char(9)     NOT NULL REFERENCES diary_entry (entry_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  reaction    varchar(5)  NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, entry_id),
  CONSTRAINT reaction_domain CHECK (reaction IN ('like', 'hug', 'cheer', 'haha', 'sad'))
);

-- ---------------------------------------------------------------------
-- 表 14  NOTIFICATION（新增：互動通知）
--   kind 決定連結目標：comment / reply / mention / favorite / reaction 指向日記，
--   follow 指向行為者的空間，guestbook 指向收件者自己的留言板。
-- ---------------------------------------------------------------------
CREATE TABLE notification (
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
-- 收藏、表情與追蹤可以反覆切換：同一人對同一目標只留一則通知
CREATE UNIQUE INDEX notification_once_idx
  ON notification (user_id, actor_id, kind, COALESCE(entry_id, '-'))
  WHERE kind IN ('favorite', 'reaction', 'follow');

-- Platform operator moderation audit trail. Target IDs intentionally have no FK
-- so records survive if a target is eventually purged.
CREATE TABLE operator_audit_log (
  audit_id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  operator_id       char(9) NOT NULL REFERENCES user_account (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  operator_username varchar(30) NOT NULL,
  operator_nickname varchar(50) NOT NULL,
  action            varchar(12) NOT NULL,
  target_type       varchar(12) NOT NULL,
  target_id         char(9) NOT NULL,
  target_summary    text NOT NULL DEFAULT '',
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT operator_audit_action_domain CHECK (action IN ('delete', 'suspend', 'reactivate')),
  CONSTRAINT operator_audit_target_domain CHECK (target_type IN ('entry', 'comment', 'guestbook', 'account'))
);
CREATE INDEX operator_audit_created_idx ON operator_audit_log (created_at DESC, audit_id DESC);
CREATE INDEX operator_audit_operator_idx ON operator_audit_log (operator_id, created_at DESC);

-- ---------------------------------------------------------------------
-- Row Level Security
-- Supabase 會替 public schema 的資料表自動產生對外的 Data API。
-- 啟用 RLS 且不建立任何 policy，等於只有資料表擁有者（後端使用的連線角色）能存取，
-- 匿名金鑰讀不到密碼雜湊或私密日記。在本機 PostgreSQL 上對擁有者沒有影響。
-- ---------------------------------------------------------------------
ALTER TABLE user_account    ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_role       ENABLE ROW LEVEL SECURITY;
ALTER TABLE theme           ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog            ENABLE ROW LEVEL SECURITY;
ALTER TABLE category        ENABLE ROW LEVEL SECURITY;
ALTER TABLE diary_entry     ENABLE ROW LEVEL SECURITY;
ALTER TABLE tag             ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment         ENABLE ROW LEVEL SECURITY;
ALTER TABLE guestbook_entry ENABLE ROW LEVEL SECURITY;
ALTER TABLE diary_favorite  ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_follow     ENABLE ROW LEVEL SECURITY;
ALTER TABLE diary_tag       ENABLE ROW LEVEL SECURITY;
ALTER TABLE diary_reaction  ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification    ENABLE ROW LEVEL SECURITY;
ALTER TABLE operator_audit_log ENABLE ROW LEVEL SECURITY;

COMMIT;
