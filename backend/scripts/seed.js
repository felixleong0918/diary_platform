// 產生假資料。預設為小量示範資料；加上 --scale=full 產生計畫書 2.7 的建置目標。
//
//   npm run db:seed                       示範規模
//   npm run db:seed -- --scale=full       2,000 帳號、30,000 日記、60,000 留言、
//                                         40,000 收藏、10,000 追蹤、60,000 標籤配對
//   npm run db:seed -- --users=500 --entries=8000   個別指定（未指定者依比例推算）
//
// 所有文字皆為團隊自行撰寫的示範內容，不含真實私人日記。
// 留言與收藏只引用產生當時「他人可讀」的日記。
import bcrypt from 'bcryptjs';
import { pool } from '../src/db.js';
import { config } from '../src/config.js';
import { MongoClient } from 'mongodb';

const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
    const [k, v = 'true'] = a.slice(2).split('=');
    return [k, v];
  }),
);

const PRESETS = {
  demo: { users: 40, entries: 600, comments: 1200, favorites: 800, follows: 200, tagPairs: 1200, guestbook: 120, events: 600, reactions: 1000 },
  full: { users: 2000, entries: 30000, comments: 60000, favorites: 40000, follows: 10000, tagPairs: 60000, guestbook: 6000, events: 20000, reactions: 50000 },
};
const scale = args.scale || 'demo';
if (!PRESETS[scale]) {
  console.error(`未知的規模「${scale}」，可用：demo、full`);
  process.exit(1);
}
const N = { ...PRESETS[scale] };
if (args.users) {
  // 只指定帳號數時，其餘依計畫書目標的比例推算
  const ratio = Number(args.users) / PRESETS.full.users;
  for (const k of Object.keys(N)) N[k] = Math.max(1, Math.round(PRESETS.full[k] * ratio));
}
for (const [flag, key] of [['users', 'users'], ['entries', 'entries'], ['comments', 'comments'],
  ['favorites', 'favorites'], ['follows', 'follows'], ['tag-pairs', 'tagPairs'],
  ['guestbook', 'guestbook'], ['events', 'events'], ['reactions', 'reactions']]) {
  if (args[flag] !== undefined) {
    const n = Number(args[flag]);
    if (!Number.isInteger(n) || n < 0) { console.error(`--${flag} 必須是非負整數`); process.exit(1); }
    N[key] = n;
  }
}
if (N.users < 3) { console.error('至少需要 3 個帳號'); process.exit(1); }

// ---- 可重現的亂數 -------------------------------------------------------
let seed = Number(args.seed || 16);
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const randInt = (min, max) => min + Math.floor(rand() * (max - min + 1));
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
// 偏向前段的選擇，讓少數作者與標籤較熱門
const skewed = (n) => Math.min(n - 1, Math.floor(n * rand() ** 2.2));
const pad = (prefix, n) => prefix + String(n).padStart(8, '0');

// ---- 示範文字 -----------------------------------------------------------
const THEMES = [
  ['極光', 'aurora'], ['晨曦', 'dawn'], ['海洋', 'ocean'],
  ['草原', 'meadow'], ['暮色', 'dusk'], ['石墨', 'graphite'],
];
const TAGS = ['旅行', '美食', '讀書', '電影', '音樂', '運動', '咖啡', '散步', '攝影', '學習',
  '工作', '家人', '朋友', '寵物', '料理', '植物', '天氣', '手作', '遊戲', '程式',
  '考試', '社團', '夜晚', '週末', 'movie', 'coffee', 'running', 'study'];
const CATEGORIES = ['日常', '旅行筆記', '讀書心得', '校園', '工作', '美食', '運動紀錄', '隨筆', '練習', '計畫'];
const SURNAMES = ['陳', '林', '黃', '張', '李', '王', '吳', '劉', '蔡', '楊', '許', '鄭', '謝', '郭', '洪'];
const GIVEN = ['小安', '語彤', '柏宇', '宥廷', '品妍', '承恩', '子晴', '冠廷', '詠晴', '宇翔',
  '思妤', '家豪', '芷涵', '彥廷', '雅婷', '俊宏', '可欣', '睿恩', '佳穎', '柏翰'];
