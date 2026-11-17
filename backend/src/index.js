import { createApp } from './app.js';
import { config } from './config.js';
import { pool } from './db.js';
import { connectMongo } from './mongo.js';
import { prepare as prepareStorage } from './storage.js';

await pool.query('SELECT 1').catch((err) => {
  console.error(`[postgres] 無法連線：${err.message}\n請確認 DATABASE_URL 與資料庫是否已啟動。`);
  process.exit(1);
});
await connectMongo();
await prepareStorage();

createApp().listen(config.port, () => {
  console.log(`[api] http://localhost:${config.port}`);
});
