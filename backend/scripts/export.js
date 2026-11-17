// 把每張資料表匯出成一個 CSV 檔（UTF-8，含欄位名稱）。
//   npm run db:export                 輸出到 exports/
//   npm run db:export -- --out=路徑   指定資料夾
// 不匯出 user_account.password_hash。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/db.js';

const TABLES = [
  ['user_account', 'user_id'], ['user_role', 'user_id, role'], ['theme', 'theme_id'], ['blog', 'blog_id'],
  ['category', 'blog_id, category_no'], ['diary_entry', 'entry_id'], ['tag', 'tag_id'],
  ['diary_tag', 'entry_id, tag_id'], ['comment', 'comment_id'], ['guestbook_entry', 'guestbook_id'],
  ['diary_favorite', 'user_id, entry_id'], ['blog_follow', 'follower_id, blog_id'],
  ['diary_reaction', 'user_id, entry_id'], ['notification', 'notification_id'],
];
const SKIP = { user_account: ['password_hash'] };

const arg = process.argv.find((a) => a.startsWith('--out='));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = arg ? path.resolve(arg.slice(6)) : path.join(root, 'exports');

const cell = (v) => {
  if (v === null || v === undefined) return '';
  const s = v instanceof Date ? v.toISOString() : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

try {
  fs.mkdirSync(outDir, { recursive: true });
  for (const [table, order] of TABLES) {
    const cols = await pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = $1 ORDER BY ordinal_position`,
      [table],
    );
    const names = cols.rows.map((r) => r.column_name).filter((c) => !(SKIP[table] || []).includes(c));
    if (names.length === 0) { console.log(`  ${table.padEnd(16)} 資料表不存在，略過`); continue; }
    const { rows } = await pool.query(`SELECT ${names.join(', ')} FROM ${table} ORDER BY ${order}`);
    // 開頭的 BOM 讓 Excel 以 UTF-8 開啟，中文才不會變成亂碼
    const lines = [names.join(','), ...rows.map((r) => names.map((n) => cell(r[n])).join(','))];
    fs.writeFileSync(path.join(outDir, `${table}.csv`), `﻿${lines.join('\r\n')}\r\n`);
    console.log(`  ${table.padEnd(16)} ${rows.length.toLocaleString()} 筆`);
  }
  console.log(`\n已輸出到 ${outDir}`);
} catch (err) {
  console.error(`失敗：${err.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
