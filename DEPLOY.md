# 部署到 Vercel + Supabase

線上架構：

| 部分 | 放在哪裡 |
|---|---|
| 前端（React 靜態檔） | Vercel，同一個專案 |
| 後端（Express API） | Vercel Function，路徑 `/api/*`（進入點 `api/index.js`） |
| PostgreSQL | Supabase |
| 日記照片 | Supabase Storage 的私有 bucket |
| 搜尋與瀏覽事件 | MongoDB Atlas |

前端與後端在同一個網址底下，登入 cookie 不需要跨網域設定。

## 1. Supabase：資料庫

1. 在 [supabase.com](https://supabase.com) 建立專案，記下資料庫密碼。
2. 專案頁面上方按 **Connect**，會看到幾種連線字串。需要兩種：
   - **Session pooler**（埠 5432）：從自己的電腦建表與匯入資料時用。
   - **Transaction pooler**（埠 6543）：給 Vercel 用。
   
   兩者的使用者名稱都是 `postgres.<project-ref>`，主機名稱請直接從 Connect 視窗複製。密碼含有 `&`、`#`、`?` 等符號時要先做百分比編碼。
3. 在自己的電腦建表並匯入資料（把字串換成 Session pooler 那一條）：

   ```bash
   cd diary-blog-platform
   npm run setup
   export DATABASE_URL='postgresql://postgres.<project-ref>:<密碼>@<pooler-host>:5432/postgres'
   export DATABASE_SSL=true
   export MONGO_URL=''          # 這一步先不寫 MongoDB
   npm run db:init
   npm run db:seed              # 或 npm run db:seed -- --scale=full
   ```

`db/schema.sql` 已經替 14 張表啟用 Row Level Security 而且不建立任何 policy。Supabase 會替 `public` schema 的表自動產生對外的 Data API，這樣設定後匿名金鑰讀不到任何資料列，只有後端的資料庫連線可以存取。

## 2. Supabase：照片 bucket

1. **Storage → New bucket**，名稱 `diary-photos`，**不要**勾選 Public。
2. **Project Settings → API Keys** 複製兩個值：
   - Project URL（`https://<project-ref>.supabase.co`）
   - secret 金鑰（舊介面叫 `service_role`）。這把金鑰能繞過所有權限，只能放在 Vercel 的環境變數，不可寫進程式或提交到 Git。

## 3. MongoDB Atlas

1. 在 [MongoDB Atlas](https://www.mongodb.com/atlas) 建立免費叢集與一個資料庫使用者。
2. **Network Access** 加入 `0.0.0.0/0`：Vercel 函式的對外 IP 不固定，只能靠帳號密碼保護，密碼請用隨機長字串。
3. 複製連線字串（`mongodb+srv://...`）。

想先匯入示範事件，可以在自己的電腦把 `MONGO_URL` 設成這條字串後重跑一次 `npm run db:reset && npm run db:seed`。

## 4. 推上 GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<帳號>/<repo>.git
git push -u origin main
```

## 5. Vercel

1. [vercel.com/new](https://vercel.com/new) 匯入剛才的 repo。Root Directory 維持 repo 根目錄，Framework Preset 選 **Other**；安裝、建置指令與輸出目錄都已寫在 `vercel.json`，不用另外填。
2. 在 **Environment Variables** 加入：

   | 名稱 | 值 |
   |---|---|
   | `DATABASE_URL` | Supabase 的 **Transaction pooler** 連線字串（埠 6543） |
   | `DATABASE_SSL` | `true` |
   | `JWT_SECRET` | 隨機長字串，例如 `openssl rand -hex 32` 的輸出 |
   | `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
   | `SUPABASE_SERVICE_KEY` | Supabase 的 secret／service_role 金鑰 |
   | `SUPABASE_BUCKET` | `diary-photos` |
   | `MONGO_URL` | Atlas 的連線字串 |
   | `MONGO_DB` | `diary_events` |

3. 按 **Deploy**。之後每次 `git push` 都會自動重新部署。
4. 建議在 **Settings → Functions** 把函式區域選在離 Supabase 專案最近的區域，每個請求會少掉跨區的延遲。

## 6. 部署後檢查

1. 開 `https://<你的網址>/api/health`，應該回傳 `{"ok":true}`。
2. 首頁看得到公開日記；用 `demo` 登入、寫一篇附照片的日記，重新整理後照片還在。
3. 用 `operator` 登入，營運頁的「搜尋分析」不再顯示「尚未連線 MongoDB」。

出問題時先看 Vercel 專案的 **Logs**。常見原因：

| 現象 | 原因 |
|---|---|
| `/api/*` 回 500，log 出現 `self-signed certificate` | 沒有設 `DATABASE_SSL=true` |
| log 出現 `Tenant or user not found` | 使用者名稱沒有 `.<project-ref>` 後綴，或 pooler 主機抄錯 |
| log 出現 `ENETUNREACH`、連線逾時 | 用了 Direct connection（只有 IPv6），請改用 pooler |
| 上傳照片失敗 | bucket 名稱不符，或 `SUPABASE_SERVICE_KEY` 填成 anon／publishable 金鑰 |
| 「搜尋分析」仍顯示尚未連線 | Atlas 的 Network Access 沒有開放，或 `MONGO_URL` 密碼有特殊字元沒有編碼 |

## 上線前要注意

- **示範帳號的密碼是公開的。** 假資料的所有帳號密碼都是 `password123`，其中 `operator` 有營運權限。網址要給別人之前，請先登入修改 `operator` 與 `demo` 的密碼，或只匯入小量資料後自行註冊帳號並用 SQL 授予 Operator 身分（見 README）。
- 照片單張上限是 4 MB（Vercel 函式的請求內容上限為 4.5 MB）。
- 想驗證資料庫伺服器的憑證而不只是加密：到 Supabase 的 Database 設定下載根憑證，把 PEM 內容貼到環境變數 `DATABASE_CA_CERT`，並移除 `DATABASE_SSL`。
- `npm run db:reset` 會刪除線上資料庫的所有資料，執行前確認 `DATABASE_URL` 指向哪裡。

## 本機開發不受影響

沒有設定 `SUPABASE_URL` 與 `SUPABASE_SERVICE_KEY` 時，照片照舊存在 `backend/uploads/`；沒有 `DATABASE_SSL` 時用一般連線。README 的本機啟動步驟不用改。
