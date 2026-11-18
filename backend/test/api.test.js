// 端對端 API 測試：驗證計畫書的可見性、權限與交易規則。
// 會清空測試資料庫，因此必須另外指定 TEST_DATABASE_URL：
//   TEST_DATABASE_URL=postgres://diary:diary@localhost:5432/diary_test npm test
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

if (!process.env.TEST_DATABASE_URL) {
  console.error('請設定 TEST_DATABASE_URL（測試會清空該資料庫）');
  process.exit(1);
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.MONGO_URL = '';
process.env.UPLOAD_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'diary-uploads-'));

const { pool } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');
const dbDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../db');

let server, base;

/** 帶 cookie 的簡易用戶端，模擬一個瀏覽器。 */
function browser() {
  const jar = new Map();
  const call = async (method, url, body, isForm = false) => {
    const headers = { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') };
    if (body && !isForm) headers['content-type'] = 'application/json';
    const res = await fetch(base + url, { method, headers, body: isForm ? body : body && JSON.stringify(body) });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const [k, v] = pair.split('=');
      if (v) jar.set(k, v); else jar.delete(k);
    }
    const type = res.headers.get('content-type') || '';
    return { status: res.status, body: type.includes('json') ? await res.json() : await res.arrayBuffer() };
  };
  return {
    get: (u) => call('GET', u),
    post: (u, b) => call('POST', u, b ?? {}),
    put: (u, b) => call('PUT', u, b ?? {}),
    del: (u) => call('DELETE', u),
    upload: (u, form) => call('PUT', u, form, true),
  };
}

const guest = browser(), alice = browser(), bob = browser(), op = browser();
const ids = {};

async function register(client, username) {
  const r = await client.post('/api/auth/register', {
    username, email: `${username}@example.com`, password: 'password123', nickname: username,
  });
  assert.equal(r.status, 201);
  return r.body.user;
}

const entryBody = (over = {}) => ({
  entry_date: '2026-11-01', title: '測試日記', content: '今天的內容', mood_score: 4,
  visibility: 'private', tag_ids: [], ...over,
});

before(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await pool.query(await fs.readFile(path.join(dbDir, 'schema.sql'), 'utf8'));
  await pool.query(await fs.readFile(path.join(dbDir, 'indexes.sql'), 'utf8'));
  await pool.query(`INSERT INTO theme (theme_name, style_key) VALUES ('極光', 'aurora'), ('海洋', 'ocean')`);
  const tags = await pool.query(
    `INSERT INTO tag (tag_name, status) VALUES ('旅行', 'active'), ('舊標籤', 'retired') RETURNING tag_id`,
  );
  [ids.tag, ids.retiredTag] = tags.rows.map((r) => r.tag_id);
  await new Promise((resolve) => { server = createApp().listen(0, resolve); });
  base = `http://localhost:${server.address().port}`;

  ids.alice = await register(alice, 'alice');
  ids.bob = await register(bob, 'bob');
  ids.op = await register(op, 'opuser');
  await pool.query(`INSERT INTO user_role VALUES ($1, 'Operator')`, [ids.op.user_id]);
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
  await fs.rm(process.env.UPLOAD_DIR, { recursive: true, force: true });
});

test('註冊同一交易建立帳號、User 身分與唯一空間', async () => {
  assert.match(ids.alice.user_id, /^U\d{8}$/);
  assert.match(ids.alice.blog_id, /^B\d{8}$/);
  assert.deepEqual(ids.alice.roles, ['User']);
  const dup = await guest.post('/api/auth/register', {
    username: 'Alice', email: 'other@example.com', password: 'password123', nickname: 'x',
  });
  assert.equal(dup.status, 409, '登入帳號轉小寫後唯一');
  const n = await pool.query('SELECT count(*) AS n FROM user_account');
  assert.equal(n.rows[0].n, 3, '失敗的註冊不留下帳號');
});

test('日記預設私密：他人與訪客都讀不到，也不出現在搜尋', async () => {
  const created = await alice.post('/api/entries', entryBody({ title: '私密的事', tag_ids: [ids.tag] }));
  assert.equal(created.status, 201);
  ids.privateEntry = created.body.entry.entry_id;
  assert.equal((await alice.get(`/api/entries/${ids.privateEntry}`)).status, 200);
  for (const who of [guest, bob, op]) {
    const r = await who.get(`/api/entries/${ids.privateEntry}`);
    assert.equal(r.status, 404);
    assert.equal(r.body.error.message, '內容目前無法瀏覽');
  }
  const search = await guest.get('/api/entries?q=' + encodeURIComponent('私密'));
  assert.equal(search.body.entries.length, 0);
  assert.equal((await bob.post(`/api/entries/${ids.privateEntry}/comments`, { content: 'hi' })).status, 404);
  assert.equal((await alice.post(`/api/entries/${ids.privateEntry}/comments`, { content: '自己的備註' })).status, 201,
    '私密日記僅作者本人可留言');
});

