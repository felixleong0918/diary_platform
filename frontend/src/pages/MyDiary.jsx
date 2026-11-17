import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../api.js';
import { useAuth } from '../context.jsx';
import { useData, usePaged } from '../hooks.js';
import Icon from '../components/Icon.jsx';
import { Empty, Field, LoadMore, Mood, Skeletons, StatusBadges } from '../components/ui.jsx';

const monthLabel = (m) => `${m.slice(0, 4)} 年 ${Number(m.slice(5))} 月`;

export default function MyDiary() {
  const { user, isSuspended } = useAuth();
  const [filter, setFilter] = useState({ month: '', category_no: '', tag_id: '' });
  const [stats, setStats] = useState(null);

  const review = useData(() => api.get('/me/review/monthly'), []);
  const space = useData(() => api.get('/me/space'), []);
  const entries = usePaged(
    async (page) => {
      const r = await api.get(`/me/entries${qs({ ...filter, page })}`);
      setStats(r.stats);
      return { items: r.entries, has_more: r.has_more };
    },
    [filter.month, filter.category_no, filter.tag_id],
  );

  const months = [...(review.data?.months || [])].slice(0, 12).reverse();
  const maxCount = Math.max(1, ...months.map((m) => m.entry_count));
  const hasFilter = filter.month || filter.category_no || filter.tag_id;
  const set = (name, value) => setFilter((f) => ({ ...f, [name]: value }));

  return (
    <main className="page stack is-loose">
      <header className="row is-between" style={{ alignItems: 'flex-end' }}>
        <div className="stack" style={{ gap: 6 }}>
          <h1 className="title">我的日記</h1>
        </div>
        <div className="row is-tight">
          <Link to={`/blog/${user.blog_id}`} className="btn"><Icon name="globe" size={17} />看公開空間</Link>
          <Link to="/settings" className="btn"><Icon name="gear" size={17} />設定</Link>
        </div>
      </header>

      {isSuspended && (
        <div className="notice is-danger"><Icon name="info" />帳號已被停權，目前只能瀏覽。</div>
      )}

      <section className="split">
        <div className="glass panel stack">
          <div className="row is-between">
            <h2 className="heading">每月篇數</h2>
            
          </div>
          {review.loading ? <div className="skeleton" /> : months.length === 0 ? (
            <p className="muted small">寫下第一篇日記後，這裡會出現每個月的紀錄。</p>
          ) : (
            <div className="bars is-labelled" role="group" aria-label="最近十二個月的日記篇數">
              {months.map((m) => (
                <div key={m.month}>
                  <button
                    className={!filter.month || filter.month === m.month ? 'is-active' : ''}
                    aria-pressed={filter.month === m.month}
                    title={`${monthLabel(m.month)}：${m.entry_count} 篇，平均心情 ${m.avg_mood.toFixed(1)}`}
                    onClick={() => set('month', filter.month === m.month ? '' : m.month)}
                  >
                    <span className="track">
                      <span className="num">{m.entry_count}</span>
                      <i style={{ '--v': m.entry_count / maxCount }} />
                    </span>
                  </button>
                  <span className="num">{Number(m.month.slice(5))} 月</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="stack">
          <div className="glass tile">
            <span className="small muted">{filter.month ? monthLabel(filter.month) : hasFilter ? '符合條件' : '全部'}篇數</span>
            <b className="num">{stats ? stats.entry_count.toLocaleString() : '—'}</b>
          </div>
          <div className="glass tile">
            <span className="small muted">平均心情分數</span>
            <b className="num">{stats?.avg_mood != null ? stats.avg_mood.toFixed(2) : '—'}<span className="small muted" style={{ fontWeight: 500 }}> / 5</span></b>
          </div>
        </div>
      </section>

      <section className="glass is-flat panel row" style={{ padding: 16 }}>
        <Field label="月份">
          <select className="select" value={filter.month} onChange={(e) => set('month', e.target.value)}>
            <option value="">全部月份</option>
            {(review.data?.months || []).map((m) => <option key={m.month} value={m.month}>{monthLabel(m.month)}（{m.entry_count}）</option>)}
          </select>
        </Field>
        <Field label="分類">
          <select className="select" value={filter.category_no} onChange={(e) => set('category_no', e.target.value)}>
            <option value="">全部分類</option>
            <option value="none">未分類</option>
            {(space.data?.categories || []).map((c) => (
              <option key={c.category_no} value={c.category_no}>{c.category_name}{c.status === 'retired' ? '（已停用）' : ''}</option>
            ))}
          </select>
        </Field>
        <Field label="標籤">
          <select className="select" value={filter.tag_id} onChange={(e) => set('tag_id', e.target.value)}>
            <option value="">全部標籤</option>
            {(review.data?.tags || []).map((t) => <option key={t.tag_id} value={t.tag_id}>#{t.tag_name}（{t.entry_count}）</option>)}
          </select>
        </Field>
        {hasFilter && (
          <button className="btn is-quiet" style={{ alignSelf: 'flex-end' }} onClick={() => setFilter({ month: '', category_no: '', tag_id: '' })}>清除篩選</button>
        )}
      </section>

      {entries.loading ? <Skeletons count={3} grid={false} /> : entries.items.length === 0 ? (
        <Empty title={hasFilter ? '這個條件下沒有日記' : '還沒有日記'}>
          {hasFilter ? '調整月份、分類或標籤再試一次。' : <Link className="link" to="/write">寫下第一篇</Link>}
        </Empty>
      ) : (
        <section className="glass" style={{ padding: 8 }}>
          {entries.items.map((e) => {
            const [, mm, dd] = e.entry_date.split('-');
            return (
              <Link key={e.entry_id} to={`/entry/${e.entry_id}`} className="listrow">
                <div className="datebox"><b className="num">{Number(dd)}</b><span className="num">{e.entry_date.slice(0, 4)}.{mm}</span></div>
                <div className="grow stack" style={{ gap: 4 }}>
                  <div className="row is-tight">
                    <b style={{ fontSize: 17 }}>{e.title}</b>
                    <StatusBadges entry={e} />
                    {e.visibility === 'public' && e.status === 'active' && <span className="badge is-accent">公開</span>}
                  </div>
                  <p className="muted small clamp-2">{e.excerpt}</p>
                  <div className="row is-tight tiny muted">
                    {e.category_name && <span>{e.category_name}</span>}
                    {e.tags.map((t) => <span key={t.tag_id}>#{t.tag_name}</span>)}
                  </div>
                </div>
                <div className="stack" style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Mood score={e.mood_score} />
                  <span className="tiny muted num row is-tight" style={{ gap: 10, flexWrap: 'nowrap' }}>
                    <span className="row" style={{ gap: 4 }}><Icon name="chat" size={13} />{e.comment_count}</span>
                    <span className="row" style={{ gap: 4 }}><Icon name="heart" size={13} />{e.favorite_count}</span>
                  </span>
                </div>
              </Link>
            );
          })}
        </section>
      )}
      <LoadMore show={entries.more} busy={entries.loadingMore} onClick={entries.loadMore} />
    </main>
  );
}
