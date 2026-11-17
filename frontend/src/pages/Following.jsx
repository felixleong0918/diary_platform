import { Link } from 'react-router-dom';
import { api, qs } from '../api.js';
import { useFeedback } from '../context.jsx';
import { useData, usePaged } from '../hooks.js';
import { Avatar, Button, Empty, EntryCard, LoadMore, Skeletons } from '../components/ui.jsx';

export default function Following() {
  const { fail, toast } = useFeedback();
  const following = useData(() => api.get('/me/following'), []);
  const feed = usePaged(
    async (page) => {
      const r = await api.get(`/me/feed${qs({ page })}`);
      return { items: r.entries, has_more: r.has_more };
    },
    [],
  );
  const unfollow = async (blogId) => {
    try {
      await api.del(`/blogs/${blogId}/follow`);
      toast('已取消追蹤');
      following.reload();
      feed.reload();
    } catch (err) { fail(err); }
  };
  const list = following.data?.following || [];

  return (
    <main className="page stack is-loose">
      <header className="stack" style={{ gap: 6 }}>
        <h1 className="title">追蹤</h1>
        <p className="muted">追蹤的空間最近公開的日記。</p>
      </header>
      <div className="split">
        <section className="stack">
          {feed.loading ? <Skeletons count={4} /> : feed.items.length === 0 ? (
            <Empty title={list.length === 0 ? '還沒有追蹤任何空間' : '追蹤的空間最近沒有公開日記'}>
              <Link className="link" to="/">到探索頁找找看</Link>
            </Empty>
          ) : (
            <div className="feed">{feed.items.map((e) => <EntryCard key={e.entry_id} entry={e} />)}</div>
          )}
          <LoadMore show={feed.more} busy={feed.loadingMore} onClick={feed.loadMore} />
        </section>
        <aside><div className="stack">
          <h2 className="heading">追蹤中 <span className="muted num">{list.length}</span></h2>
          {following.loading ? <div className="skeleton" /> : list.length === 0 ? (
            <p className="muted small">還沒有追蹤任何空間。</p>
          ) : (
            <div>
              {list.map((b) => (
                <div key={b.blog_id} className="listrow" style={{ padding: '12px 0', gap: 12 }}>
                  {b.available ? (
                    <Link to={`/blog/${b.blog_id}`} className="row grow is-tight" style={{ flexWrap: 'nowrap' }}>
                      <Avatar name={b.owner_nickname} />
                      <span className="grow">
                        <b style={{ display: 'block' }}>{b.blog_name}</b>
                        <span className="tiny muted num">{b.owner_nickname} · {b.public_entry_count} 篇公開</span>
                      </span>
                    </Link>
                  ) : (
                    <div className="grow">
                      <b>空間目前無法瀏覽</b>
                    </div>
                  )}
                  <Button className="is-quiet is-small" onClick={() => unfollow(b.blog_id)}>取消追蹤</Button>
                </div>
              ))}
            </div>
          )}
        </div></aside>
      </div>
    </main>
  );
}