test('公開日記可被搜尋；心情分數不對他人顯示；published_at 被記錄', async () => {
  const created = await alice.post('/api/entries', entryBody({ title: '公開的旅行', visibility: 'public', tag_ids: [ids.tag] }));
  ids.publicEntry = created.body.entry.entry_id;
  const mine = await alice.get(`/api/entries/${ids.publicEntry}`);
  assert.equal(mine.body.entry.mood_score, 4);
  assert.ok(mine.body.entry.published_at);
  const theirs = await guest.get(`/api/entries/${ids.publicEntry}`);
  assert.equal(theirs.status, 200);
  assert.equal('mood_score' in theirs.body.entry, false);
  assert.equal('version' in theirs.body.entry, false);
  for (const q of ['q=' + encodeURIComponent('旅行'), 'author=alice', 'tag=' + encodeURIComponent('旅行')]) {
    const r = await guest.get('/api/entries?' + q);
    assert.deepEqual(r.body.entries.map((e) => e.entry_id), [ids.publicEntry], q);
    assert.equal('mood_score' in r.body.entries[0], false);
  }
});

test('欄位限制：心情分數 1 至 5、停用標籤不可新選、不能用別人的分類', async () => {
  assert.equal((await alice.post('/api/entries', entryBody({ mood_score: 6 }))).status, 400);
  assert.equal((await alice.post('/api/entries', entryBody({ mood_score: undefined }))).status, 400);
  assert.equal((await alice.post('/api/entries', entryBody({ tag_ids: [ids.retiredTag] }))).status, 409);
  const cat = await bob.post('/api/me/categories', { category_name: '日常' });
  assert.equal(cat.body.category.category_no, 1);
  assert.equal((await bob.post('/api/me/categories', { category_name: ' 日常 ' })).status, 409);
  assert.equal((await alice.post('/api/entries', entryBody({ category_no: 1 }))).status, 400,
    'alice 的空間沒有編號 1 的分類');
});

test('停用的分類既有引用保留，但改選時不能再選', async () => {
  const c1 = (await alice.post('/api/me/categories', { category_name: '甲' })).body.category.category_no;
  const c2 = (await alice.post('/api/me/categories', { category_name: '乙' })).body.category.category_no;
  const e = (await alice.post('/api/entries', entryBody({ category_no: c1 }))).body.entry;
  assert.equal((await alice.put(`/api/me/categories/${c1}`, { status: 'retired' })).status, 200);
  assert.equal((await alice.put(`/api/me/categories/${c2}`, { status: 'retired' })).status, 200);
  const keep = await alice.put(`/api/entries/${e.entry_id}`, entryBody({ category_no: c1, version: e.version, title: '改標題' }));
  assert.equal(keep.status, 200, '沿用既有停用分類可以儲存');
  const change = await alice.put(`/api/entries/${e.entry_id}`, entryBody({ category_no: c2, version: keep.body.entry.version }));
  assert.equal(change.status, 409);
});

test('編輯以 version 偵測衝突', async () => {
  const e = (await alice.post('/api/entries', entryBody())).body.entry;
  const first = await alice.put(`/api/entries/${e.entry_id}`, entryBody({ title: '第一個視窗', version: e.version }));
  assert.equal(first.status, 200);
  assert.equal(first.body.entry.version, e.version + 1);
  const second = await alice.put(`/api/entries/${e.entry_id}`, entryBody({ title: '第二個視窗', version: e.version }));
  assert.equal(second.status, 409);
  assert.equal(second.body.error.code, 'version_conflict');
  assert.equal((await bob.put(`/api/entries/${e.entry_id}`, entryBody({ version: 2 }))).status, 404, '不能改別人的日記');
});

