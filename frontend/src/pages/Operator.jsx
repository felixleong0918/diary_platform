import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatTime, qs } from '../api.js';
import { useAuth, useFeedback } from '../context.jsx';
import { useData, usePaged } from '../hooks.js';
import { Button, Empty, LoadMore, Segmented } from '../components/ui.jsx';

const TABS = [
  { value: 'stats', label: '營運統計' },
  { value: 'content', label: '公開內容' },
  { value: 'accounts', label: '空間與帳號' },
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
      {tab === 'stats' && <Stats />}
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
      {rows.map((r) => (
        <div key={r[labelKey]} className="hbar">
          <span className="clamp-2">{prefix}{r[labelKey]}</span>
          <div><i style={{ width: `${(r[valueKey] / max) * 100}%` }} /></div>
          <span className="num" style={{ textAlign: 'right' }}>{r[valueKey].toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

function Stats() {
  const [days, setDays] = useState(30);
  const stats = useData(() => api.get(`/operator/stats?days=${days}`), [days]);
  const d = stats.data;
  if (stats.error) return <Empty title="載入失敗">{stats.error.message}</Empty>;
  if (!d) return <div className="skeleton" style={{ minHeight: 320 }} />;
  const maxDaily = Math.max(1, ...d.new_public_entries.map((r) => r.entry_count));
  const totalNew = d.new_public_entries.reduce((s, r) => s + r.entry_count, 0);
  const maxWeekly = Math.max(1, ...d.weekly_active_authors.map((r) => r.active_authors));

  return (
    <div className="stack is-loose">
      <div className="tiles">
        <div className="glass tile"><span className="small muted">帳號</span><b className="num">{d.totals.accounts.toLocaleString()}</b></div>
        <div className="glass tile"><span className="small muted">目前可讀的公開日記</span><b className="num">{d.totals.public_entries.toLocaleString()}</b></div>
        <div className="glass tile"><span className="small muted">被隱藏的日記</span><b className="num">{d.totals.hidden_entries.toLocaleString()}</b></div>
        <div className="glass tile"><span className="small muted">停權中的帳號</span><b className="num">{d.totals.suspended_accounts.toLocaleString()}</b></div>
      </div>

      <section className="glass panel stack">
        <div className="row is-between">
          <div>
            <h2 className="heading">新增公開日記</h2>
            <p className="small muted num">最近 {d.days} 天共 {totalNew.toLocaleString()} 篇</p>
          </div>
          <Segmented label="統計期間" options={RANGES} value={days} onChange={setDays} />
        </div>
        <div className="bars" role="img" aria-label={`最近 ${d.days} 天每日新增公開日記篇數`}>
          {d.new_public_entries.map((r) => (
            <div key={r.day} title={`${r.day}：${r.entry_count} 篇`}><i style={{ height: `${(r.entry_count / maxDaily) * 100}%` }} /></div>
          ))}
        </div>
        <div className="axis num"><span>{d.new_public_entries[0].day}</span><span>單日最多 {maxDaily} 篇</span><span>{d.new_public_entries.at(-1).day}</span></div>
      </section>

      <div className="form-grid">
        <section className="glass panel stack">
          <h2 className="heading">熱門標籤</h2>
          <p className="small muted">期間內公開的日記所使用的標籤</p>
          {d.hot_tags.length === 0 ? <p className="muted small">這段期間沒有資料。</p> : <HBars rows={d.hot_tags} labelKey="tag_name" valueKey="entry_count" prefix="#" />}
        </section>
        <section className="glass panel stack">
          <h2 className="heading">每週活躍作者</h2>
          <p className="small muted">該週至少公開一篇日記的作者數（最近 8 週）</p>
          <div className="bars is-labelled" style={{ height: 300 }} role="img" aria-label="最近八週的活躍作者數">
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
      </div>

      <section className="glass panel stack">
        <h2 className="heading">公開日記互動量</h2>
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
                <Button className={`is-small ${hidden ? '' : 'is-danger'}`} onClick={() => setItemStatus(item, !hidden)}>
                  {hidden ? '解除隱藏' : '隱藏'}
                </Button>
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

function Accounts() {
  const { user } = useAuth();
  const { fail, toast, confirm } = useFeedback();
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const list = usePaged(
    async (page) => {
      const r = await api.get(`/operator/blogs${qs({ q: term, page })}`);
      return { items: r.blogs, has_more: r.has_more };
    },
    [term],
  );
  const act = async (title, body, url, status) => {
    if (!(await confirm({ title, body, confirmLabel: '確定', danger: status === 'hidden' || status === 'suspended' }))) return;
    try { await api.put(url, { status }); toast('已更新'); list.reload(); } catch (err) { fail(err); }
  };

  return (
    <div className="stack">
      <form className="row" onSubmit={(e) => { e.preventDefault(); setTerm(q.trim()); }}>
        <input className="input grow" type="search" placeholder="用空間名稱、暱稱或帳號搜尋" aria-label="搜尋空間與帳號" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button type="submit">搜尋</Button>
      </form>
      {list.loading ? <div className="skeleton" /> : list.items.length === 0 ? <Empty title="沒有符合的空間" /> : (
        <section className="glass panel table-wrap" style={{ padding: 12 }}>
          <table className="table">
            <thead><tr><th>空間</th><th>擁有者</th><th className="is-right">公開日記</th><th>空間</th><th>帳號</th><th /></tr></thead>
            <tbody>
              {list.items.map((b) => (
                <tr key={b.blog_id}>
                  <td>{b.blog_status === 'active' && b.account_status === 'active'
                    ? <Link className="link" to={`/blog/${b.blog_id}`}>{b.blog_name}</Link> : <b>{b.blog_name}</b>}</td>
                  <td>{b.nickname} <span className="muted tiny">@{b.username}</span>{b.roles.includes('Operator') && <span className="badge is-accent" style={{ marginLeft: 6 }}>營運者</span>}</td>
                  <td className="is-right num">{b.public_entry_count}</td>
                  <td><span className={`badge ${b.blog_status !== 'active' ? 'is-danger' : ''}`}>{BLOG_LABEL[b.blog_status]}</span></td>
                  <td><span className={`badge ${b.account_status !== 'active' ? 'is-danger' : ''}`}>{ACCOUNT_LABEL[b.account_status]}</span></td>
                  <td className="is-right">
                    <div className="row is-tight" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                      {b.blog_status !== 'closed' && (
                        <Button className="is-small" onClick={() => (b.blog_status === 'active'
                          ? act('隱藏這個空間？', '空間裡的日記與留言板會一併隱藏。', `/operator/blogs/${b.blog_id}/status`, 'hidden')
                          : act('解除空間隱藏？', null, `/operator/blogs/${b.blog_id}/status`, 'active'))}>
                          {b.blog_status === 'active' ? '隱藏空間' : '解除隱藏'}
                        </Button>
                      )}
                      {b.account_status !== 'deactivated' && b.user_id !== user.user_id && (
                        <Button className="is-small" onClick={() => (b.account_status === 'active'
                          ? act('停權這個帳號？', '這個帳號的公開內容會一併隱藏。', `/operator/users/${b.user_id}/status`, 'suspended')
                          : act('解除停權？', null, `/operator/users/${b.user_id}/status`, 'active'))}>
                          {b.account_status === 'active' ? '停權' : '解除停權'}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
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