const BLOG_SUFFIX = ['的日記', '的小角落', '的生活筆記', '的慢慢寫', '的週記本', '的窗邊'];
const TITLE_A = ['下雨的', '很長的', '安靜的', '忙碌的', '放晴的', '有風的', '想睡的', '剛好的', '久違的', '平凡的'];
const TITLE_B = ['星期一', '午後', '晚餐', '散步', '圖書館', '通勤路上', '週末', '早晨', '期中週', '小旅行', '球場', '咖啡店'];
const SENTENCES = [
  '今天比平常早起半小時，窗外的光還是淡淡的。',
  '中午和同學在學校附近吃了一碗很普通但很好吃的麵。',
  '下午的課有點難，筆記寫了三頁還是沒有完全懂。',
  '回家的路上繞去河邊走了一圈，風很舒服。',
  '晚上把拖了很久的作業寫完，心裡輕鬆了一點。',
  '試著煮了新的菜，鹽放太多，下次要記得先試味道。',
  '讀完一章書，裡面有一句話想記下來慢慢想。',
  '和朋友聊了很久，才發現大家都有各自在煩惱的事。',
  '今天沒有做什麼特別的事，但也沒有什麼不好。',
  '跑了三公里，比上週多了一點，腿有點痠。',
  '圖書館的座位難得很空，安靜地待了一整個下午。',
  '傍晚的雲很漂亮，站在路邊看了五分鐘才走。',
  '把房間整理了一遍，找到一張很久以前的車票。',
  '報告的進度比預期慢，明天要早點開始。',
  '買了一杯沒喝過的咖啡，意外地很喜歡。',
  '下雨天哪裡都沒去，在家聽了一整張專輯。',
  '練習了很久的東西今天終於順了一次。',
  '想把這陣子的事情慢慢記下來，免得以後忘記。',
];
const COMMENTS = ['讀完覺得很有共鳴。', '謝謝分享，今天也辛苦了。', '這段寫得很好，我也有類似的經驗。',
  '看完想去散步了。', '加油，慢慢來就好。', '那家店我也想去看看。', '照你說的試了一次，真的不錯。',
  '期待下一篇。', '原來大家都一樣，安心了一點。', '這個標題取得很好。'];
const GUESTBOOK = ['路過留個言，很喜歡這裡的文字。', '追蹤了，期待更多紀錄。', '版面很舒服，會常來看看。',
  '同校的來打聲招呼。', '謝謝你把這些日常寫下來。', '偶然看到這個空間，讀了好幾篇。'];
const TAGLINES = ['慢慢來，比較快。', '把今天過好。', '記得抬頭看天空。', '喜歡下雨天的人。', '還在路上。',
  '多喝水，早點睡。', '日子是一頁一頁寫出來的。', '今天也辛苦了。'];
const COVERS = ['shapes', 'waves', 'grid', 'dots'];
const FONTS = ['serif', 'serif', 'sans', 'mono'];
const REPLIES = ['真的，我也這麼覺得。', '謝謝你的留言！', '下次一起去。', '哈哈被你發現了。', '同意，尤其是最後那段。', '我也想試試看。'];
const REACTION_KINDS = ['like', 'like', 'like', 'like', 'hug', 'hug', 'cheer', 'cheer', 'haha', 'sad'];
const SEARCH_WORDS = ['散步', '咖啡', '圖書館', '週末', '旅行', '晚餐', '期中', '早晨', '下雨', '球場'];

// ---- 批次寫入 -----------------------------------------------------------
async function bulk(client, table, columns, types, rows, label) {
  const CHUNK = 5000;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const part = rows.slice(i, i + CHUNK);
    const arrays = columns.map((_, c) => part.map((r) => r[c]));
    const unnest = types.map((t, c) => `$${c + 1}::${t}[]`).join(', ');
    await client.query(
      `INSERT INTO ${table} (${columns.join(', ')}) SELECT * FROM unnest(${unnest})`,
      arrays,
    );
  }
  console.log(`  ${label.padEnd(12)} ${rows.length.toLocaleString()} 筆`);
}

const now = Date.now();
const DAY = 86400000;
const iso = (ms) => new Date(Math.min(ms, now)).toISOString();
const HOUR = 3600000;
// 台北時間各小時的發文比重：清晨最少，晚間最多
const HOUR_WEIGHT = [3, 2, 1, 1, 1, 1, 2, 4, 5, 4, 4, 5, 7, 6, 5, 5, 6, 7, 9, 11, 14, 16, 13, 7];
const HOUR_TOTAL = HOUR_WEIGHT.reduce((a, b) => a + b, 0);
const pickHour = () => {
  let r = rand() * HOUR_TOTAL;
  for (let h = 0; h < 24; h++) { r -= HOUR_WEIGHT[h]; if (r < 0) return h; }
  return 23;
};
// 台北時間今天 00:00（UTC+8，無日光節約時間）
const todayTpe = Math.floor((now + 8 * HOUR) / DAY) * DAY - 8 * HOUR;
// 在 from 之後、現在之前的隨機時間
const after = (from) => from + rand() * Math.max(HOUR, now - from);
// 互動多半發生在公開後幾天內：指數衰減的延遲，但不超過現在
const soonAfter = (from) => from + Math.min(-Math.log(1 - rand()) * 4 * DAY, rand() * Math.max(HOUR, now - from));