test('留言、收藏與追蹤：不重複建立，不能追蹤自己', async () => {
  const c = await bob.post(`/api/entries/${ids.publicEntry}/comments`, { content: '寫得很好' });
  assert.equal(c.status, 201);
  ids.comment = c.body.comment.comment_id;
  assert.equal((await guest.post(`/api/entries/${ids.publicEntry}/comments`, { content: 'x' })).status, 401);
  assert.equal((await op.put(`/api/comments/${ids.comment}`, { content: '竄改' })).status, 403);

  await bob.post(`/api/entries/${ids.publicEntry}/favorite`);
  await bob.post(`/api/entries/${ids.publicEntry}/favorite`);
  const fav = await pool.query('SELECT count(*) AS n FROM diary_favorite WHERE user_id = $1', [ids.bob.user_id]);
  assert.equal(fav.rows[0].n, 1);

  assert.equal((await alice.post(`/api/blogs/${ids.alice.blog_id}/follow`)).status, 400);
  await bob.post(`/api/blogs/${ids.alice.blog_id}/follow`);
  await bob.post(`/api/blogs/${ids.alice.blog_id}/follow`);
  const feed = await bob.get('/api/me/feed');
  assert.deepEqual(feed.body.entries.map((e) => e.entry_id), [ids.publicEntry], '追蹤動態只含公開日記');
});

test('改為私密後：收藏關聯保留，但只顯示「內容目前無法瀏覽」', async () => {
  const cur = (await alice.get(`/api/entries/${ids.publicEntry}`)).body.entry;
  const toPrivate = await alice.put(`/api/entries/${ids.publicEntry}`,
    entryBody({ title: cur.title, visibility: 'private', tag_ids: [ids.tag], version: cur.version }));
  assert.equal(toPrivate.status, 200);
  const favs = await bob.get('/api/me/favorites');
  assert.deepEqual(Object.keys(favs.body.favorites[0]).sort(), ['available', 'entry_id', 'favorited_at']);
  assert.equal(favs.body.favorites[0].available, false);
  assert.equal((await bob.get(`/api/entries/${ids.publicEntry}/comments`)).status, 404, '留言隨日記權限變動');
  assert.equal((await bob.get('/api/me/feed')).body.entries.length, 0);
  // 改回公開，published_at 更新為最近一次公開的時間
  const before = cur.published_at;
  await new Promise((r) => setTimeout(r, 20));
  const back = await alice.put(`/api/entries/${ids.publicEntry}`,
    entryBody({ title: cur.title, visibility: 'public', tag_ids: [ids.tag], version: toPrivate.body.entry.version }));
  assert.equal(back.status, 200);
  const again = (await alice.get(`/api/entries/${ids.publicEntry}`)).body.entry;
  assert.ok(new Date(again.published_at) > new Date(before));
  assert.equal((await bob.get('/api/me/favorites')).body.favorites[0].available, true);
});

test('照片讀取須通過日記權限檢查', async () => {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const form = new FormData();
  form.append('photo', new Blob([png], { type: 'image/png' }), 'a.png');
  assert.equal((await alice.upload(`/api/entries/${ids.privateEntry}/photo`, form)).status, 200);
  const row = await pool.query('SELECT photo_url FROM diary_entry WHERE entry_id = $1', [ids.privateEntry]);
  assert.match(row.rows[0].photo_url, /^media\/[0-9a-f-]+\.png$/, '資料庫只存位置');
  assert.equal((await alice.get(`/api/entries/${ids.privateEntry}/photo`)).status, 200);
  assert.equal((await bob.get(`/api/entries/${ids.privateEntry}/photo`)).status, 404);
  assert.equal((await guest.get(`/api/entries/${ids.privateEntry}/photo`)).status, 404);
  const bad = new FormData();
  bad.append('photo', new Blob(['x'], { type: 'text/plain' }), 'a.txt');
  assert.equal((await alice.upload(`/api/entries/${ids.privateEntry}/photo`, bad)).status, 400);
});

test('留言板：訪客只能讀，空間主人可移除訊息', async () => {
  assert.equal((await guest.post(`/api/blogs/${ids.alice.blog_id}/guestbook`, { content: 'x' })).status, 401);
  const m = await bob.post(`/api/blogs/${ids.alice.blog_id}/guestbook`, { content: '路過' });
  assert.equal(m.status, 201);
  assert.equal((await guest.get(`/api/blogs/${ids.alice.blog_id}/guestbook`)).body.messages.length, 1);
  assert.equal((await op.del(`/api/guestbook/${m.body.message.guestbook_id}`)).status, 404, '第三者不能移除');
  assert.equal((await alice.del(`/api/guestbook/${m.body.message.guestbook_id}`)).status, 200);
  assert.equal((await guest.get(`/api/blogs/${ids.alice.blog_id}/guestbook`)).body.messages.length, 0);
  const row = await pool.query('SELECT status FROM guestbook_entry WHERE guestbook_id = $1', [m.body.message.guestbook_id]);
  assert.equal(row.rows[0].status, 'deleted', '移除採狀態更新');
});

