# LittleTreeHollow°

日記與個人部落格平台。資料庫管理 115 學年度第 1 學期期末專案，第 16 組。

在自己的空間寫日記，用分類、標籤與心情分數整理，並決定每篇要公開分享或只留給自己。其他人可以留言、收藏、追蹤空間，平台營運者維護主題、標籤與公開內容。

## 功能

**訪客與一般使用者**

- 依標題、作者或標籤搜尋公開日記；在單一空間內依分類與日期篩選
- 註冊後自動建立個人空間；可修改暱稱、空間名稱、簡介、主題與分類
- 個人風格：一句話簽名、封面圖案、標題字體，以及一首代表歌曲
- 寫日記：日期、標題、內文、1 至 5 分心情分數、分類、多個標籤、一張照片、一首歌，可設為公開或私密
- 標籤可以自訂；歌曲貼上 YouTube 或 Spotify 連結會自動帶入歌名
- 歌曲在頁面內播放：YouTube 連結進入空間時會嘗試自動播放（被瀏覽器擋下時顯示播放鈕），Spotify 連結顯示嵌入播放器（未登入 Spotify 時為 30 秒試聽）
- 個人回顧：依月份、分類、標籤查詢，顯示篇數與平均心情分數
- 日記留言與空間留言板；留言可以回覆（一層）並用 `@帳號` 提到別人
- 對日記按表情回應：喜歡、抱抱、加油、好笑、難過
- 大頭貼，以及一句會到期的「現在的心情」
- 通知：有人留言、回覆、提及、回應、收藏、追蹤或在留言板留言時提醒
- 追蹤空間、收藏日記

**平台營運者**

- 新增、更名、停用主題與標籤
- 隱藏、恢復或永久刪除公開日記、留言與留言板訊息；隱藏空間
- 帳號管理：依狀態與身分篩選、查看單一帳號的各項筆數與最近的公開日記、停權、授予或撤銷營運者身分
- Dashboard：成長趨勢、每日貼文數量、互動分析、內容組成、發文時段熱度圖、熱門標籤、每週活躍作者、搜尋後閱讀轉換率

## 技術

| 部分 | 技術 | 線上環境 |
|---|---|---|
| 前端 | React 18、Vite、手寫 CSS | Vercel |
| 後端 | Node.js、Express，以 `pg` 直接撰寫 SQL | Vercel Function |
| 關聯式資料庫 | PostgreSQL，14 張資料表 | Supabase |
| 照片 | 資料庫只存位置，檔案存在私有 bucket | Supabase Storage |
| NoSQL | MongoDB，儲存公開搜尋與瀏覽事件 | MongoDB Atlas |

## 本機執行

需要 Node.js 20 以上與 Docker（或本機安裝的 PostgreSQL、MongoDB）。

```bash
docker compose up -d                       # 啟動 PostgreSQL 與 MongoDB
npm run setup                              # 安裝前後端套件
cp backend/.env.example backend/.env
npm run db:init                            # 建立資料表與索引
npm run db:seed                            # 產生示範資料
npm run dev:api                            # 後端 http://localhost:3000
npm run dev:web                            # 前端 http://localhost:5173（另開一個終端機）
```

使用本機安裝的 PostgreSQL 時，把 `backend/.env` 的 `DATABASE_URL` 改成自己的連線字串。

示範資料的帳號密碼都是 `password123`：`operator` 是營運者，`demo` 是一般使用者。營運者可以在「營運管理 → 帳號與權限」把其他帳號設為營運者。沒有任何營運者時，用 SQL 指派第一位：

```sql
INSERT INTO user_role (user_id, role)
SELECT user_id, 'Operator' FROM user_account WHERE username = '帳號';
```

### 資料規模

