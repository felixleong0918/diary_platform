import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, qs } from '../api.js';
import { useAuth, useFeedback, usePageStyle } from '../context.jsx';
import { useData, usePaged } from '../hooks.js';
import Icon from '../components/Icon.jsx';
import Messages from '../components/Messages.jsx';
import { Avatar, Button, Empty, EntryCard, Field, LoadMore, Segmented, Skeletons } from '../components/ui.jsx';
import SongPlayer from '../components/SongPlayer.jsx';
import { ThemeArt } from '../components/Art.jsx';

export default function Blog() {
  const { blogId } = useParams();
  const { user, isSuspended } = useAuth();
  const { fail, toast } = useFeedback();
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get('tab') === 'guestbook' ? 'guestbook' : 'entries');
  const [filter, setFilter] = useState({ category_no: '', from: '', to: '' });
  const [followBusy, setFollowBusy] = useState(false);

  const blog = useData(() => api.get(`/blogs/${blogId}`), [blogId, user?.user_id]);
  usePageStyle(blog.data?.blog.style_key);

  const entries = usePaged(
    async (page) => {
      const r = await api.get(`/blogs/${blogId}/entries${qs({ ...filter, page })}`);
      return { items: r.entries, has_more: r.has_more };
    },
    [blogId, filter.category_no, filter.from, filter.to],
  );
  const guestbook = usePaged(
    async (page) => {
      const r = await api.get(`/blogs/${blogId}/guestbook${qs({ page })}`);
      return { items: r.messages, has_more: r.has_more };
    },
    [blogId, user?.user_id],
  );

  if (blog.loading) return <main className="page"><div className="skeleton" style={{ minHeight: 220 }} /></main>;
  if (blog.error) {
    return <main className="page is-narrow"><Empty title="內容目前無法瀏覽" /></main>;
  }
  const b = blog.data.blog;
  const categories = blog.data.categories.filter((c) => c.public_entry_count > 0);

  const toggleFollow = async () => {
    setFollowBusy(true);
    try {
      const r = b.is_following ? await api.del(`/blogs/${blogId}/follow`) : await api.post(`/blogs/${blogId}/follow`);
      blog.setData((d) => ({
        ...d,
        blog: { ...d.blog, is_following: r.is_following, follower_count: d.blog.follower_count + (r.is_following ? 1 : -1) },
      }));
      toast(r.is_following ? '已追蹤這個空間' : '已取消追蹤');
    } catch (err) { fail(err); } finally { setFollowBusy(false); }
  };
  const hasFilter = filter.category_no || filter.from || filter.to;

  return (
    <main className="page stack is-loose">
      <header className="glass theme-tile panel is-roomy stack center" style={{ padding: '56px 24px 48px', gap: 12 }}>
        <ThemeArt pattern={b.cover_pattern} />
        {b.is_owner && b.status !== 'active' && (
          <div className="notice is-danger"><Icon name="eyeoff" />這個空間已被營運者隱藏。</div>
        )}
        <div className="stack center" style={{ position: 'relative', gap: 12 }}>
        <Avatar name={b.owner_nickname} src={b.owner_avatar} size="is-large" />
        {b.owner_status_text && <p className="status-bubble">{b.owner_status_text}</p>}
        <h1 className="title" data-font={b.title_font}>{b.blog_name}</h1>
        {b.tagline && <p className="tagline">{b.tagline}</p>}
        <p className="lede" style={{ fontSize: 18 }}>{b.owner_nickname} · @{b.owner_username}</p>
        {b.description && <p className="muted prewrap" style={{ maxWidth: 560 }}>{b.description}</p>}
        <SongPlayer title={b.song_title} url={b.song_url} autoplay className="is-on-tint" />
        <p className="tiny num">{b.public_entry_count} 篇公開日記 · {b.follower_count} 人追蹤 · 主題「{b.theme_name}」</p>
        <div className="row" style={{ marginTop: 8, justifyContent: 'center' }}>
          {b.is_owner ? (
            <Link to="/settings" className="btn is-outline is-large">管理空間</Link>
          ) : user ? (
            <Button className={`is-large ${b.is_following ? 'is-on' : 'is-primary'}`} busy={followBusy} disabled={isSuspended && !b.is_following} onClick={toggleFollow}>
              {b.is_following ? <><Icon name="check" size={17} />追蹤中</> : '追蹤'}
            </Button>
          ) : (
            <Link to="/login" className="btn is-primary is-large">登入後追蹤</Link>
          )}
        </div>
        </div>
      </header>

      <div className="row is-between">
        <Segmented
          label="空間內容" value={tab} onChange={setTab}
          options={[{ value: 'entries', label: '日記' }, { value: 'guestbook', label: '留言板' }]}
        />
      </div>

      {tab === 'entries' ? (
        <div className="split">
          <section className="stack">
            {entries.loading ? <Skeletons /> : entries.items.length === 0 ? (
              <Empty title={hasFilter ? '這個條件下沒有公開日記' : '這個空間還沒有公開日記'}>
              </Empty>
            ) : (
              <div className="feed">
                {entries.items.map((e) => <EntryCard key={e.entry_id} entry={e} showAuthor={false} />)}
              </div>
            )}
            <LoadMore show={entries.more} busy={entries.loadingMore} onClick={entries.loadMore} />
          </section>
          <aside>
            {categories.length > 0 && (
              <div className="stack">
                <h2 className="heading">分類</h2>
                <div className="row is-tight">
                  <button className={`chip ${filter.category_no === '' ? 'is-active' : ''}`} onClick={() => setFilter((f) => ({ ...f, category_no: '' }))}>全部</button>
                  {categories.map((c) => (
                    <button
                      key={c.category_no} className={`chip ${String(filter.category_no) === String(c.category_no) ? 'is-active' : ''}`}
                      onClick={() => setFilter((f) => ({ ...f, category_no: c.category_no }))}
                    >
                      {c.category_name}<span className="num" style={{ opacity: 0.6 }}>{c.public_entry_count}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="stack">
              <h2 className="heading">日期</h2>
              <Field label="從">
                <input className="input" type="date" value={filter.from} max={filter.to || undefined} onChange={(e) => setFilter((f) => ({ ...f, from: e.target.value }))} />
              </Field>
              <Field label="到">
                <input className="input" type="date" value={filter.to} min={filter.from || undefined} onChange={(e) => setFilter((f) => ({ ...f, to: e.target.value }))} />
              </Field>
              {hasFilter && (
                <div><Button className="is-small" onClick={() => setFilter({ category_no: '', from: '', to: '' })}>清除篩選</Button></div>
              )}
            </div>
          </aside>
        </div>
      ) : (
        <section className="stack" style={{ maxWidth: 720 }}>
          <h2 className="heading">留言板</h2>
          {guestbook.loading ? <div className="skeleton" /> : (
            <Messages
              kind="guestbook" items={guestbook.items} postUrl={`/blogs/${blogId}/guestbook`} onChanged={guestbook.reload}
              notice="留言板是公開的，所有人都看得到。"
              emptyText="還沒有人留言。"
            />
          )}
          <LoadMore show={guestbook.more} busy={guestbook.loadingMore} onClick={guestbook.loadMore} />
        </section>
      )}
    </main>
  );
}