test('回顧：月份篇數與平均心情分數只給作者本人', async () => {
  const r = await alice.get('/api/me/entries?month=2026-11');
  assert.equal(r.status, 200);
  assert.ok(r.body.stats.entry_count >= 3);
  assert.equal(r.body.stats.avg_mood, 4);
  assert.equal((await guest.get('/api/me/entries')).status, 401);
  const monthly = await alice.get('/api/me/review/monthly');
  assert.equal(monthly.body.months[0].month, '2026-11');
});

test('營運者：一般使用者不能進入；隱藏後作者可看但不能自行解除，編輯不重設', async () => {
  assert.equal((await alice.get('/api/operator/stats')).status, 403);
  assert.equal((await guest.get('/api/operator/stats')).status, 401);
  assert.equal((await op.put(`/api/operator/entries/${ids.privateEntry}/status`, { status: 'hidden' })).status, 409,
    '只能隱藏公開日記');

  assert.equal((await op.put(`/api/operator/entries/${ids.publicEntry}/status`, { status: 'hidden' })).status, 200);
  assert.equal((await bob.get(`/api/entries/${ids.publicEntry}`)).status, 404);
  const mine = (await alice.get(`/api/entries/${ids.publicEntry}`)).body.entry;
  assert.equal(mine.status, 'hidden');
  assert.ok(mine.hidden_at);
  const edit = await alice.put(`/api/entries/${ids.publicEntry}`,
    entryBody({ title: '改過', visibility: 'public', tag_ids: [ids.tag], version: mine.version }));
  assert.equal(edit.status, 200);
  assert.equal((await alice.get(`/api/entries/${ids.publicEntry}`)).body.entry.status, 'hidden');
  assert.equal((await bob.get(`/api/entries/${ids.publicEntry}`)).status, 404);

  const list = await op.get('/api/operator/entries');
  assert.ok(list.body.entries.every((e) => e.visibility === 'public' || e.title === null), '營運清單不含私密內文');
  assert.equal(JSON.stringify(list.body).includes('私密的事'), false);

  await op.put(`/api/operator/entries/${ids.publicEntry}/status`, { status: 'active' });
  const restored = (await alice.get(`/api/entries/${ids.publicEntry}`)).body.entry;
  assert.equal(restored.status, 'active');
  assert.equal(restored.hidden_at, null);
  assert.equal((await bob.get(`/api/entries/${ids.publicEntry}`)).status, 200);
});

test('營運者隱藏留言：留言者編輯不會改回 visible', async () => {
  await op.put(`/api/operator/comments/${ids.comment}/status`, { status: 'hidden' });
  assert.equal((await guest.get(`/api/entries/${ids.publicEntry}/comments`)).body.comments.length, 0);
  assert.equal((await bob.put(`/api/comments/${ids.comment}`, { content: '改一下' })).status, 200);
  const row = await pool.query('SELECT status, content FROM comment WHERE comment_id = $1', [ids.comment]);
  assert.deepEqual(row.rows[0], { status: 'hidden', content: '改一下' });
});

test('主題與標籤：停用後不可新選，既有引用保留', async () => {
  const themes = (await op.get('/api/operator/themes')).body.themes;
  const used = (await alice.get('/api/me/space')).body.blog.theme_id;
  const other = themes.find((t) => t.theme_id !== used);
  assert.equal((await op.put(`/api/operator/themes/${other.theme_id}`, { status: 'retired' })).status, 200);
  const space = (await alice.get('/api/me/space')).body;
  const body = { nickname: 'alice', blog_name: space.blog.blog_name, description: '簡介' };
  assert.equal((await alice.put('/api/me/space', { ...body, theme_id: other.theme_id })).status, 409);
  assert.equal((await alice.put('/api/me/space', { ...body, theme_id: used })).status, 200);
  assert.equal((await op.put(`/api/operator/themes/${used}`, { status: 'retired' })).status, 409, '至少保留一個主題');
  assert.equal((await op.post('/api/operator/tags', { tag_name: ' 旅行 ' })).status, 409, '標準化後唯一');
  assert.equal((await op.post('/api/operator/themes', { theme_name: 'x', style_key: 'not-deployed' })).status, 400);
});