```bash
npm run db:reset                           # 移除並重建資料表（之後不需要再執行 db:init）
npm run db:migrate                         # 保留資料，把較早建立的資料庫升級到目前的結構
npm run db:export                          # 每張表匯出成一個 CSV，放在 exports/（不含密碼雜湊）
npm run db:seed                            # 40 帳號、600 篇日記
npm run db:seed -- --scale=full            # 計畫書的建置目標
npm run db:seed -- --users=500             # 指定帳號數，其餘依比例
```

| | 帳號與空間 | 日記 | 留言 | 收藏 | 追蹤 | 標籤配對 |
|---|---|---|---|---|---|---|
| 預設 | 40 | 600 | 1,200 | 800 | 200 | 1,200 |
| `--scale=full` | 2,000 | 30,000 | 60,000 | 40,000 | 10,000 | 60,000 |

完整規模另外產生 6,000 則留言板訊息與 50,000 筆表情回應；約四分之一的留言是回覆，通知由最近 14 天的互動推得。這幾項不在計畫書的建置目標內。

### 測試

```bash
createdb diary_test
TEST_DATABASE_URL=postgres://diary:diary@localhost:5432/diary_test npm test
```

測試會清空 `TEST_DATABASE_URL` 指向的資料庫。

## 部署

Vercel、Supabase 與 MongoDB Atlas 的設定步驟見 [DEPLOY.md](DEPLOY.md)。推送到 `main` 後 Vercel 會自動重新部署。

## 資料庫設計

Schema 在 [`db/schema.sql`](db/schema.sql)，索引在 [`db/indexes.sql`](db/indexes.sql)，代表性查詢在 [`db/queries.sql`](db/queries.sql) 與 [`db/mongo_queries.js`](db/mongo_queries.js)。

| 資料表 | 內容 |
|---|---|
| `user_account`、`user_role` | 帳號與身分（User、Operator） |
| `theme`、`blog` | 主題與個人空間，每個帳號一個空間 |
| `category` | 空間內的分類，弱實體，主鍵 `(blog_id, category_no)` |
| `diary_entry` | 日記 |
| `tag`、`diary_tag` | 全站標籤與日記的多對多配對 |
| `comment`、`guestbook_entry` | 日記留言與空間留言板 |
| `diary_favorite`、`blog_follow` | 收藏與追蹤 |

**與計畫書的差異**：計畫書規劃 12 張資料表，實作時新增 `diary_reaction`（表情回應，主鍵為帳號與日記）與 `notification`（互動通知）兩張，共 14 張。另外新增以下欄位。

| 欄位 | 說明 |
|---|---|
| `diary_entry.published_at` | 最近一次改為公開的時間，追蹤動態與近期公開日記依此排序 |
| `diary_entry.hidden_at` | 被營運者隱藏的時間，解除隱藏後為 NULL |
| `diary_entry.song_title`、`song_url` | 這篇日記的歌；兩欄同時有值或同時為 NULL，連結只接受 https |
| `blog.tagline`、`cover_pattern`、`title_font` | 簽名、封面圖案、標題字體 |
| `blog.song_title`、`song_url` | 空間的代表歌曲 |
| `user_account.avatar_url` | 大頭貼的儲存位置 |
| `user_account.status_text`、`status_expires_at` | 現在的心情與到期時間，兩欄同時有值或同時為 NULL |
| `comment.parent_id` | 回覆的上層留言；以複合外鍵 `(parent_id, entry_id)` 保證回覆與上層留言屬於同一篇日記 |

另外有三項行為超出計畫書：一般使用者可以新增標籤（名稱標準化後唯一，營運者仍可更名或停用）；營運者可以永久刪除公開內容（設為 `deleted`，資料列保留）；營運者可以在介面上授予或撤銷 Operator 身分，系統至少保留一位營運者。

**可見性**：他人可讀的日記必須同時符合帳號、空間、日記皆為 `active` 且日記為 `public`。規則集中在 [`backend/src/access.js`](backend/src/access.js)。

**交易與併行**

