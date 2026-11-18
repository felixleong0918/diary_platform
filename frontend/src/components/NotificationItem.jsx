// 一則通知：通知頁與導覽列的通知清單共用。
import { Link } from 'react-router-dom';
import { formatTime } from '../api.js';
import { Avatar } from './ui.jsx';
import { REACTION_LABEL } from './Reactions.jsx';

const VERB = {
  comment: '在你的日記留言', reply: '回覆了你的留言', mention: '在留言裡提到你',
  favorite: '收藏了你的日記', follow: '開始追蹤你的空間', guestbook: '在你的留言板留言',
};

function target(n, myBlogId) {
  if (n.kind === 'follow') return n.actor_blog_id ? `/blog/${n.actor_blog_id}` : null;
  if (n.kind === 'guestbook') return `/blog/${myBlogId}?tab=guestbook`;
  return n.entry_id ? `/entry/${n.entry_id}` : null;
}

export default function NotificationItem({ n, myBlogId, compact = false, onNavigate }) {
  const to = target(n, myBlogId);
  const body = (
    <>
      <Avatar name={n.actor_nickname} src={n.actor_avatar} />
      <div className="grow stack" style={{ gap: 2 }}>
        <p className={compact ? 'small clamp-2' : ''}>
          <b>{n.actor_nickname}</b>{' '}
          {n.kind === 'reaction' ? `對你的日記表示「${REACTION_LABEL[n.reaction] || '回應'}」` : VERB[n.kind]}
          {n.entry_title && <>：<span className="muted">{n.entry_title}</span></>}
        </p>
        {!compact && n.comment_excerpt && <p className="small muted clamp-2">{n.comment_excerpt}</p>}
        {!to && <p className="tiny">內容目前無法瀏覽</p>}
        <span className="tiny num">{formatTime(n.created_at)}</span>
      </div>
      {!n.read_at && <i className="unread-dot" aria-label="未讀" />}
    </>
  );
  const className = `listrow ${compact ? 'is-compact' : ''}`;
  return to
    ? <Link to={to} className={className} style={{ alignItems: 'flex-start' }} onClick={onNavigate}>{body}</Link>
    : <div className={className} style={{ alignItems: 'flex-start' }}>{body}</div>;
}
