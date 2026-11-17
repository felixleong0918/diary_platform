// MongoDB 彙總管線的邏輯測試：以 mingo 在記憶體中執行同一份 pipeline，不需要啟動 MongoDB。
import test from 'node:test';
import assert from 'node:assert/strict';
import { Aggregator } from 'mingo';
import 'mingo/init/system';
import { conversionPipeline, topKeywordsPipeline } from '../src/mongo.js';

const t0 = Date.UTC(2026, 10, 1, 4, 0, 0);
const at = (min) => new Date(t0 + min * 60000);
const events = [
  // A：搜尋後 5 分鐘內閱讀 → 轉換
  { ts: at(0), session: 'A', type: 'search', target_type: 'title', keyword: '散步' },
  { ts: at(5), session: 'A', type: 'view', target: 'E00000001', target_type: 'entry' },
  // B：搜尋兩次，只有第二次之後有閱讀
  { ts: at(0), session: 'B', type: 'search', target_type: 'title', keyword: '咖啡' },
  { ts: at(90), session: 'B', type: 'search', target_type: 'title', keyword: '散步' },
  { ts: at(100), session: 'B', type: 'view', target: 'E00000002', target_type: 'entry' },
  // C：搜尋後超過 30 分鐘才閱讀 → 不算
  { ts: at(0), session: 'C', type: 'search', target_type: 'title', keyword: '散步' },
  { ts: at(45), session: 'C', type: 'view', target: 'E00000003', target_type: 'entry' },
  // D：只有閱讀、E：閱讀在搜尋之前、F：只看了空間頁
  { ts: at(3), session: 'D', type: 'view', target: 'E00000001', target_type: 'entry' },
  { ts: at(1), session: 'E', type: 'view', target: 'E00000001', target_type: 'entry' },
  { ts: at(2), session: 'E', type: 'search', target_type: 'title', keyword: '週末' },
  { ts: at(0), session: 'F', type: 'search', target_type: 'title', keyword: '週末' },
  { ts: at(2), session: 'F', type: 'view', target: 'B00000001', target_type: 'blog' },
];

test('搜尋後閱讀的轉換率', () => {
  const [r] = new Aggregator(conversionPipeline(at(-1), 30)).run(events);
  assert.deepEqual(
    { s: r.sessions_with_search, cs: r.converted_sessions, q: r.searches, cq: r.converted_searches },
    { s: 5, cs: 2, q: 6, cq: 2 },
  );
});

test('熱門搜尋字', () => {
  const rows = new Aggregator(topKeywordsPipeline(at(-1), 3)).run(events);
  assert.deepEqual(rows[0], { keyword: '散步', count: 3, sessions: 3 });
});
