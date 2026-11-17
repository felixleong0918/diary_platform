import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, formatTime } from '../api.js';
import { usePaged } from '../hooks.js';
import { Avatar, Empty, LoadMore, Skeletons } from '../components/ui.jsx';
import { REACTION_LABEL } from '../components/Reactions.jsx';

const VERB = {
  comment: '在你的日記留言', reply: '回覆了你的留言', mention: '在留言裡提到你',
  favorite: '收藏了你的日記', follow: '開始追蹤你的空間', guestbook: '在你的留言板留言',
};

function target(n, myBlogId) {
  if (n.kind === 'follow') return n.actor_blog_id ? `/blog/${n.actor_blog_id}` : null;
  if (n.kind === 'guestbook') return `/blog/${myBlogId}?tab=guestbook`;
  return n.entry_id ? `/entry/${n.entry_id}` : null;
}

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
          {list.items.map((n) => {
            const to = target(n, myBlogId);
            const body = (
              <>
                <Avatar name={n.actor_nickname} src={n.actor_avatar} />
                <div className="grow stack" style={{ gap: 2 }}>
                  <p>
                    <b>{n.actor_nickname}</b>{' '}
                    {n.kind === 'reaction' ? `對你的日記表示「${REACTION_LABEL[n.reaction] || '回應'}」` : VERB[n.kind]}
                    {n.entry_title && <>：<span className="muted">{n.entry_title}</span></>}
                  </p>
                  {n.comment_excerpt && <p className="small muted clamp-2">{n.comment_excerpt}</p>}
                  {!to && <p className="tiny">內容目前無法瀏覽</p>}
                  <span className="tiny num">{formatTime(n.created_at)}</span>
                </div>
                {!n.read_at && <i className="unread-dot" aria-label="未讀" />}
              </>
            );
            return to
              ? <Link key={n.notification_id} to={to} className="listrow" style={{ alignItems: 'flex-start' }}>{body}</Link>
              : <div key={n.notification_id} className="listrow" style={{ alignItems: 'flex-start' }}>{body}</div>;
          })}
        </div>
      )}
      <LoadMore show={list.more} busy={list.loadingMore} onClick={list.loadMore} />
    </main>
  );
}