async function main() {
  const existing = await pool.query('SELECT count(*) AS n FROM user_account');
  if (existing.rows[0].n > 0) {
    console.error('資料庫已有資料。請先執行 npm run db:reset 再重新產生。');
    process.exit(1);
  }
  console.log(`產生假資料（規模：${args.users ? '自訂' : scale}）`);
  const hash = await bcrypt.hash('password123', 10);

  // 主題與標籤
  const themes = THEMES.map(([name, key], i) => [pad('H', i + 1), name, key, 'active']);
  const tags = TAGS.map((name, i) => [pad('T', i + 1), name, i === TAGS.length - 1 ? 'retired' : 'active']);

  // 帳號、身分、空間、分類
  const users = [], roles = [], blogs = [], categories = [];
  const blogCats = [];               // 各空間的分類編號
  const userState = [];              // { active, blogActive }
  const joined = [];                 // 各帳號的註冊時間
  const usernames = [];
  for (let i = 1; i <= N.users; i++) {
    const uid = pad('U', i), bid = pad('B', i);
    let username, nickname, status = 'active', blogStatus = 'active';
    if (i === 1) { username = 'operator'; nickname = '平台營運'; }
    else if (i === 2) { username = 'demo'; nickname = '示範使用者'; }
    else {
      username = `user${String(i).padStart(4, '0')}`;
      nickname = pick(SURNAMES) + pick(GIVEN);
      const r = rand();
      if (r < 0.015) status = 'suspended';
      else if (r < 0.02) status = 'deactivated';
      else if (r < 0.03) blogStatus = 'hidden';
    }
    // 註冊時間由 700 天前一路分布到最近，愈近期愈多；示範帳號固定為最早
    const created = i <= 2 ? now - 700 * DAY : now - Math.floor(700 * (1 - Math.sqrt(rand()))) * DAY - randInt(1, 23) * HOUR;
    joined.push(created);
    usernames.push(username);
    users.push([uid, username, `${username}@example.com`, hash, nickname, status, iso(created)]);
    roles.push([uid, 'User']);
    if (i === 1) roles.push([uid, 'Operator']);
    blogs.push([bid, uid, pad('H', randInt(1, THEMES.length)), nickname + pick(BLOG_SUFFIX),
      rand() < 0.8 ? pick(SENTENCES) : null, blogStatus, iso(created),
      rand() < 0.5 ? pick(TAGLINES) : null, pick(COVERS), pick(FONTS)]);
    const count = randInt(2, 5);
    const names = [...CATEGORIES].sort(() => rand() - 0.5).slice(0, count);
    names.forEach((name, k) => categories.push([bid, k + 1, name, k === count - 1 && rand() < 0.15 ? 'retired' : 'active']));
    blogCats.push(count);
    userState.push({ ok: status === 'active' && blogStatus === 'active', active: status === 'active' });
  }

  // 日記
  const entries = [];
  const readable = [];               // 他人可讀的日記：[entryIndex, publishedMs, ownerIndex]
  for (let i = 1; i <= N.entries; i++) {
    let owner = i <= 30 && N.users >= 2 ? 1 : skewed(N.users);   // 前 30 篇給 demo 帳號
    const dayAgo = Math.floor(540 * (1 - Math.sqrt(rand())));   // 發文量隨時間線性成長
    // 依台北時間的時段比重決定發文時刻；不早於作者的註冊時間
    let createdMs = todayTpe - dayAgo * DAY + pickHour() * HOUR + randInt(0, 3599) * 1000;
    if (createdMs > now) createdMs -= DAY;
    // 作者須在發文前已註冊：先改挑其他作者，仍找不到才把時間移到註冊之後
    for (let tries = 0; i > 30 && createdMs < joined[owner] && tries < 12; tries++) owner = skewed(N.users);
    if (createdMs < joined[owner]) createdMs = after(joined[owner]);
    const isPublic = rand() < 0.55;
    const r = rand();
    const status = r < 0.01 && isPublic ? 'hidden' : r < 0.03 ? 'deleted' : 'active';
    const publishedMs = isPublic ? Math.min(now, createdMs + randInt(0, 40) * 60000) : null;
    const body = Array.from({ length: randInt(2, 6) }, () => pick(SENTENCES)).join(rand() < 0.4 ? '\n\n' : '');
    entries.push([
      pad('E', i), pad('B', owner + 1),
      rand() < 0.7 ? randInt(1, blogCats[owner]) : null,
      new Date(createdMs + 8 * 3600000).toISOString().slice(0, 10),
      pick(TITLE_A) + pick(TITLE_B), body, Math.min(5, Math.max(1, Math.round(3.3 + (rand() - 0.5) * 4))),
      isPublic ? 'public' : 'private', status, iso(createdMs), iso(createdMs),
      publishedMs ? iso(publishedMs) : null,
      status === 'hidden' ? iso(createdMs + 2 * DAY) : null,
    ]);
    if (isPublic && status === 'active' && userState[owner].ok) readable.push([i, publishedMs, owner]);
  }

  const activeUsers = userState.map((s, i) => (s.active ? i : -1)).filter((i) => i >= 0);
  const okBlogs = userState.map((s, i) => (s.ok ? i : -1)).filter((i) => i >= 0);

  // 互動者盡量挑在該時間點之前已註冊的帳號
  const earlyUser = (ms) => {
    let u = pick(activeUsers);
    for (let tries = 0; joined[u] > ms && tries < 12; tries++) u = pick(activeUsers);
    return u;
  };

  // 標籤配對（每篇日記的標籤不重複）
  const tagPairs = new Set();
  const maxPairs = Math.min(N.tagPairs, N.entries * 6);
  for (let guard = 0; tagPairs.size < maxPairs && guard < maxPairs * 20; guard++) {
    tagPairs.add(`${pad('E', randInt(1, N.entries))}|${pad('T', skewed(TAGS.length) + 1)}`);
  }

  // 留言：只針對產生當時他人可讀的日記，時間在公開之後
  const comments = [];
  const threads = new Map();         // 日記 → 可被回覆的最上層留言
  for (let i = 1; readable.length && i <= N.comments; i++) {
    const [e, published] = readable[skewed(readable.length)];
    const who = earlyUser(published);
    // 約四分之一是回覆：掛在同一篇日記較早的最上層留言底下，時間在它之後
    const thread = threads.get(e);
    const parent = thread && rand() < 0.25 ? pick(thread) : null;
    const base = Math.max(published, joined[who], parent ? parent.ms : 0);
    const ms = Math.min(now, parent ? base + randInt(60, 86400) * 1000 : soonAfter(base));
    const status = rand() < 0.01 ? 'hidden' : rand() < 0.02 ? 'deleted' : 'visible';
    const text = parent && rand() < 0.5 ? `@${usernames[parent.who]} ${pick(REPLIES)}` : parent ? pick(REPLIES) : pick(COMMENTS);
    comments.push([pad('C', i), pad('E', e), pad('U', who + 1), text, status, iso(ms), iso(ms), parent ? pad('C', parent.i) : null]);
    if (!parent && status === 'visible') {
      if (!thread) threads.set(e, []);
      threads.get(e).push({ i, ms, who });
    }
  }

  // 留言板
  const guestbook = [];
  for (let i = 1; okBlogs.length && i <= N.guestbook; i++) {
    const space = okBlogs[skewed(okBlogs.length)];
    const who = pick(activeUsers);
    const at = iso(after(Math.max(now - 180 * DAY, joined[space], joined[who])));
    guestbook.push([pad('G', i), pad('B', space + 1), pad('U', who + 1),
      pick(GUESTBOOK), rand() < 0.02 ? 'hidden' : 'visible', at, at]);
  }

  // 收藏（不收藏自己的日記、同一配對不重複）
  const favorites = new Map();
  const maxFav = Math.min(N.favorites, readable.length * Math.max(1, activeUsers.length - 1));
  for (let guard = 0; favorites.size < maxFav && guard < maxFav * 20; guard++) {
    const [e, published, owner] = readable[skewed(readable.length)];
    const u = earlyUser(published);
    if (u === owner) continue;
    const key = `${pad('U', u + 1)}|${pad('E', e)}`;
    if (!favorites.has(key)) favorites.set(key, iso(soonAfter(Math.max(published, joined[u]))));
  }

  // 表情回應（每人每篇一種）
  const reactions = new Map();
  const maxReact = Math.min(N.reactions, readable.length * Math.max(1, activeUsers.length - 1));
  for (let guard = 0; reactions.size < maxReact && guard < maxReact * 20; guard++) {
    const [e, published, owner] = readable[skewed(readable.length)];
    const u = earlyUser(published);
    if (u === owner) continue;
    const key = `${pad('U', u + 1)}|${pad('E', e)}`;
    if (!reactions.has(key)) reactions.set(key, [pick(REACTION_KINDS), iso(soonAfter(Math.max(published, joined[u])))]);
  }

  // 追蹤（不追蹤自己的空間）
  const follows = new Map();
  const maxFollow = Math.min(N.follows, okBlogs.length * Math.max(1, activeUsers.length - 1));
  for (let guard = 0; follows.size < maxFollow && guard < maxFollow * 20; guard++) {
    const b = okBlogs[skewed(okBlogs.length)];
    const u = pick(activeUsers);
    if (u === b) continue;
    const key = `${pad('U', u + 1)}|${pad('B', b + 1)}`;
    if (!follows.has(key)) follows.set(key, iso(after(Math.max(now - 300 * DAY, joined[u], joined[b]))));
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await bulk(client, 'theme', ['theme_id', 'theme_name', 'style_key', 'status'], ['char(9)', 'text', 'text', 'text'], themes, 'THEME');
    await bulk(client, 'tag', ['tag_id', 'tag_name', 'status'], ['char(9)', 'text', 'text'], tags, 'TAG');
    await bulk(client, 'user_account', ['user_id', 'username', 'email', 'password_hash', 'nickname', 'status', 'created_at'],
      ['char(9)', 'text', 'text', 'text', 'text', 'text', 'timestamptz'], users, 'USER_ACCOUNT');
    await bulk(client, 'user_role', ['user_id', 'role'], ['char(9)', 'text'], roles, 'USER_ROLE');
    await bulk(client, 'blog', ['blog_id', 'user_id', 'theme_id', 'blog_name', 'description', 'status', 'created_at',
      'tagline', 'cover_pattern', 'title_font'],
      ['char(9)', 'char(9)', 'char(9)', 'text', 'text', 'text', 'timestamptz', 'text', 'text', 'text'], blogs, 'BLOG');
    await bulk(client, 'category', ['blog_id', 'category_no', 'category_name', 'status'],
      ['char(9)', 'int', 'text', 'text'], categories, 'CATEGORY');
    await bulk(client, 'diary_entry',
      ['entry_id', 'blog_id', 'category_no', 'entry_date', 'title', 'content', 'mood_score', 'visibility',
        'status', 'created_at', 'updated_at', 'published_at', 'hidden_at'],
      ['char(9)', 'char(9)', 'int', 'date', 'text', 'text', 'smallint', 'text', 'text',
        'timestamptz', 'timestamptz', 'timestamptz', 'timestamptz'], entries, 'DIARY_ENTRY');
    await bulk(client, 'diary_tag', ['entry_id', 'tag_id'], ['char(9)', 'char(9)'],
      [...tagPairs].map((k) => k.split('|')), 'DIARY_TAG');
    await bulk(client, 'comment', ['comment_id', 'entry_id', 'user_id', 'content', 'status', 'created_at', 'updated_at', 'parent_id'],
      ['char(9)', 'char(9)', 'char(9)', 'text', 'text', 'timestamptz', 'timestamptz', 'char(9)'], comments, 'COMMENT');
    await bulk(client, 'guestbook_entry', ['guestbook_id', 'blog_id', 'user_id', 'content', 'status', 'created_at', 'updated_at'],
      ['char(9)', 'char(9)', 'char(9)', 'text', 'text', 'timestamptz', 'timestamptz'], guestbook, 'GUESTBOOK');
    await bulk(client, 'diary_favorite', ['user_id', 'entry_id', 'created_at'], ['char(9)', 'char(9)', 'timestamptz'],
      [...favorites].map(([k, at]) => [...k.split('|'), at]), 'FAVORITE');
    await bulk(client, 'blog_follow', ['follower_id', 'blog_id', 'followed_at'], ['char(9)', 'char(9)', 'timestamptz'],
      [...follows].map(([k, at]) => [...k.split('|'), at]), 'BLOG_FOLLOW');
    await bulk(client, 'diary_reaction', ['user_id', 'entry_id', 'reaction', 'created_at'],
      ['char(9)', 'char(9)', 'text', 'timestamptz'],
      [...reactions].map(([k, [kind, at]]) => [...k.split('|'), kind, at]), 'REACTION');

    // 通知：由最近 14 天的互動推得，較早的視為已讀
    const made = await client.query(`
      INSERT INTO notification (user_id, actor_id, kind, entry_id, comment_id, created_at, read_at)
      SELECT x.user_id, x.actor_id, x.kind, x.entry_id, x.comment_id, x.at,
             CASE WHEN x.at < now() - interval '3 days' THEN x.at + interval '6 hours' END
        FROM (
          SELECT b.user_id, c.user_id AS actor_id, 'comment' AS kind, c.entry_id, c.comment_id, c.created_at AS at
            FROM comment c JOIN diary_entry e ON e.entry_id = c.entry_id JOIN blog b ON b.blog_id = e.blog_id
           WHERE c.parent_id IS NULL AND c.status = 'visible'
          UNION ALL
          SELECT p.user_id, c.user_id, 'reply', c.entry_id, c.comment_id, c.created_at
            FROM comment c JOIN comment p ON p.comment_id = c.parent_id WHERE c.status = 'visible'
          UNION ALL
          SELECT b.user_id, f.user_id, 'favorite', f.entry_id, NULL, f.created_at
            FROM diary_favorite f JOIN diary_entry e ON e.entry_id = f.entry_id JOIN blog b ON b.blog_id = e.blog_id
          UNION ALL
          SELECT b.user_id, r.user_id, 'reaction', r.entry_id, NULL, r.created_at
            FROM diary_reaction r JOIN diary_entry e ON e.entry_id = r.entry_id JOIN blog b ON b.blog_id = e.blog_id
          UNION ALL
          SELECT b.user_id, f.follower_id, 'follow', NULL, NULL, f.followed_at
            FROM blog_follow f JOIN blog b ON b.blog_id = f.blog_id
        ) x
       WHERE x.user_id <> x.actor_id AND x.at >= now() - interval '14 days'
       ORDER BY x.at
      ON CONFLICT DO NOTHING`);
    console.log(`  ${'NOTIFICATION'.padEnd(12)} ${made.rowCount.toLocaleString()} 筆`);

    // 讓序列接在手動指定的代號之後，之後由 API 新增的資料不會撞號
    for (const [seq, n] of [['user_account_seq', users.length], ['blog_seq', blogs.length],
      ['theme_seq', themes.length], ['tag_seq', tags.length], ['diary_entry_seq', entries.length],
      ['comment_seq', comments.length], ['guestbook_seq', guestbook.length]]) {
      if (n > 0) await client.query('SELECT setval($1::regclass, $2)', [seq, n]);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  await pool.query('ANALYZE');

  await seedEvents(readable);
  console.log('\n完成。可登入的示範帳號（密碼皆為 password123）：');
  console.log('  operator  平台營運者（同時具有 User 與 Operator 身分）');
  console.log('  demo      一般使用者');
}

// MongoDB：公開搜尋與瀏覽事件（只含時間、匿名工作階段、事件種類、目標代號與搜尋字）
async function seedEvents(readable) {
  if (!config.mongoUrl || N.events === 0 || readable.length === 0) return;
  let client;
  try {
    client = new MongoClient(config.mongoUrl, { serverSelectionTimeoutMS: 3000 });
    await client.connect();
    const col = client.db(config.mongoDb).collection('events');
    await col.deleteMany({});
    const docs = [];
    while (docs.length < N.events) {
      const session = crypto.randomUUID();
      let t = now - rand() * 30 * DAY;
      for (let step = randInt(1, 6); step > 0 && docs.length < N.events; step--) {
        t += randInt(5, 600) * 1000;
        if (rand() < 0.4) {
          docs.push({ ts: new Date(t), session, type: 'search', target: null, target_type: 'title', keyword: pick(SEARCH_WORDS) });
        } else {
          docs.push({ ts: new Date(t), session, type: 'view', target: pad('E', pick(readable)[0]), target_type: 'entry' });
        }
      }
    }
    await col.insertMany(docs);
    await col.createIndex({ session: 1, ts: 1 });
    await col.createIndex({ type: 1, ts: -1 });
    console.log(`  ${'Mongo events'.padEnd(12)} ${docs.length.toLocaleString()} 筆`);
  } catch (err) {
    console.warn(`  （MongoDB 無法連線，略過事件資料：${err.message}）`);
  } finally {
    await client?.close();
  }
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => pool.end());
