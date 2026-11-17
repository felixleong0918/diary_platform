import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatTime, qs } from '../api.js';
import { useAuth, useFeedback } from '../context.jsx';
import { useData, usePaged } from '../hooks.js';
import { Button, Empty, LoadMore, Segmented } from '../components/ui.jsx';
import { Heatmap, SegmentedBar, Sparkline, TimeChart } from '../components/Charts.jsx';

const TABS = [
  { value: 'stats', label: '總覽' },
  { value: 'content', label: '公開內容' },
  { value: 'accounts', label: '帳號與權限' },
  { value: 'catalog', label: '主題與標籤' },
  { value: 'analytics', label: '搜尋分析' },
];
const RANGES = [{ value: 7, label: '7 天' }, { value: 30, label: '30 天' }, { value: 90, label: '90 天' }];

export default function Operator() {
  const [tab, setTab] = useState('stats');
  return (
    <main className="page stack is-loose">
      <header className="stack" style={{ gap: 6 }}>
        <h1 className="title">營運管理</h1>
      </header>
      <div style={{ overflowX: 'auto', padding: 2 }}>
        <Segmented label="營運功能" options={TABS} value={tab} onChange={setTab} />
      </div>
      {tab === 'stats' && <Dashboard />}
      {tab === 'content' && <Content />}
      {tab === 'accounts' && <Accounts />}
      {tab === 'catalog' && <Catalog />}
      {tab === 'analytics' && <Analytics />}
    </main>
  );
}

