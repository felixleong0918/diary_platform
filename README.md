# 日記與個人部落格平台

資料庫管理 115 學年度第 1 學期期末專案（第 16 組）。

結合日記與個人部落格的生活紀錄平台：使用者在自己的空間寫日記，以分類、標籤與心情分數整理內容，並決定每篇要公開分享或只留給自己。其他人可以透過公開日記留言、空間留言板、追蹤與收藏互動；平台營運者維護主題、標籤與公開內容秩序。

| 層 | 技術 |
|---|---|
| 前端 | React 18 + Vite，手寫 CSS（參照 Notion 與 Medium 的版面語彙，深淺色） |
| 後端 | Node.js 20+ / Express，直接撰寫 SQL（`pg`，不經 ORM） |
| 關聯式資料庫 | PostgreSQL 16，12 張資料表 |
| NoSQL | MongoDB 7，只儲存公開搜尋與頁面瀏覽事件 |
| 照片 | 後端本機資料夾 `backend/uploads/`，資料庫只存位置 |

## 快速開始

需要 Node.js 20 以上。資料庫可以用 Docker 或本機安裝，擇一即可。

### 1. 啟動資料庫

**方式 A：Docker Compose**

```bash
docker compose up -d
```

會啟動 PostgreSQL（帳號、密碼、資料庫皆為 `diary`，埠 5432）與 MongoDB（埠 27017）。本機已有服務佔用這兩個埠時，在根目錄建立 `.env` 寫入 `PG_PORT=5433`、`MONGO_PORT=27018`，並同步修改 `backend/.env` 的連線字串。

**方式 B：本機安裝的 PostgreSQL / MongoDB**

```bash
createdb diary            # 或在 pgAdmin 建立名為 diary 的資料庫
```

把 `backend/.env` 的 `DATABASE_URL` 改成自己的帳號密碼，例如 `postgres://postgres:你的密碼@localhost:5432/diary`。沒有 MongoDB 時把 `MONGO_URL` 留空，除了營運介面的「搜尋分析」之外，其餘功能都照常運作。

索引使用 `pg_trgm` 擴充套件（官方 Docker 映像與 Homebrew、EDB 安裝版皆已內含），建立擴充套件需要資料庫擁有者或 superuser 權限。

### 2. 安裝、建表、產生假資料

```bash
npm run setup                       # 安裝 backend 與 frontend 的套件
cp backend/.env.example backend/.env
npm run db:init                     # 執行 db/schema.sql 與 db/indexes.sql
npm run db:seed                     # 小量示範資料
```

### 3. 啟動

開發模式（兩個終端機）：

```bash
npm run dev:api     # 後端 http://localhost:3000
npm run dev:web     # 前端 http://localhost:5173（/api 會轉給後端）
```

或建置後由後端一併提供前端，只開一個網址：

```bash
npm run build && npm start          # http://localhost:3000
```

### 示範帳號

假資料中所有帳號的密碼都是 `password123`。

| 帳號 | 身分 |
|---|---|
| `operator` | 平台營運者（同時具有 User 與 Operator） |
| `demo` | 一般使用者，已有數十篇日記 |
| `user0003` … | 其他一般使用者 |

自行註冊的帳號只有 User 身分。要讓某個帳號成為營運者：

```sql
INSERT INTO user_role (user_id, role)
SELECT user_id, 'Operator' FROM user_account WHERE username = '帳號';
```

## 假資料規模

```bash
npm run db:reset                    # 清空並重建資料表（會刪除所有資料）
npm run db:seed                     # 示範規模：40 帳號、600 日記
npm run db:seed -- --scale=full     # 計畫書 2.7 的建置目標
npm run db:seed -- --users=500      # 只給帳號數，其餘依計畫書比例推算
npm run db:seed -- --users=500 --entries=8000 --comments=20000
```

| | 帳號與空間 | 日記 | 日記留言 | 收藏 | 追蹤 | 標籤配對 |
|---|---|---|---|---|---|---|
| 預設 | 40 | 600 | 1,200 | 800 | 200 | 1,200 |
| `--scale=full` | 2,000 | 30,000 | 60,000 | 40,000 | 10,000 | 60,000 |

可用參數：`--users`、`--entries`、`--comments`、`--favorites`、`--follows`、`--tag-pairs`、`--guestbook`、`--events`（MongoDB 事件數）、`--seed`（亂數種子，預設 16，同一種子產生相同資料）。

所有文字為團隊撰寫的示範句子，不含真實私人日記。留言與收藏只引用產生當時他人可讀的日記。

## 功能對照（計畫書 1.2）

**訪客與一般使用者**

