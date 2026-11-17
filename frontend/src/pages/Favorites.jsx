import { Link } from 'react-router-dom';
import { api, formatTime, qs } from '../api.js';
import { useFeedback } from '../context.jsx';
import { usePaged } from '../hooks.js';
import Icon from '../components/Icon.jsx';
import { Button, Empty, EntryCard, LoadMore, Skeletons } from '../components/ui.jsx';

export default function Favorites() {
  const { fail, toast } = useFeedback();
  const favorites = usePaged(
    async (page) => {
      const r = await api.get(`/me/favorites${qs({ page })}`);
      return { items: r.favorites, has_more: r.has_more };
    },
    [],
  );
  const remove = async (entryId) => {
    try {
      await api.del(`/entries/${entryId}/favorite`);
      favorites.setItems((items) => items.filter((f) => f.entry_id !== entryId));
      toast('已取消收藏');
    } catch (err) { fail(err); }
  };

  return (
    <main className="page is-narrow stack is-loose">
      <header className="stack" style={{ gap: 6 }}>
        <h1 className="title">收藏的日記</h1>
      </header>
      {favorites.loading ? <Skeletons count={3} /> : favorites.items.length === 0 ? (
        <Empty title="還沒有收藏"><Link className="link" to="/">到探索頁逛逛</Link>，在喜歡的日記按下收藏。</Empty>
      ) : (
        <div className="feed">
          {favorites.items.map((f) => (f.available ? (
            <EntryCard key={f.entry_id} entry={f} />
          ) : (
            // 改為私密、被隱藏或已移除：保留收藏關聯，但不顯示標題、摘要或照片
            <div key={f.entry_id} className="story is-unavailable">
              <div className="story-meta"><Icon name="lock" size={14} /><span>收藏於 {formatTime(f.favorited_at)}</span></div>
              <div>
                <h3 className="story-title">內容目前無法瀏覽</h3>
              </div>
              <Button className="is-small" onClick={() => remove(f.entry_id)}>取消收藏</Button>
            </div>
          )))}
        </div>
      )}
      <LoadMore show={favorites.more} busy={favorites.loadingMore} onClick={favorites.loadMore} />
    </main>
  );
}
