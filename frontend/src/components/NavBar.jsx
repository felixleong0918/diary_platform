import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, useFeedback, useLook, useUnread } from '../context.jsx';
import Icon from './Icon.jsx';
import { Avatar, useSlidingPill } from './ui.jsx';
import NotificationBell from './NotificationBell.jsx';

export default function NavBar() {
  const { user, ready, isOperator, logout } = useAuth();
  const { scheme, toggleScheme } = useLook();
  const { toast } = useFeedback();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const { refreshUnread } = useUnread();
  useEffect(() => { refreshUnread(); }, [pathname, refreshUnread]);

  const tabs = [
    { to: '/', label: '探索', icon: 'compass', end: true },
    ...(user ? [
      { to: '/following', label: '追蹤', icon: 'people' },
      { to: '/me', label: '我的日記', icon: 'book' },
      { to: '/favorites', label: '收藏', icon: 'bookmark' },
    ] : []),
    ...(isOperator ? [{ to: '/operator', label: '營運', icon: 'shield' }] : []),
  ];
  const [tabsRef, pillStyle] = useSlidingPill(`${pathname}|${tabs.length}`);

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!menuRef.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const onLogout = async () => {
    await logout();
    toast('已登出');
    navigate('/');
  };

  return (
    <>
      <nav className={`nav-tabs ${tabs.length === 1 ? 'is-single' : ''}`} ref={tabsRef} aria-label="主要導覽">
        <i className="nav-pill" style={pillStyle} />
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `nav-tab ${isActive ? 'is-active' : ''}`}>
            <Icon name={t.icon} size={20} />
            {t.label}
          </NavLink>
        ))}
      </nav>
    <header className="nav">
      <Link to="/" className="nav-brand">LittleTreeHollow°</Link>
      <div className="nav-actions">
        <button
          className="btn is-quiet is-icon" onClick={toggleScheme}
          aria-label={scheme === 'dark' ? '切換為淺色外觀' : '切換為深色外觀'}
        >
          <Icon name={scheme === 'dark' ? 'sun' : 'moon'} />
        </button>
        {ready && !user && (
          <>
            <Link to="/login" className="btn is-quiet">登入</Link>
            <Link to="/register" className="btn is-primary">開始使用</Link>
          </>
        )}
        {user && (
          <>
            <NotificationBell />
            <Link to="/write" className="btn is-quiet" aria-label="寫日記">
              <Icon name="pen" size={17} /><span className="btn-label">寫日記</span>
            </Link>
            <div className="menu" ref={menuRef}>
              <button className="btn is-icon nav-me" aria-haspopup="menu" aria-expanded={open} aria-label="帳號選單" onClick={() => setOpen((o) => !o)}>
                {user.avatar ? <Avatar name={user.nickname} src={user.avatar} /> : [...user.nickname][0]}
              </button>
              {open && (
                <div className="menu-sheet" role="menu">
                  <div className="row" style={{ padding: '8px 12px 12px', flexWrap: 'nowrap' }}>
                    <Avatar name={user.nickname} src={user.avatar} />
                    <div className="grow">
                      <div style={{ fontWeight: 650 }}>{user.nickname}</div>
                      <div className="tiny muted">@{user.username}</div>
                    </div>
                  </div>
                  <Link className="menu-item" role="menuitem" to={`/blog/${user.blog_id}`}><Icon name="globe" />我的公開空間</Link>
                  <Link className="menu-item" role="menuitem" to="/settings"><Icon name="gear" />空間與帳號設定</Link>
                  <button className="menu-item" role="menuitem" onClick={onLogout}><Icon name="logout" />登出</button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </header>
    </>
  );
}