test('停權帳號：內容對他人不可見，本人唯讀', async () => {
  assert.equal((await op.put(`/api/operator/users/${ids.alice.user_id}/status`, { status: 'suspended' })).status, 200);
  assert.equal((await bob.get(`/api/entries/${ids.publicEntry}`)).status, 404);
  assert.equal((await guest.get(`/api/blogs/${ids.alice.blog_id}`)).status, 404);
  const following = (await bob.get('/api/me/following')).body.following;
  assert.deepEqual(Object.keys(following[0]).sort(), ['available', 'blog_id', 'followed_at'], '追蹤關聯保留但不顯示內容');
  assert.equal((await alice.get(`/api/entries/${ids.publicEntry}`)).status, 200, '本人仍可檢視');
  assert.equal((await alice.post('/api/entries', entryBody())).status, 403, '不能寫入');
  assert.equal((await op.put(`/api/operator/users/${ids.op.user_id}/status`, { status: 'suspended' })).status, 400);
  await op.put(`/api/operator/users/${ids.alice.user_id}/status`, { status: 'active' });
  assert.equal((await bob.get(`/api/entries/${ids.publicEntry}`)).status, 200, '恢復後重新可讀');
  assert.equal((await bob.get('/api/me/following')).body.following[0].available, true);
});

test('營運統計只含公開內容', async () => {
  const r = await op.get('/api/operator/stats?days=30');
  assert.equal(r.status, 200);
  assert.equal(r.body.new_public_entries.length, 30);
  assert.equal(r.body.weekly_active_authors.length, 8);
  assert.equal(JSON.stringify(r.body).includes('mood'), false);
  assert.equal(JSON.stringify(r.body).includes('私密的事'), false);
  assert.deepEqual(await (await op.get('/api/operator/analytics')).body, { available: false, days: 30 });
});

test('自訂標籤：標準化後沿用既有標籤，停用的不能再選', async () => {
  assert.equal((await guest.post('/api/tags', { tag_name: '手沖' })).status, 401);
  const made = await alice.post('/api/tags', { tag_name: ' #Coffee ' });
  assert.equal(made.status, 201);
  assert.equal(made.body.tag.tag_name, 'coffee');
  const again = await bob.post('/api/tags', { tag_name: 'COFFEE' });
  assert.equal(again.body.tag.tag_id, made.body.tag.tag_id, '不重複建立');
  assert.equal((await alice.post('/api/tags', { tag_name: '舊標籤' })).status, 409);
  assert.equal((await alice.post('/api/tags', { tag_name: '有 空白' })).status, 400);
  const e = await alice.post('/api/entries', entryBody({ tag_ids: [made.body.tag.tag_id] }));
  assert.equal(e.status, 201);
});

test('歌曲連結與個人風格：連結與歌名成對、只接受 https', async () => {
  const song = { song_url: 'https://example.com/song/1', song_title: '夜晚的歌' };
  assert.equal((await alice.post('/api/entries', entryBody({ song_url: 'http://example.com/a', song_title: 'x' }))).status, 400);
  assert.equal((await alice.post('/api/entries', entryBody({ song_url: 'https://example.com/a' }))).status, 400, '有連結必須有歌名');
  assert.equal((await alice.post('/api/entries', entryBody({ song_title: '只有歌名' }))).status, 400);
  const created = await alice.post('/api/entries', entryBody({ ...song, visibility: 'public' }));
  assert.equal(created.status, 201);
  const read = (await bob.get(`/api/entries/${created.body.entry.entry_id}`)).body.entry;
  assert.equal(read.song_title, '夜晚的歌');
  assert.equal(read.song_url, 'https://example.com/song/1');

  const space = (await alice.get('/api/me/space')).body;
  const body = { nickname: space.nickname, blog_name: space.blog.blog_name, description: '', theme_id: space.blog.theme_id };
  assert.equal((await alice.put('/api/me/space', { ...body, cover_pattern: 'stars' })).status, 400);
  assert.equal((await alice.put('/api/me/space', { ...body, tagline: '慢慢來', cover_pattern: 'waves', title_font: 'mono', ...song })).status, 200);
  const blog = (await guest.get(`/api/blogs/${ids.alice.blog_id}`)).body.blog;
  assert.deepEqual([blog.tagline, blog.cover_pattern, blog.title_font, blog.song_title], ['慢慢來', 'waves', 'mono', '夜晚的歌']);
  assert.equal((await alice.put('/api/me/space', body)).status, 200, '舊版表單不帶新欄位也能儲存');
  assert.equal((await guest.get(`/api/blogs/${ids.alice.blog_id}`)).body.blog.song_title, null);

  assert.equal((await guest.get('/api/song-info?url=https://youtu.be/x')).status, 401);
  const other = await alice.get(`/api/song-info?url=${encodeURIComponent('https://example.com/song/1')}`);
  assert.deepEqual(other.body, { provider: null, title: null }, '不支援的網站不會被連線');
});