1. 瀏覽與搜尋：依標題關鍵字、作者或標籤搜尋公開日記；在同一空間依分類與日期篩選。
2. 管理個人空間：修改暱稱、空間名稱、簡介與主題；新增、更名或停用分類；註冊、登入、修改密碼。
3. 新增與編輯日記：日期、標題、內文、必填的 1 至 5 分心情分數、零或一個分類、零或多個標籤、一張照片；可見度預設 private。
4. 回顧個人紀錄：依月份、分類或標籤查詢，顯示篇數與平均心情分數。
5. 留言與留言板：在有權閱讀的有效日記留言；空間留言板公開呈現並在送出前提示；可編輯或移除自己的訊息，空間主人可移除其空間中的訊息。
6. 追蹤與收藏：追蹤公開空間並查看其近期公開日記；收藏目前可讀的日記。

**平台營運者**

1. 維護主題與標籤：新增、更名或停用。
2. 管理公開內容：隱藏／解除隱藏公開日記、日記留言、留言板訊息與空間；停權／解除停權帳號。
3. 查看營運統計：新增公開日記、熱門標籤、公開日記互動量、每週活躍作者；另有 MongoDB 的搜尋後閱讀轉換率。

**可見性規則（計畫書 1.3）** 集中在 `backend/src/access.js`：他人可讀的日記必須同時符合作者帳號、空間、日記皆為 active 且日記為 public；作者可讀自己尚未刪除的內容；無權閱讀與不存在一律回傳「內容目前無法瀏覽」，不洩漏標題、摘要或照片。心情分數只回傳給作者本人。

## 資料庫

- `db/schema.sql`：12 張資料表、序列、CHECK 與外鍵（全部 `ON DELETE RESTRICT ON UPDATE RESTRICT`）
- `db/indexes.sql`：次要索引，與 schema 分開以便比較加索引前後的執行計畫
- `db/queries.sql`：五項使用者功能與五項分析功能的代表性 SQL
- `db/mongo_queries.js`：MongoDB 事件的代表性彙總指令

### 與計畫書 schema 的差異

依計畫書 1.2.1 第 6 點的批註，`DIARY_ENTRY` 新增兩個時間欄位，其餘欄位與計畫書的資料字典相同：

| 欄位 | 型態 | 說明 |
|---|---|---|
| `published_at` | `timestamptz NULL` | 最近一次改為 public 的時間。新增時就公開、或由 private 改為 public 時寫入；改回 private 時保留原值。追蹤動態與「近期公開日記」依此排序。限制：`visibility = 'public'` 時不可為空 |
| `hidden_at` | `timestamptz NULL` | 營運者設為 hidden 的時間，解除隱藏時清回 NULL。限制：`status = 'hidden'` 時不可為空 |

代號格式為一位前綴加八位流水號：`U` 帳號、`B` 空間、`H` 主題、`E` 日記、`T` 標籤、`C` 日記留言、`G` 留言板訊息。

### 交易與併行

- 註冊：帳號、User 身分與空間在同一交易建立。
- 分類編號：先 `SELECT … FOR UPDATE` 鎖定空間資料列，再取最大值加一。
- 日記與標籤：同一交易儲存；新選的分類與標籤以 `FOR SHARE` 鎖定後檢查 active。
- 編輯日記：`UPDATE … WHERE entry_id = $1 AND version = $2`，版本不符回傳 409，前端提示重新載入。
- 互動寫入（留言、收藏、追蹤）：交易內依「帳號 → 空間 → 日記」的固定順序鎖定並重查目標是否仍可讀。

展示方式：用兩個瀏覽器（或一般視窗加無痕視窗）連到同一個後端，同時開啟同一篇日記的編輯頁，先後儲存即可看到版本衝突；一邊把公開日記改為私密，另一邊重新整理即可看到「內容目前無法瀏覽」。

### MongoDB

集合 `diary_events.events`，文件只有時間、匿名工作階段代號（cookie `sid`）、事件種類、目標代號與搜尋字：

```js
{ ts: ISODate, session: "uuid", type: "search" | "view", target: "E00000012", target_type: "entry", keyword: "散步" }
```

只在公開搜尋與瀏覽他人可讀的公開日記、公開空間時寫入，不含私密內文、心情分數或密碼。轉換率的定義是「搜尋後 30 分鐘內至少瀏覽一篇日記的工作階段比例」，pipeline 在 `backend/src/mongo.js`。

## 測試

```bash
createdb diary_test
TEST_DATABASE_URL=postgres://diary:diary@localhost:5432/diary_test npm test
```

測試會清空 `TEST_DATABASE_URL` 指向的資料庫，請勿指向有資料的資料庫。內容包含 17 項端對端 API 測試（可見性、權限、版本衝突、停用引用、營運隱藏、停權、狀態式刪除）與 2 項 MongoDB pipeline 邏輯測試（以 `mingo` 在記憶體中執行，不需要啟動 MongoDB）。

## 專案結構

