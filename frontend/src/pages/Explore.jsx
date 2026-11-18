import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, qs } from '../api.js';
import { useAuth } from '../context.jsx';
import { usePaged, useData } from '../hooks.js';
import Icon from '../components/Icon.jsx';
import { Avatar, Empty, EntryCard, LoadMore, Segmented, Skeletons } from '../components/ui.jsx';
import { HeroArt } from '../components/Art.jsx';
import Typewriter from '../components/Typewriter.jsx';
import { HERO_LINES } from '../heroLines.js';

const MODES = [
  { value: 'q', label: '標題', placeholder: '用標題關鍵字找公開日記' },
  { value: 'author', label: '作者', placeholder: '輸入作者的暱稱或帳號' },
  { value: 'tag', label: '標籤', placeholder: '輸入完整的標籤名稱' },
];

const SORTS = [{ value: 'latest', label: '最新' }, { value: 'hot', label: '熱門' }];

export default function Explore() {
  const { user, ready } = useAuth();
  const [params, setParams] = useSearchParams();
  const mode = MODES.find((m) => params.has(m.value))?.value || 'q';
  const term = params.get(mode) || '';
  const sort = params.get('sort') === 'hot' ? 'hot' : 'latest';
  const [draftMode, setDraftMode] = useState(mode);
  const [draft, setDraft] = useState(term);
  useEffect(() => { setDraftMode(mode); setDraft(term); }, [mode, term]);

  const entries = usePaged(
    async (page) => {
      const r = await api.get(`/entries${qs({ [mode]: term, sort: sort === 'hot' ? 'hot' : '', page })}`);
      return { items: r.entries, has_more: r.has_more };
    },
    [mode, term, sort],
  );
  const tags = useData(() => api.get('/tags/popular'), []);
  const blogs = useData(() => api.get('/blogs?size=6'), []);

  const search = (e) => {
    e.preventDefault();
    const value = draft.trim();
    setParams({ ...(value ? { [draftMode]: value } : {}), ...(sort === 'hot' ? { sort } : {}) });
  };
  // 切換排序時保留目前的搜尋條件
  const setSort = (next) => setParams({ ...(term ? { [mode]: term } : {}), ...(next === 'hot' ? { sort: 'hot' } : {}) });
  const current = MODES.find((m) => m.value === draftMode);

  return (
    <>
      {!term && (
        <section className="hero">
          <div className="hero-inner">
            <div className="hero-copy">
              <h1 className="display"><Typewriter lines={HERO_LINES} /></h1>
              <p className="lede">寫給自己的日記，也可以是分享給別人的故事。</p>
              {ready && (
                <Link to={user ? '/write' : '/register'} className="btn is-primary is-large">
                  {user ? '寫今天的日記' : '開始寫日記'}
                </Link>
              )}
            </div>
            <div className="hero-art"><HeroArt /></div>
          </div>
        </section>
      )}

      <main className="page split">
        <section className="stack is-loose">
          <form className="searchbar" onSubmit={search} role="search">
            <Icon name="search" size={18} />
            <input
              type="search" value={draft} placeholder={current.placeholder} aria-label="搜尋公開日記"
              onChange={(e) => setDraft(e.target.value)}
            />
            <Segmented label="搜尋範圍" options={MODES} value={draftMode} onChange={setDraftMode} />
          </form>
          <div className="row is-between" style={{ alignItems: 'baseline', borderBottom: '1px solid var(--hairline)', paddingBottom: 12 }}>
            <div className="row is-tight" style={{ alignItems: 'baseline' }}>
              <h2 className="heading">{term ? `「${term}」的搜尋結果` : sort === 'hot' ? '最近熱門' : '最近公開'}</h2>
              {term && <Link className="link small" to={sort === 'hot' ? '/?sort=hot' : '/'}>清除搜尋</Link>}
            </div>
            <Segmented label="排序方式" options={SORTS} value={sort} onChange={setSort} />
          </div>
          {entries.loading ? <Skeletons count={4} /> : entries.error ? (
            <Empty title="載入失敗">{entries.error.message}</Empty>
          ) : entries.items.length === 0 ? (
            <Empty title={term ? '沒有符合的公開日記' : sort === 'hot' ? '最近 30 天沒有公開日記' : '還沒有公開日記'}>
              {term ? '換個關鍵字，或改用作者、標籤搜尋。' : sort === 'hot' ? '切換到「最新」看看較早的日記。' : '成為第一個公開分享的人。'}
            </Empty>
          ) : (
            <div className="feed">
              {entries.items.map((e) => <EntryCard key={e.entry_id} entry={e} />)}
            </div>
          )}
          <LoadMore show={entries.more} busy={entries.loadingMore} onClick={entries.loadMore} />
        </section>

        <aside>
          {tags.data?.tags.length > 0 && (
            <div className="stack">
              <h2 className="heading">熱門標籤</h2>
              <div className="row is-tight">
                {tags.data.tags.slice(0, 12).map((t) => (
                  <Link
                    key={t.tag_id} to={`/?tag=${encodeURIComponent(t.tag_name)}`}
                    className={`chip ${mode === 'tag' && term === t.tag_name ? 'is-active' : ''}`}
                  >
                    {t.tag_name}
                  </Link>
                ))}
              </div>
            </div>
          )}
          {(blogs.data?.blogs || []).length > 0 && (
            <div className="stack">
              <h2 className="heading">公開空間</h2>
              <div className="stack" style={{ gap: 18 }}>
                {blogs.data.blogs.map((b) => (
                  <Link key={b.blog_id} to={`/blog/${b.blog_id}`} className="row" style={{ flexWrap: 'nowrap' }}>
                    <Avatar name={b.owner_nickname} />
                    <span className="grow">
                      <b style={{ display: 'block', fontSize: 15 }}>{b.blog_name}</b>
                      <span className="tiny num">{b.public_entry_count} 篇公開 · {b.follower_count} 人追蹤</span>
                    </span>
                    <span className="btn is-small">看看</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </aside>
      </main>
    </>
  );
}
