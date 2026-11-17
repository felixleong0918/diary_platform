// 用法：node scripts/db.js init     建立 14 張資料表與索引
//       node scripts/db.js migrate  把既有資料庫升級到目前的結構（保留資料）
//       node scripts/db.js reset  移除本專案的資料表後重新建立（會刪除所有資料）
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/db.js';

const dbDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../db');
const mode = process.argv[2];

if (!['init', 'reset', 'migrate'].includes(mode)) {
  console.error('用法：node scripts/db.js <init|reset|migrate>');
  process.exit(1);
}

try {
  if (mode === 'reset') {
    // 只移除本專案的物件，不動 public schema 本身（Supabase 在上面設有預設權限）
    await pool.query(`
      DROP TABLE IF EXISTS notification, diary_reaction, diary_tag, blog_follow, diary_favorite, guestbook_entry, comment, tag,
        diary_entry, category, blog, theme, user_role, user_account CASCADE;
      DROP FUNCTION IF EXISTS make_id(char, regclass);
      DROP SEQUENCE IF EXISTS user_account_seq, theme_seq, blog_seq, diary_entry_seq, tag_seq,
        comment_seq, guestbook_seq, notification_seq;
    `);
    console.log('已移除本專案的資料表、序列與函式');
  }
  for (const file of mode === 'migrate' ? ['migrate.sql'] : ['schema.sql', 'indexes.sql']) {
    await pool.query(await fs.readFile(path.join(dbDir, file), 'utf8'));
    console.log(`已執行 db/${file}`);
  }
} catch (err) {
  console.error(`失敗：${err.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