```
diary-blog-platform/
├── docker-compose.yml        PostgreSQL + MongoDB
├── db/                       schema、索引、代表性查詢
├── backend/
│   ├── src/
│   │   ├── index.js          啟動點
│   │   ├── app.js            Express 設定與路由掛載
│   │   ├── access.js         可見性規則與鎖定順序
│   │   ├── auth.js           登入 cookie、身分檢查
│   │   ├── mongo.js          事件寫入與彙總 pipeline
│   │   └── routes/           auth、blogs、entries、social、operator
│   ├── scripts/              db.js（建表／重置）、seed.js（假資料）
│   ├── test/
│   └── uploads/              照片（不進版本控制）
└── frontend/
    └── src/
        ├── styles.css        設計系統與所有樣式
        ├── components/       導覽列、圖示、幾何圖案、共用元件
        └── pages/            探索、空間、日記、編輯、我的日記、設定、追蹤、收藏、營運
```

## API 一覽

所有路徑以 `/api` 開頭，登入狀態存在 httpOnly cookie。

| 方法 | 路徑 | 說明 |
|---|---|---|
| POST | `/auth/register` `/auth/login` `/auth/logout` | 註冊、登入、登出 |
| GET / PUT | `/auth/me` · `/auth/password` | 目前使用者 · 修改密碼 |
| GET | `/entries?q=&author=&tag=` | 公開搜尋 |
| GET / POST / PUT / DELETE | `/entries/:id` | 讀取、新增、編輯（需帶 `version`）、移除 |
| GET / PUT / DELETE | `/entries/:id/photo` | 照片（讀取時做日記權限檢查） |
| GET / POST | `/entries/:id/comments` | 日記留言 |
| PUT / DELETE | `/comments/:id` | 編輯、移除留言 |
| POST / DELETE | `/entries/:id/favorite` | 收藏、取消收藏 |
| GET | `/blogs` · `/blogs/:id` · `/blogs/:id/entries` | 公開空間與其日記（分類、日期篩選） |
| GET / POST | `/blogs/:id/guestbook` | 留言板 |
| PUT / DELETE | `/guestbook/:id` | 編輯、移除留言板訊息 |
| POST / DELETE | `/blogs/:id/follow` | 追蹤、取消追蹤 |
| GET | `/me/entries` · `/me/review/monthly` | 個人回顧 |
| GET | `/me/feed` · `/me/following` · `/me/favorites` | 追蹤動態、追蹤清單、收藏清單 |
| GET / PUT | `/me/space` | 個人空間設定 |
| POST / PUT | `/me/categories` · `/me/categories/:no` | 分類 |
| GET | `/themes` · `/tags` · `/tags/popular` | 選單資料 |
| * | `/operator/…` | 主題、標籤、內容管理、統計、搜尋分析（需 Operator） |

## 前端設計

版面語彙參照 Notion 與 Medium：

- 白底、近黑文字 `#191919`、次要文字 `#6B6B6B`、細分隔線 `#E6E6E6`；深色外觀為 `#191919` 底
- 大標題、文章標題與內文用襯線字（Charter／宋體），介面文字用系統無襯線字，全部是系統字體，不載入外部字型
- 主要按鈕是黑色膠囊，次要按鈕是細邊框；卡片是 12px 圓角加 1px 邊框，沒有陰影
- 日記列表是 Medium 式的文章列：作者、標題、摘要、互動數與標籤，有照片時縮圖在右側；右欄放熱門標籤與公開空間
- 單篇日記是置中的閱讀版面，內文 20px、行高 1.8
- 色彩只來自七組粉彩色塊與自行繪製的幾何圖案（`frontend/src/components/Art.jsx`：首頁主視覺、登入與註冊頁、空狀態、空間頁首），沒有使用任何外部圖片
- 空間主題（`THEME.style_key`）決定該空間頁首的粉彩底色與圖樣顏色：`aurora` 青、`dawn` 黃、`ocean` 藍、`meadow` 綠、`dusk` 紫、`graphite` 灰
- 尊重系統的「減少動態效果」設定；760px 以下導覽改為底部分頁列

## 上傳到 GitHub

這個資料夾尚未初始化 Git。`.gitignore` 已排除 `node_modules/`、`.env`、`frontend/dist/` 與上傳的照片。

```bash
cd diary-blog-platform
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<帳號>/<repo>.git
git push -u origin main
```

## 尚未涵蓋

- 計畫書 2.7 列為期末交付的索引效能比較數據、資料庫備份檔、展示影片與分工心得不在這個 repo 內；`db/queries.sql` 與 `db/indexes.sql` 可作為效能比較的起點。
- 資料字典中的空間狀態 `closed` 與帳號狀態 `deactivated` 在 schema 與權限判斷中都已支援，但計畫書沒有規定由誰、在什麼情況下觸發，所以介面沒有提供對應操作。
- 後端以 HTTP 提供服務；以 HTTPS 部署時請放在反向代理之後，並設定 `COOKIE_SECURE=true`。

## 組員

梁德銘、陳廷祐、陳羿廷、劉起佑
