// 導覽列的鈴鐺：按下後在目前頁面展開最近的通知，底部可以前往完整的通知頁。
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth, useUnread } from '../context.jsx';
import Icon from './Icon.jsx';
import NotificationItem from './NotificationItem.jsx';

const SHOWN = 8;

export default function NotificationBell() {
  const { user } = useAuth();
  const { unread, clearUnread } = useUnread();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState({ items: null, more: false, error: null });
  const ref = useRef(null);

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  // 每次展開都重新載入；載入後標為已讀，這次清單上仍保留未讀的標示
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setState((s) => ({ ...s, error: null }));
    api.get('/me/notifications?page=1').then((r) => {
      if (cancelled) return;
      setState({ items: r.notifications.slice(0, SHOWN), more: r.has_more || r.notifications.length > SHOWN, error: null });
      if (r.unread_count > 0) api.post('/me/notifications/read').then(clearUnread).catch(() => {});
    }).catch((error) => { if (!cancelled) setState({ items: null, more: false, error }); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div className="menu" ref={ref}>
      <button type="button" className="btn is-quiet is-icon nav-bell" aria-haspopup="dialog" aria-expanded={open}
        aria-label={unread ? `通知，${unread} 則未讀` : '通知'} onClick={() => setOpen((o) => !o)}>
        <Icon name="bell" />
        {unread > 0 && <b className="num">{unread > 99 ? '99+' : unread}</b>}
      </button>
      {open && (
        <div className="menu-sheet notif-sheet" role="dialog" aria-label="通知">
          <div className="row is-between notif-head">
            <b>通知</b>
            <Link className="tiny link" to="/notifications">在獨立頁面開啟</Link>
          </div>
          <div className="notif-list">
            {state.error ? <p className="small muted notif-empty">{state.error.message}</p>
              : !state.items ? <div className="skeleton" style={{ minHeight: 160, margin: 8 }} />
                : state.items.length === 0 ? <p className="small muted notif-empty">還沒有通知。</p>
                  : state.items.map((n) => (
                    <NotificationItem key={n.notification_id} n={n} myBlogId={user.blog_id} compact onNavigate={() => setOpen(false)} />
                  ))}
          </div>
          {state.items?.length > 0 && (
            <Link className="notif-all" to="/notifications">{state.more ? '查看全部通知' : '前往通知頁'}</Link>
          )}
        </div>
      )}
    </div>
  );
}