// ---------------------------------------------------------------------
function HBars({ rows, labelKey, valueKey, prefix = '' }) {
  const max = Math.max(1, ...rows.map((r) => r[valueKey]));
  return (
    <div className="stack" style={{ gap: 10 }}>
      {rows.map((r, i) => (
        <div key={`${r[labelKey]}-${i}`} className="hbar">
          <span className="clamp-2">{prefix}{r[labelKey]}</span>
          <div><i style={{ width: `${(r[valueKey] / max) * 100}%` }} /></div>
          <span className="num" style={{ textAlign: 'right' }}>{r[valueKey].toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

function Delta({ cur, prev, days }) {
  if (!prev) return <span className="tiny">前 {days} 天沒有資料可比較</span>;
  const pct = ((cur - prev) / prev) * 100;
  const mark = pct > 0 ? '▲' : pct < 0 ? '▼' : '';
  return <span className="tiny num">較前 {days} 天 {mark} {Math.abs(pct).toFixed(1)}%</span>;
}

const KPIS = [
  { key: 'accounts', label: '新註冊帳號' },
  { key: 'public_entries', label: '新公開日記' },
  { key: 'comments', label: '留言' },
  { key: 'favorites', label: '收藏' },
  { key: 'follows', label: '追蹤' },
  { key: 'reactions', label: '表情回應' },
];
const REACTION_ROWS = [['like', '喜歡'], ['hug', '抱抱'], ['cheer', '加油'], ['haha', '好笑'], ['sad', '難過']];
const MOOD_LABEL = ['很差', '不好', '普通', '不錯', '很好'];

function Dashboard() {
  const [days, setDays] = useState(30);
  const both = useData(
    () => Promise.all([api.get(`/operator/stats?days=${days}`), api.get(`/operator/dashboard?days=${days}`)]),
    [days],
  );
  if (both.error) return <Empty title="載入失敗">{both.error.message}</Empty>;
  if (!both.data) return <div className="skeleton" style={{ minHeight: 320 }} />;
  const [d, x] = both.data;
  const labels = x.daily.map((r) => r.day);
  const col = (key) => x.daily.map((r) => r[key]);
  let running = x.before.accounts;
  const cumulative = x.daily.map((r) => (running += r.accounts));
  const posts = x.daily.reduce((s, r) => s + r.public_entries + r.private_entries, 0);
  const maxWeekly = Math.max(1, ...d.weekly_active_authors.map((r) => r.active_authors));
  const maxMood = Math.max(1, ...x.composition.public_mood.map((r) => r.n));
  const c = x.composition;
  const heatTotal = x.publish_heatmap.reduce((s, r) => s + r.n, 0);
  const peak = x.publish_heatmap.reduce((a, r) => (r.n > (a?.n ?? 0) ? r : a), null);

  return (
    <div className="stack is-loose">
      <div className="tiles">
        <div className="glass tile"><span className="small muted">帳號</span><b>{d.totals.accounts.toLocaleString()}</b></div>
        <div className="glass tile"><span className="small muted">目前可讀的公開日記</span><b>{d.totals.public_entries.toLocaleString()}</b></div>
        <div className="glass tile"><span className="small muted">被隱藏的日記</span><b>{d.totals.hidden_entries.toLocaleString()}</b></div>
        <div className="glass tile"><span className="small muted">停權中的帳號</span><b>{d.totals.suspended_accounts.toLocaleString()}</b></div>
      </div>

      <div className="row is-between">
        <h2 className="section-title" style={{ marginTop: 0 }}>最近 {x.days} 天</h2>
        <Segmented label="統計期間" options={RANGES} value={days} onChange={setDays} />
      </div>
      <div className="kpis">
        {KPIS.map((k) => (
          <div key={k.key} className="glass kpi">
            <span className="small muted">{k.label}</span>
            <b>{x.period[k.key].cur.toLocaleString()}</b>
            <Delta cur={x.period[k.key].cur} prev={x.period[k.key].prev} days={x.days} />
            <Sparkline values={col(k.key)} />
          </div>
        ))}
      </div>

      <h2 className="section-title">成長趨勢</h2>
      <div className="form-grid">
        <section className="glass panel stack">
          <div><h3 className="heading">累計帳號</h3><p className="small muted num">期末共 {cumulative.at(-1).toLocaleString()} 個</p></div>
          <TimeChart title="累計帳號數" labels={labels} zero={false} series={[{ key: 'cum', label: '累計帳號', color: 'var(--ink)', values: cumulative }]} />
        </section>
        <section className="glass panel stack">
          <div><h3 className="heading">每日新註冊</h3><p className="small muted num">期間內共 {x.period.accounts.cur.toLocaleString()} 個</p></div>
          <TimeChart title="每日新註冊帳號數" labels={labels} series={[{ key: 'new', label: '新註冊', color: 'var(--ink)', values: col('accounts') }]} />
        </section>
      </div>

      <h2 className="section-title">貼文數量</h2>
      <section className="glass panel stack">
        <div>
          <h3 className="heading">每日新增日記</h3>
          <p className="small muted num">期間內共 {posts.toLocaleString()} 篇。公開日記依公開時間計算，私人日記依建立時間計算，且只計篇數</p>
        </div>
        <TimeChart type="stack" title="每日新增的公開與私人日記篇數" labels={labels} height={240} series={[
          { key: 'pub', label: '公開', color: 'var(--viz-1)', values: col('public_entries') },
          { key: 'priv', label: '私人', color: 'var(--viz-2)', values: col('private_entries') },
        ]} />
      </section>
      <div className="form-grid">
        <section className="glass panel stack">
          <h3 className="heading">每週活躍作者</h3>
          <p className="small muted">該週至少公開一篇日記的作者數（最近 8 週）</p>
          <div className="bars is-labelled" style={{ height: 240 }} role="img" aria-label="最近八週的活躍作者數">
            {d.weekly_active_authors.map((w) => (
              <div key={w.week_start} title={`${w.week_start} 起的一週：${w.active_authors} 位作者、${w.public_entries} 篇`}>
                <span className="track">
                  <span className="num">{w.active_authors}</span>
                  <i style={{ '--v': w.active_authors / maxWeekly }} />
                </span>
                <span className="num">{w.week_start.slice(5).replace('-', '/')}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="glass panel stack">
          <h3 className="heading">最活躍的作者</h3>
          <p className="small muted">期間內公開日記篇數</p>
          {x.top_authors.length === 0 ? <p className="muted small">這段期間沒有資料。</p> : <HBars rows={x.top_authors} labelKey="nickname" valueKey="n" />}
        </section>
      </div>

      <h2 className="section-title">互動分析</h2>
      <section className="glass panel stack">
        <div><h3 className="heading">每日互動</h3><p className="small muted">留言、表情回應、收藏與追蹤的每日筆數</p></div>
        <TimeChart title="每日留言、收藏與追蹤數" labels={labels} height={240} series={[
          { key: 'c', label: '留言', color: 'var(--viz-1)', values: col('comments') },
          { key: 'r', label: '表情回應', color: 'var(--viz-2)', values: col('reactions') },
          { key: 'f', label: '收藏', color: 'var(--viz-3)', values: col('favorites') },
          { key: 'w', label: '追蹤', color: 'var(--viz-4)', values: col('follows') },
        ]} />
      </section>
      <div className="form-grid">
        <section className="glass panel stack">
          <h3 className="heading">最多人追蹤的空間</h3>
          <p className="small muted">目前的追蹤人數</p>
          {x.top_followed_blogs.length === 0 ? <p className="muted small">還沒有追蹤資料。</p> : <HBars rows={x.top_followed_blogs} labelKey="blog_name" valueKey="n" />}
        </section>
        <section className="glass panel stack">
          <h3 className="heading">熱門標籤</h3>
          <p className="small muted">期間內公開的日記所使用的標籤</p>
          {d.hot_tags.length === 0 ? <p className="muted small">這段期間沒有資料。</p> : <HBars rows={d.hot_tags} labelKey="tag_name" valueKey="entry_count" prefix="#" />}
        </section>
      </div>
      <section className="glass panel stack">
        <div><h3 className="heading">表情回應的種類</h3><p className="small muted">所有日記累計</p></div>
        <HBars labelKey="label" valueKey="n" rows={REACTION_ROWS.map(([k, label]) => ({ label, n: c.reactions[k] }))} />
      </section>
      <section className="glass panel stack">
        <h3 className="heading">公開日記互動量</h3>
        <p className="small muted">期間內的留言數與收藏數</p>
        {d.top_interactions.length === 0 ? <p className="muted small">這段期間沒有互動。</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>日記</th><th>作者</th><th className="is-right">留言</th><th className="is-right">收藏</th><th className="is-right">合計</th></tr></thead>
              <tbody>
                {d.top_interactions.map((r) => (
                  <tr key={r.entry_id}>
                    <td><Link className="link" to={`/entry/${r.entry_id}`}>{r.title}</Link></td>
                    <td>{r.author_nickname}</td>
                    <td className="is-right num">{r.comment_count}</td>
                    <td className="is-right num">{r.favorite_count}</td>
                    <td className="is-right num"><b>{r.interaction_count}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <h2 className="section-title">內容組成</h2>
      <div className="form-grid">
        <section className="glass panel stack">
          <div><h3 className="heading">公開與私人</h3><p className="small muted">所有未刪除的日記</p></div>
          <SegmentedBar unit=" 篇" parts={[
            { key: 'public', label: '公開', value: c.visibility.public, color: 'var(--viz-1)', onDark: true },
            { key: 'private', label: '私人', value: c.visibility.private, color: 'var(--viz-2)' },
          ]} />
          <div style={{ marginTop: 8 }}><h3 className="heading">日記狀態</h3><p className="small muted">包含已刪除的日記</p></div>
          <HBars labelKey="label" valueKey="n" rows={[
            { label: '正常', n: c.status.active }, { label: '被隱藏', n: c.status.hidden }, { label: '已刪除', n: c.status.deleted },
          ]} />
        </section>
        <section className="glass panel stack">
          <div><h3 className="heading">公開日記的分類</h3><p className="small muted">目前可讀的公開日記，前 8 名</p></div>
          {c.public_categories.length === 0 ? <p className="muted small">還沒有資料。</p> : <HBars rows={c.public_categories} labelKey="category_name" valueKey="n" />}
        </section>
      </div>
      <section className="glass panel stack">
        <div><h3 className="heading">公開日記的心情分數</h3><p className="small muted">目前可讀的公開日記；私人日記的心情不列入</p></div>
        <div className="bars is-labelled" style={{ height: 240, maxWidth: 520 }} role="img"
          aria-label={c.public_mood.map((r) => `${r.mood_score} 分 ${r.n} 篇`).join('、')}>
          {c.public_mood.map((r) => (
            <div key={r.mood_score} title={`${r.mood_score} 分（${MOOD_LABEL[r.mood_score - 1]}）：${r.n.toLocaleString()} 篇`}>
              <span className="track">
                <span className="num">{r.n.toLocaleString()}</span>
                <i style={{ '--v': r.n / maxMood }} />
              </span>
              <span>{r.mood_score} 分<br />{MOOD_LABEL[r.mood_score - 1]}</span>
            </div>
          ))}
        </div>
      </section>

      <h2 className="section-title">發文時段</h2>
      <section className="glass panel stack">
        <div>
          <h3 className="heading">公開日記的發布時間</h3>
          <p className="small muted num">
            期間內共 {heatTotal.toLocaleString()} 篇
            {peak && `，最多的時段是週${'一二三四五六日'[peak.dow - 1]} ${peak.hour} 時（${peak.n} 篇）`}
          </p>
        </div>
        {heatTotal === 0 ? <p className="muted small">這段期間沒有資料。</p> : <Heatmap cells={x.publish_heatmap} />}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------
const KINDS = {
  entries: { label: '日記', key: 'entry_id', list: 'entries', on: 'active', off: 'hidden' },
  comments: { label: '日記留言', key: 'comment_id', list: 'comments', on: 'visible', off: 'hidden' },
  guestbook: { label: '留言板', key: 'guestbook_id', list: 'messages', on: 'visible', off: 'hidden' },
};

function Content() {
  const { fail, toast, confirm } = useFeedback();
  const [kind, setKind] = useState('entries');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const k = KINDS[kind];
  const list = usePaged(
    async (page) => {
      const r = await api.get(`/operator/${kind}${qs({ status: status === 'on' ? k.on : status === 'off' ? k.off : '', q: kind === 'entries' ? term : '', page })}`);
      return { items: r[k.list], has_more: r.has_more };
    },
    [kind, status, term],
  );

  const setItemStatus = async (item, hide) => {
    if (hide && !(await confirm({
      title: `隱藏這${kind === 'entries' ? '篇日記' : '則訊息'}？`,
      body: '隱藏後只有作者本人看得到。', confirmLabel: '隱藏', danger: true,
    }))) return;
    try {
      await api.put(`/operator/${kind}/${item[k.key]}/status`, { status: hide ? k.off : k.on });
      toast(hide ? '已隱藏' : '已解除隱藏');
      list.reload();
    } catch (err) { fail(err); }
  };
  const removeItem = async (item) => {
    if (!(await confirm({
      title: `永久刪除這${kind === 'entries' ? '篇日記' : '則訊息'}？`,
      body: '刪除後作者與其他人都無法再看到，也無法復原。', confirmLabel: '永久刪除', danger: true,
    }))) return;
    try {
      await api.del(`/operator/${kind}/${item[k.key]}`);
      toast('已刪除');
      list.setItems((items) => items.filter((x) => x[k.key] !== item[k.key]));
    } catch (err) { fail(err); }
  };

  return (
    <div className="stack">
      <div className="row is-between">
        <Segmented label="內容種類" value={kind} onChange={(v) => { setKind(v); setStatus(''); }}
          options={Object.entries(KINDS).map(([value, o]) => ({ value, label: o.label }))} />
        <Segmented label="狀態" value={status} onChange={setStatus}
          options={[{ value: '', label: '全部' }, { value: 'on', label: '顯示中' }, { value: 'off', label: '已隱藏' }]} />
      </div>
      {kind === 'entries' && (
        <form className="row" onSubmit={(e) => { e.preventDefault(); setTerm(q.trim()); }}>
          <input className="input grow" type="search" placeholder="用標題搜尋公開日記" aria-label="用標題搜尋公開日記" value={q} onChange={(e) => setQ(e.target.value)} />
          <Button type="submit">搜尋</Button>
        </form>
      )}
      {list.loading ? <div className="skeleton" /> : list.items.length === 0 ? <Empty title="沒有符合的內容" /> : (
        <section className="glass" style={{ padding: 8 }}>
          {list.items.map((item) => {
            const hidden = item.status === k.off;
            return (
              <div key={item[k.key]} className="listrow" style={{ alignItems: 'flex-start' }}>
                <div className="grow stack" style={{ gap: 4 }}>
                  <div className="row is-tight">
                    {kind === 'entries' ? (
                      item.title === null
                        ? <b className="muted">（作者已改為私密，不顯示內容）</b>
                        : hidden ? <b>{item.title}</b> : <Link className="link" to={`/entry/${item.entry_id}`}>{item.title}</Link>
                    ) : <b>{item.nickname}</b>}
                    {hidden && <span className="badge is-danger">已隱藏</span>}
                  </div>
                  <p className="small clamp-2 prewrap">{kind === 'entries' ? item.excerpt : item.content}</p>
                  <p className="tiny muted">
                    {kind === 'entries' && `${item.author_nickname}（@${item.author_username}）· ${item.blog_name} · 公開於 ${formatTime(item.published_at)}${item.hidden_at ? ` · 隱藏於 ${formatTime(item.hidden_at)}` : ''}`}
                    {kind === 'comments' && `@${item.username} · 留言於「${item.entry_title}」· ${formatTime(item.created_at)}`}
                    {kind === 'guestbook' && `@${item.username} · 留言於空間「${item.blog_name}」· ${formatTime(item.created_at)}`}
                  </p>
                </div>
                <div className="row is-tight" style={{ flexWrap: 'nowrap' }}>
                  <Button className="is-small" onClick={() => setItemStatus(item, !hidden)}>
                    {hidden ? '解除隱藏' : '隱藏'}
                  </Button>
                  <Button className="is-small is-danger" onClick={() => removeItem(item)}>刪除</Button>
                </div>
              </div>
            );
          })}
        </section>
      )}
      <LoadMore show={list.more} busy={list.loadingMore} onClick={list.loadMore} />
    </div>
  );
}

// ---------------------------------------------------------------------
const ACCOUNT_LABEL = { active: '正常', suspended: '停權', deactivated: '已停用' };
const BLOG_LABEL = { active: '公開', hidden: '已隱藏', closed: '已關閉' };
const ACCOUNT_FILTERS = [
  { value: '', label: '全部' }, { value: 'active', label: '正常' },
  { value: 'suspended', label: '停權' }, { value: 'deactivated', label: '已停用' },
];
const ROLE_FILTERS = [{ value: '', label: '所有身分' }, { value: 'Operator', label: '營運者' }];

function AccountDetail({ userId, onChanged }) {
  const { user } = useAuth();
  const { fail, toast, confirm } = useFeedback();
  const detail = useData(() => api.get(`/operator/users/${userId}`), [userId]);
  if (detail.error) return <p className="small muted">{detail.error.message}</p>;
  if (!detail.data) return <div className="skeleton" style={{ minHeight: 140 }} />;
  const a = detail.data.account;
  const isSelf = a.user_id === user.user_id;
  const isOperator = a.roles.includes('Operator');
  const act = async ({ title, body, danger, run, done }) => {
    if (!(await confirm({ title, body, confirmLabel: '確定', danger }))) return;
    try { await run(); toast(done); detail.reload(); onChanged(); } catch (err) { fail(err); }
  };
  const counts = [
    ['公開日記', a.public_entries], ['私人日記', a.private_entries], ['被隱藏的日記', a.hidden_entries],
    ['留言', a.comments], ['被隱藏的留言', a.hidden_comments], ['追蹤者', a.followers], ['追蹤中', a.following],
  ];
  return (
    <div className="stack" style={{ padding: '8px 4px 16px' }}>
      <p className="small muted">
        {a.email} · 註冊於 {formatTime(a.created_at)}
        {a.last_published_at ? ` · 最近公開於 ${formatTime(a.last_published_at)}` : ' · 尚未公開過日記'}
      </p>
      <div className="detail-grid">
        {counts.map(([label, n]) => <div key={label}><span className="tiny">{label}</span><b className="num">{n.toLocaleString()}</b></div>)}
      </div>
      {detail.data.recent_public_entries.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          <span className="tiny">最近的公開日記</span>
          {detail.data.recent_public_entries.map((e) => (
            <div key={e.entry_id} className="row is-tight small">
              {e.status === 'active' && a.account_status === 'active' && a.blog_status === 'active'
                ? <Link className="link" to={`/entry/${e.entry_id}`}>{e.title}</Link> : <span>{e.title}</span>}
              {e.status === 'hidden' && <span className="badge is-danger">已隱藏</span>}
              <span className="tiny num">{formatTime(e.published_at)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="row is-tight">
        {a.blog_status !== 'closed' && (
          <Button className="is-small" onClick={() => (a.blog_status === 'active'
            ? act({ title: '隱藏這個空間？', body: '空間裡的日記與留言板會一併隱藏。', danger: true, done: '已隱藏空間',
              run: () => api.put(`/operator/blogs/${a.blog_id}/status`, { status: 'hidden' }) })
            : act({ title: '解除空間隱藏？', done: '已解除隱藏',
              run: () => api.put(`/operator/blogs/${a.blog_id}/status`, { status: 'active' }) }))}>
            {a.blog_status === 'active' ? '隱藏空間' : '解除空間隱藏'}
          </Button>
        )}
        {!isSelf && a.account_status !== 'deactivated' && (
          <Button className={`is-small ${a.account_status === 'active' ? 'is-danger' : ''}`} onClick={() => (a.account_status === 'active'
            ? act({ title: '停權這個帳號？', body: '這個帳號的公開內容會一併隱藏，本人只能唯讀。', danger: true, done: '已停權',
              run: () => api.put(`/operator/users/${a.user_id}/status`, { status: 'suspended' }) })
            : act({ title: '解除停權？', done: '已解除停權',
              run: () => api.put(`/operator/users/${a.user_id}/status`, { status: 'active' }) }))}>
            {a.account_status === 'active' ? '停權帳號' : '解除停權'}
          </Button>
        )}
        {!isSelf && (isOperator || a.account_status === 'active') && (
          <Button className="is-small" onClick={() => (isOperator
            ? act({ title: `撤銷 @${a.username} 的營運者身分？`, body: '對方會立即失去營運管理的權限。', danger: true, done: '已撤銷營運者身分',
              run: () => api.put(`/operator/users/${a.user_id}/roles`, { operator: false }) })
            : act({ title: `讓 @${a.username} 成為營運者？`, body: '對方可以隱藏與刪除公開內容、停權帳號，也能指派其他營運者。', done: '已授予營運者身分',
              run: () => api.put(`/operator/users/${a.user_id}/roles`, { operator: true }) }))}>
            {isOperator ? '撤銷營運者' : '設為營運者'}
          </Button>
        )}
        {isSelf && <span className="tiny">這是你自己的帳號，不能變更自己的狀態與身分。</span>}
      </div>
    </div>
  );
}

function Accounts() {
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState('');
  const [role, setRole] = useState('');
  const [open, setOpen] = useState(null);
  const list = usePaged(
    async (page) => {
      const r = await api.get(`/operator/blogs${qs({ q: term, account_status: status, role, page })}`);
      return { items: r.blogs, has_more: r.has_more };
    },
    [term, status, role],
  );
  // 詳情裡的操作完成後，只更新該列，不把清單捲回第一頁
  const refreshRow = async (userId) => {
    try {
      const { account: a } = await api.get(`/operator/users/${userId}`);
      list.setItems((items) => items.map((b) => (b.user_id === userId
        ? { ...b, blog_status: a.blog_status, account_status: a.account_status, roles: a.roles } : b)));
    } catch { /* 清單下次載入時會更新 */ }
  };

  return (
    <div className="stack">
      <form className="row" onSubmit={(e) => { e.preventDefault(); setTerm(q.trim()); }}>
        <input className="input grow" type="search" placeholder="用空間名稱、暱稱或帳號搜尋" aria-label="搜尋空間與帳號" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button type="submit">搜尋</Button>
      </form>
      <div className="row is-between">
        <Segmented label="帳號狀態" options={ACCOUNT_FILTERS} value={status} onChange={setStatus} />
        <Segmented label="身分" options={ROLE_FILTERS} value={role} onChange={setRole} />
      </div>
      {list.loading ? <div className="skeleton" /> : list.items.length === 0 ? <Empty title="沒有符合的帳號" /> : (
        <section className="glass panel table-wrap" style={{ padding: 12 }}>
          <table className="table">
            <thead><tr><th>帳號</th><th>空間</th><th className="is-right">公開日記</th><th>空間狀態</th><th>帳號狀態</th><th /></tr></thead>
            <tbody>
              {list.items.map((b) => (
                <Fragment key={b.blog_id}>
                  <tr className={open === b.user_id ? 'is-open' : ''}>
                    <td><b>{b.nickname}</b> <span className="muted tiny">@{b.username}</span>{b.roles.includes('Operator') && <span className="badge is-accent" style={{ marginLeft: 6 }}>營運者</span>}</td>
                    <td>{b.blog_status === 'active' && b.account_status === 'active'
                      ? <Link className="link" to={`/blog/${b.blog_id}`}>{b.blog_name}</Link> : b.blog_name}</td>
                    <td className="is-right num">{b.public_entry_count}</td>
                    <td><span className={`badge ${b.blog_status !== 'active' ? 'is-danger' : ''}`}>{BLOG_LABEL[b.blog_status]}</span></td>
                    <td><span className={`badge ${b.account_status !== 'active' ? 'is-danger' : ''}`}>{ACCOUNT_LABEL[b.account_status]}</span></td>
                    <td className="is-right">
                      <Button className="is-small" aria-expanded={open === b.user_id} onClick={() => setOpen(open === b.user_id ? null : b.user_id)}>
                        {open === b.user_id ? '收合' : '管理'}
                      </Button>
                    </td>
                  </tr>
                  {open === b.user_id && (
                    <tr className="is-open"><td colSpan={6}><AccountDetail userId={b.user_id} onChanged={() => refreshRow(b.user_id)} /></td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <LoadMore show={list.more} busy={list.loadingMore} onClick={list.loadMore} />
    </div>
  );
}

// ---------------------------------------------------------------------
function Catalog() {
  const { fail, toast } = useFeedback();
  const themes = useData(() => api.get('/operator/themes'), []);
  const tags = useData(() => api.get('/operator/tags'), []);
  const [theme, setTheme] = useState({ theme_name: '', style_key: '' });
  const [tag, setTag] = useState('');
  const [editing, setEditing] = useState(null); // { kind, id, text }

  const run = async (fn, reload, message) => {
    try { await fn(); reload(); if (message) toast(message); } catch (err) { fail(err); }
  };
  const usedKeys = new Set((themes.data?.themes || []).map((t) => t.style_key));
  const freeKeys = (themes.data?.style_keys || []).filter((k) => !usedKeys.has(k));

  const row = ({ kind, id, name, status, count, countLabel, extra, reload }) => (
    <div key={id} className="listrow" style={{ padding: '10px 0' }}>
      {editing?.kind === kind && editing.id === id ? (
        <form className="row grow is-tight" onSubmit={(e) => {
          e.preventDefault();
          run(() => api.put(`/operator/${kind}/${id}`, { [kind === 'themes' ? 'theme_name' : 'tag_name']: editing.text }), reload, '已更名');
          setEditing(null);
        }}>
          <input className="input grow" autoFocus required value={editing.text} aria-label="名稱" onChange={(e) => setEditing({ ...editing, text: e.target.value })} />
          <Button className="is-primary is-small" type="submit">儲存</Button>
          <Button className="is-quiet is-small" type="button" onClick={() => setEditing(null)}>取消</Button>
        </form>
      ) : (
        <>
          <div className="grow row is-tight">
            <b>{name}</b>{extra}
            {status === 'retired' && <span className="badge">已停用</span>}
            <span className="tiny muted num">{count.toLocaleString()} {countLabel}</span>
          </div>
          <Button className="is-quiet is-small" onClick={() => setEditing({ kind, id, text: name })}>更名</Button>
          <Button className="is-quiet is-small" onClick={() => run(
            () => api.put(`/operator/${kind}/${id}`, { status: status === 'active' ? 'retired' : 'active' }), reload,
            status === 'active' ? '已停用' : '已重新啟用')}>
            {status === 'active' ? '停用' : '重新啟用'}
          </Button>
        </>
      )}
    </div>
  );

  return (
    <div className="form-grid" style={{ alignItems: 'start' }}>
      <section className="glass panel stack">
        <h2 className="heading">主題</h2>
        {themes.loading ? <div className="skeleton" /> : (
          <div>
            {themes.data.themes.map((t) => (
              row({
                kind: 'themes', id: t.theme_id, name: t.theme_name, status: t.status, count: t.blog_count,
                countLabel: '個空間使用', extra: <span className="badge">{t.style_key}</span>, reload: themes.reload,
              })
            ))}
          </div>
        )}
        {freeKeys.length > 0 ? (
          <form className="row" onSubmit={(e) => {
            e.preventDefault();
            run(() => api.post('/operator/themes', { ...theme, style_key: theme.style_key || freeKeys[0] }), themes.reload, '已新增主題');
            setTheme({ theme_name: '', style_key: '' });
          }}>
            <input className="input grow" required maxLength={50} placeholder="新主題名稱" aria-label="新主題名稱" value={theme.theme_name} onChange={(e) => setTheme({ ...theme, theme_name: e.target.value })} />
            <select className="select" style={{ width: 130 }} aria-label="樣式" value={theme.style_key || freeKeys[0]} onChange={(e) => setTheme({ ...theme, style_key: e.target.value })}>
              {freeKeys.map((k) => <option key={k}>{k}</option>)}
            </select>
            <Button type="submit">新增</Button>
          </form>
        ) : <p className="tiny muted">所有已部署的樣式都已有對應主題。</p>}
      </section>

      <section className="glass panel stack">
        <h2 className="heading">標籤</h2>
        <form className="row" onSubmit={(e) => {
          e.preventDefault();
          run(() => api.post('/operator/tags', { tag_name: tag }), tags.reload, '已新增標籤');
          setTag('');
        }}>
          <input className="input grow" required maxLength={30} placeholder="新標籤名稱" aria-label="新標籤名稱" value={tag} onChange={(e) => setTag(e.target.value)} />
          <Button type="submit">新增</Button>
        </form>
        {tags.loading ? <div className="skeleton" /> : (
          <div style={{ maxHeight: 520, overflowY: 'auto', paddingRight: 8 }}>
            {tags.data.tags.map((t) => (
              row({
                kind: 'tags', id: t.tag_id, name: t.tag_name, status: t.status, count: t.usage_count,
                countLabel: '篇日記使用', reload: tags.reload,
              })
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------
function Analytics() {
  const [days, setDays] = useState(30);
  const data = useData(() => api.get(`/operator/analytics?days=${days}`), [days]);
  const d = data.data;
  if (data.error) return <Empty title="載入失敗">{data.error.message}</Empty>;
  if (!d) return <div className="skeleton" style={{ minHeight: 260 }} />;
  if (!d.available) {
    return <Empty title="尚未連線 MongoDB" />;
  }
  const c = d.conversion;
  const byDay = {};
  for (const r of d.daily) (byDay[r.day] ||= { day: r.day, search: 0, view: 0 })[r.type] = r.count;
  const dayRows = Object.values(byDay);
  const maxDay = Math.max(1, ...dayRows.map((r) => r.search + r.view));

  return (
    <div className="stack is-loose">
      <div className="row is-between">
        <span />
        <Segmented label="分析期間" options={RANGES} value={days} onChange={setDays} />
      </div>
      <div className="tiles">
        <div className="glass tile">
          <span className="small muted">搜尋後閱讀轉換率</span>
          <b className="num">{c.session_rate === null ? '—' : `${(c.session_rate * 100).toFixed(1)}%`}</b>
          <span className="tiny muted">搜尋後 {d.window_minutes} 分鐘內讀了至少一篇日記的工作階段比例</span>
        </div>
        <div className="glass tile"><span className="small muted">有搜尋的工作階段</span><b className="num">{c.sessions_with_search.toLocaleString()}</b><span className="tiny muted num">其中 {c.converted_sessions.toLocaleString()} 個有後續閱讀</span></div>
        <div className="glass tile"><span className="small muted">搜尋次數</span><b className="num">{c.searches.toLocaleString()}</b><span className="tiny muted num">其中 {c.converted_searches.toLocaleString()} 次帶來閱讀</span></div>
      </div>
      <div className="form-grid">
        <section className="glass panel stack">
          <h2 className="heading">熱門搜尋字</h2>
          {d.top_keywords.length === 0 ? <p className="muted small">這段期間沒有搜尋紀錄。</p> : <HBars rows={d.top_keywords} labelKey="keyword" valueKey="count" />}
        </section>
        <section className="glass panel stack">
          <h2 className="heading">每日事件數</h2>
          <p className="small muted">搜尋與瀏覽合計</p>
          {dayRows.length === 0 ? <p className="muted small">這段期間沒有事件。</p> : (
            <>
              <div className="bars" role="img" aria-label="每日搜尋與瀏覽事件數">
                {dayRows.map((r) => (
                  <div key={r.day} title={`${r.day}：搜尋 ${r.search} 次、瀏覽 ${r.view} 次`}><i style={{ height: `${((r.search + r.view) / maxDay) * 100}%` }} /></div>
                ))}
              </div>
              <div className="axis num"><span>{dayRows[0].day}</span><span>單日最多 {maxDay} 次</span><span>{dayRows.at(-1).day}</span></div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
