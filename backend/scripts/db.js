// 用法：node scripts/db.js init   建立 12 張資料表與索引
//       node scripts/db.js reset  清空 public schema 後重新建立（會刪除所有資料）
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/db.js';

const dbDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../db');
const mode = process.argv[2];

if (!['init', 'reset'].includes(mode)) {
  console.error('用法：node scripts/db.js <init|reset>');
  process.exit(1);
}

try {
  if (mode === 'reset') {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    console.log('已清空 public schema');
  }
  for (const file of ['schema.sql', 'indexes.sql']) {
    await pool.query(await fs.readFile(path.join(dbDir, file), 'utf8'));
    console.log(`已執行 db/${file}`);
  }
} catch (err) {
  console.error(`失敗：${err.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