test('表情回應、回覆、@提及與通知', async () => {
  const pub = (await alice.post('/api/entries', entryBody({ visibility: 'public', title: '互動測試' }))).body.entry.entry_id;
  await alice.post('/api/me/notifications/read');

  // 表情：每人一種，可以更換與取消；私密日記不能回應
  assert.equal((await guest.put(`/api/entries/${pub}/reaction`, { reaction: 'like' })).status, 401);
  assert.equal((await bob.put(`/api/entries/${pub}/reaction`, { reaction: 'wow' })).status, 400);
  assert.equal((await bob.put(`/api/entries/${ids.privateEntry}/reaction`, { reaction: 'like' })).status, 404);
  assert.equal((await bob.put(`/api/entries/${pub}/reaction`, { reaction: 'like' })).body.my_reaction, 'like');
  const changed = (await bob.put(`/api/entries/${pub}/reaction`, { reaction: 'hug' })).body;
  assert.deepEqual([changed.reactions.like, changed.reactions.hug, changed.my_reaction], [0, 1, 'hug']);
  assert.equal((await guest.get(`/api/entries/${pub}/reactions`)).body.reactions.hug, 1);

  // 回覆只有一層，且必須屬於同一篇日記
  const top = (await bob.post(`/api/entries/${pub}/comments`, { content: '第一則 @alice 你好' })).body.comment;
  const reply = (await alice.post(`/api/entries/${pub}/comments`, { content: '謝謝 @bob', parent_id: top.comment_id })).body.comment;
  assert.equal(reply.parent_id, top.comment_id);
  const nested = (await bob.post(`/api/entries/${pub}/comments`, { content: '再回', parent_id: reply.comment_id })).body.comment;
  assert.equal(nested.parent_id, top.comment_id, '回覆的回覆掛在同一則最上層留言');
  assert.equal((await bob.post(`/api/entries/${pub}/comments`, { content: 'x', parent_id: ids.comment })).status, 404, '不能回覆別篇日記的留言');
  const listed = (await guest.get(`/api/entries/${pub}/comments`)).body;
  assert.equal(listed.comments.length, 3);
  assert.equal(listed.mentions.bob, ids.bob.blog_id);

  // 通知：alice 收到表情（只一則）、留言；bob 收到回覆（不重複收到提及）
  const forAlice = (await alice.get('/api/me/notifications')).body;
  assert.deepEqual(forAlice.notifications.filter((n) => !n.read_at).map((n) => n.kind).sort(), ['comment', 'reaction', 'reply']);
  assert.equal(forAlice.unread_count, 3);
  assert.equal(forAlice.notifications.find((n) => n.kind === 'reaction').reaction, 'hug');
  const forBob = (await bob.get('/api/me/notifications')).body.notifications.filter((n) => n.entry_id === pub);
  assert.deepEqual(forBob.map((n) => n.kind), ['reply']);
  assert.equal((await alice.post('/api/me/notifications/read')).body.unread_count, 0);
  assert.equal((await alice.get('/api/me/notifications/unread-count')).body.unread_count, 0);

  // 日記改為私密後，通知不再透露標題
  const cur = (await alice.get(`/api/entries/${pub}`)).body.entry;
  await alice.put(`/api/entries/${pub}`, entryBody({ visibility: 'private', title: '互動測試', version: cur.version }));
  const hiddenFromBob = (await bob.get('/api/me/notifications')).body.notifications.find((n) => n.kind === 'reply');
  assert.equal(hiddenFromBob.entry_title, null);
  assert.equal(hiddenFromBob.comment_excerpt, null);

  assert.equal((await bob.del(`/api/entries/${pub}/reaction`)).body.my_reaction, null);
});

test('大頭貼與現在的心情', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const form = new FormData();
  form.append('avatar', new Blob([png], { type: 'image/png' }), 'a.png');
  assert.equal((await alice.upload('/api/me/avatar', form)).status, 200);
  const me = (await alice.get('/api/auth/me')).body.user;
  assert.match(me.avatar, /^\/api\/avatars\/U\d{8}\?v=/);
  const img = await fetch(`${base}${me.avatar}`);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/png');
  const text = new FormData();
  text.append('avatar', new Blob(['hello'], { type: 'text/plain' }), 'a.txt');
  assert.equal((await alice.upload('/api/me/avatar', text)).status, 400);
  assert.equal((await alice.del('/api/me/avatar')).status, 200);
  assert.equal((await fetch(`${base}/api/avatars/${ids.alice.user_id}`)).status, 404);

  assert.equal((await alice.put('/api/me/status', { status_text: '期末週，努力中', duration: '4h' })).status, 200);
  assert.equal((await guest.get(`/api/blogs/${ids.alice.blog_id}`)).body.blog.owner_status_text, '期末週，努力中');
  await pool.query(`UPDATE user_account SET status_expires_at = now() - interval '1 minute' WHERE user_id = $1`, [ids.alice.user_id]);
  assert.equal((await guest.get(`/api/blogs/${ids.alice.blog_id}`)).body.blog.owner_status_text, null, '到期後不再顯示');
  assert.equal((await alice.put('/api/me/status', { status_text: 'x', duration: '1y' })).status, 400);
  assert.equal((await alice.del('/api/me/status')).status, 200);
});