- 註冊時，帳號、身分與空間在同一筆交易建立
- 新增分類先鎖定空間資料列再配號
- 編輯日記以 `entry_id` 與 `version` 為條件更新，版本不符時回傳 409
- 留言、收藏、追蹤在交易內依「帳號 → 空間 → 日記」的順序鎖定並重查權限
- 刪除採狀態更新，所有外鍵為 `ON DELETE RESTRICT`

**Row Level Security**：14 張表都啟用 RLS 且沒有 policy，Supabase 自動產生的 Data API 讀不到資料，只有後端的資料庫連線可以存取。

**MongoDB**：集合 `events`，欄位為時間、匿名工作階段、事件種類、目標代號與搜尋字。

## 專案結構

```
├── api/index.js              Vercel Function 進入點
├── vercel.json               Vercel 建置設定
├── docker-compose.yml        本機的 PostgreSQL 與 MongoDB
├── db/                       schema、索引、代表性查詢
├── backend/
│   ├── src/
│   │   ├── app.js            Express 設定
│   │   ├── access.js         可見性規則與鎖定順序
│   │   ├── auth.js           登入與身分檢查
│   │   ├── storage.js        照片儲存
│   │   ├── mongo.js          事件寫入與彙總
│   │   └── routes/           auth、blogs、entries、social、operator
│   ├── scripts/              建表與示範資料
│   └── test/
└── frontend/
    └── src/
        ├── styles.css        設計系統
        ├── components/       導覽列、圖示、圖案、共用元件
        └── pages/            各頁面
```

## API

路徑以 `/api` 開頭，登入狀態存在 httpOnly cookie。

| 方法 | 路徑 | 說明 |
|---|---|---|
| POST | `/auth/register`、`/auth/login`、`/auth/logout` | 註冊、登入、登出 |
| GET、PUT | `/auth/me`、`/auth/password` | 目前使用者、修改密碼 |
| GET | `/entries?q=&author=&tag=` | 公開搜尋 |
| GET、POST、PUT、DELETE | `/entries/:id` | 日記 |
| GET、PUT、DELETE | `/entries/:id/photo` | 照片 |
| GET、POST | `/entries/:id/comments` | 日記留言 |
| POST、DELETE | `/entries/:id/favorite` | 收藏 |
| GET | `/blogs`、`/blogs/:id`、`/blogs/:id/entries` | 公開空間 |
| GET、POST | `/blogs/:id/guestbook` | 留言板 |
| POST、DELETE | `/blogs/:id/follow` | 追蹤 |
| GET | `/me/entries`、`/me/review/monthly` | 個人回顧 |
| GET | `/me/feed`、`/me/following`、`/me/favorites` | 追蹤動態、追蹤清單、收藏 |
| GET、PUT | `/me/space`、`/me/categories` | 空間、個人風格與分類設定 |
| GET、POST | `/tags` | 可選的標籤、自訂標籤 |
| GET | `/song-info?url=` | 由 YouTube 或 Spotify 連結查歌名 |
| GET、PUT、DELETE | `/entries/:id/reactions`、`/entries/:id/reaction` | 表情回應 |
| GET、POST | `/me/notifications`、`/me/notifications/unread-count`、`/me/notifications/read` | 通知 |
| GET、PUT、DELETE | `/avatars/:userId`、`/me/avatar`、`/me/status` | 大頭貼與現在的心情 |
| GET | `/operator/dashboard`、`/operator/stats`、`/operator/analytics` | Dashboard 與搜尋分析 |
| GET、PUT、DELETE | `/operator/entries`、`/operator/comments`、`/operator/guestbook` | 公開內容的隱藏、恢復與永久刪除 |
| GET、PUT | `/operator/blogs`、`/operator/users/:id`、`/operator/users/:id/status`、`/operator/users/:id/roles` | 空間與帳號管理、營運者身分 |
| GET、POST、PUT | `/operator/themes`、`/operator/tags` | 主題與標籤 |

## 組員

梁德銘、陳廷祐、陳羿廷、劉起佑
