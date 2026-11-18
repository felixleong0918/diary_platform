import { useEffect } from 'react';
import { api } from '../api.js';
import { usePaged } from '../hooks.js';
import { Empty, LoadMore, Skeletons } from '../components/ui.jsx';
import NotificationItem from '../components/NotificationItem.jsx';

export default function Notifications({ myBlogId, onRead }) {
  const list = usePaged(
    async (page) => {
      const r = await api.get(`/me/notifications?page=${page}`);
      return { items: r.notifications, has_more: r.has_more };
    },
    [],
  );
  // 清單載入後標為已讀；這次畫面上仍保留未讀的標示
  useEffect(() => {
    if (list.loading) return;
    api.post('/me/notifications/read').then(onRead).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.loading]);

  return (
    <main className="page is-narrow stack is-loose">
      <h1 className="title">通知</h1>
      {list.loading ? <Skeletons /> : list.items.length === 0 ? <Empty title="還沒有通知">有人留言、回應、收藏或追蹤時會出現在這裡。</Empty> : (
        <div>
          {list.items.map((n) => <NotificationItem key={n.notification_id} n={n} myBlogId={myBlogId} />)}
        </div>
      )}
      <LoadMore show={list.more} busy={list.loadingMore} onClick={list.loadMore} />
    </main>
  );
}