test('熱門排序：最近 30 天公開的日記依互動數排序，不含私密與過期的日記', async () => {
  const make = async (title) => (await alice.post('/api/entries', entryBody({ visibility: 'public', title }))).body.entry.entry_id;
  const quiet = await make('熱門測試：沒人理');
  const busy = await make('熱門測試：很多互動');
  const old = await make('熱門測試：很久以前');
  await bob.post(`/api/entries/${busy}/comments`, { content: '留言' });
  await bob.put(`/api/entries/${busy}/reaction`, { reaction: 'like' });
  await bob.post(`/api/entries/${busy}/favorite`);
  await bob.post(`/api/entries/${old}/comments`, { content: '一' });
  await op.post(`/api/entries/${old}/comments`, { content: '二' });
  await op.put(`/api/entries/${old}/reaction`, { reaction: 'like' });
  await op.post(`/api/entries/${old}/favorite`);
  await pool.query(`UPDATE diary_entry SET published_at = now() - interval '40 days', created_at = now() - interval '41 days',
                           updated_at = now() - interval '40 days' WHERE entry_id = $1`, [old]);

  const hot = (await guest.get('/api/entries?sort=hot&q=' + encodeURIComponent('熱門測試'))).body;
  assert.deepEqual(hot.entries.map((e) => e.entry_id), [busy, quiet], '互動多的在前，超過 30 天的不列入');
  assert.equal(hot.entries[0].hot_score, 3);
  assert.equal(hot.sort, 'hot');
  const latest = (await guest.get('/api/entries?q=' + encodeURIComponent('熱門測試'))).body.entries.map((e) => e.entry_id);
  assert.deepEqual(latest, [busy, quiet, old], '預設仍依公開時間');
  assert.equal((await guest.get('/api/entries?sort=random')).status, 400);
  const all = (await guest.get('/api/entries?sort=hot&size=50')).body.entries;
  assert.equal(all.some((e) => e.entry_id === ids.privateEntry), false);
  assert.equal(JSON.stringify(all).includes('私密的事'), false);
  await bob.del(`/api/entries/${busy}/favorite`);       // 不影響後面檢查收藏清單的測試
});

test('個人主頁：自訂背景圖與主題套用範圍', async () => {
  const space = (await alice.get('/api/me/space')).body;
  const body = { nickname: space.nickname, blog_name: space.blog.blog_name, description: '', theme_id: space.blog.theme_id };
  assert.equal(space.blog.theme_scope, 'header', '預設只套用在標頭');
  assert.equal((await alice.put('/api/me/space', { ...body, theme_scope: 'everything' })).status, 400);
  assert.equal((await alice.put('/api/me/space', { ...body, theme_scope: 'page' })).status, 200);

  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const form = new FormData();
  form.append('background', new Blob([png], { type: 'image/png' }), 'bg.png');
  assert.equal((await guest.upload('/api/me/background', form)).status, 401);
  assert.equal((await alice.upload('/api/me/background', form)).status, 200);
  const blog = (await guest.get(`/api/blogs/${ids.alice.blog_id}`)).body.blog;
  assert.equal(blog.theme_scope, 'page');
  assert.match(blog.background, /^\/api\/blogs\/B\d{8}\/background\?v=/);
  const img = await fetch(base + blog.background);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/png');

  // 空間被隱藏時，別人拿不到背景圖，主人自己可以
  await op.put(`/api/operator/blogs/${ids.alice.blog_id}/status`, { status: 'hidden' });
  assert.equal((await guest.get(`/api/blogs/${ids.alice.blog_id}/background`)).status, 404);
  assert.equal((await alice.get(`/api/blogs/${ids.alice.blog_id}/background`)).status, 200);
  await op.put(`/api/operator/blogs/${ids.alice.blog_id}/status`, { status: 'active' });

  const bad = new FormData();
  bad.append('background', new Blob(['x'], { type: 'image/gif' }), 'bg.gif');
  assert.equal((await alice.upload('/api/me/background', bad)).status, 400);
  assert.equal((await alice.del('/api/me/background')).status, 200);
  assert.equal((await guest.get(`/api/blogs/${ids.alice.blog_id}`)).body.blog.background, null);
  assert.equal((await alice.put('/api/me/space', body)).status, 200);
});

test('Dashboard：各序列長度與期間一致，不含私密內文', async () => {
  assert.equal((await alice.get('/api/operator/dashboard')).status, 403);
  const r = await op.get('/api/operator/dashboard?days=14');
  assert.equal(r.status, 200);
  assert.equal(r.body.daily.length, 14);
  assert.equal(r.body.period.accounts.cur, 3);
  assert.equal(r.body.composition.public_mood.length, 5);
  assert.equal(r.body.daily.at(-1).accounts, 3, '今天註冊的三個帳號');
  const v = r.body.composition.visibility;
  assert.equal(typeof v.public, 'number');
  assert.equal(typeof v.private, 'number');
  assert.equal(JSON.stringify(r.body).includes('私密的事'), false);
});

test('身分管理：授予與撤銷 Operator，不能變更自己', async () => {
  assert.equal((await alice.put(`/api/operator/users/${ids.bob.user_id}/roles`, { operator: true })).status, 403);
  assert.equal((await op.put(`/api/operator/users/${ids.op.user_id}/roles`, { operator: false })).status, 400);
  assert.equal((await op.put(`/api/operator/users/${ids.bob.user_id}/roles`, { operator: 'yes' })).status, 400);
  assert.equal((await op.put(`/api/operator/users/${ids.bob.user_id}/roles`, { operator: true })).status, 200);
  assert.equal((await op.put(`/api/operator/users/${ids.bob.user_id}/roles`, { operator: true })).status, 200, '重複授予不出錯');
  assert.equal((await bob.get('/api/operator/stats')).status, 200, '授予後立即生效');
  const ops = (await op.get('/api/operator/blogs?role=Operator')).body.blogs.map((b) => b.username).sort();
  assert.deepEqual(ops, ['bob', 'opuser']);
  const detail = await op.get(`/api/operator/users/${ids.bob.user_id}`);
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.body.account.roles, ['Operator', 'User']);
  assert.equal(typeof detail.body.account.followers, 'number');
  assert.equal((await op.put(`/api/operator/users/${ids.bob.user_id}/roles`, { operator: false })).status, 200);
  assert.equal((await bob.get('/api/operator/stats')).status, 403, '撤銷後立即失效');
});

test('營運者永久刪除：只限公開內容，刪除後作者也讀不到', async () => {
  const pub = (await alice.post('/api/entries', entryBody({ visibility: 'public', title: '要被刪除的公開日記' }))).body.entry.entry_id;
  const c = (await bob.post(`/api/entries/${pub}/comments`, { content: '要被刪除的留言' })).body.comment.comment_id;
  assert.equal((await alice.del(`/api/operator/entries/${pub}`)).status, 403);
  assert.equal((await op.del(`/api/operator/entries/${ids.privateEntry}`)).status, 404, '私密日記不在營運者的管理範圍');
  assert.equal((await op.del(`/api/operator/comments/${c}`)).status, 200);
  assert.equal((await op.del(`/api/operator/comments/${c}`)).status, 404);
  assert.equal((await op.del(`/api/operator/entries/${pub}`)).status, 200);
  assert.equal((await alice.get(`/api/entries/${pub}`)).status, 404);
  assert.equal((await op.put(`/api/operator/entries/${pub}/status`, { status: 'active' })).status, 404, '無法復原');
  const kept = await pool.query('SELECT status FROM diary_entry WHERE entry_id = $1', [pub]);
  assert.equal(kept.rows[0].status, 'deleted');
});

test('刪除日記採狀態更新，留言與收藏不連鎖刪除', async () => {
  assert.equal((await alice.del(`/api/entries/${ids.publicEntry}`)).status, 200);
  assert.equal((await alice.get(`/api/entries/${ids.publicEntry}`)).status, 404);
  const rows = await pool.query(
    `SELECT (SELECT status FROM diary_entry WHERE entry_id = $1) AS status,
            (SELECT count(*) FROM comment WHERE entry_id = $1) AS comments,
            (SELECT count(*) FROM diary_favorite WHERE entry_id = $1) AS favorites`,
    [ids.publicEntry],
  );
  assert.deepEqual(rows.rows[0], { status: 'deleted', comments: 1, favorites: 1 });
  assert.equal((await bob.get('/api/me/favorites')).body.favorites[0].available, false);
  await assert.rejects(pool.query('DELETE FROM diary_entry WHERE entry_id = $1', [ids.publicEntry]), /foreign key/);
});
