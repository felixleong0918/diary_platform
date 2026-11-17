import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';

// ---------- 登入狀態 ----------
const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = 尚未確認
  const refresh = useCallback(async () => {
    try {
      const { user: u } = await api.get('/auth/me');
      setUser(u);
      return u;
    } catch {
      setUser(null);
      return null;
    }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const value = useMemo(() => ({
    user,
    ready: user !== undefined,
    isOperator: !!user?.roles?.includes('Operator'),
    isSuspended: user?.status === 'suspended',
    refresh,
    login: async (username, password) => setUser((await api.post('/auth/login', { username, password })).user),
    register: async (form) => setUser((await api.post('/auth/register', form)).user),
    logout: async () => { await api.post('/auth/logout'); setUser(null); },
  }), [user, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ---------- 外觀：深淺色與桌布樣式 ----------
const LookContext = createContext(null);
export const useLook = () => useContext(LookContext);

export function LookProvider({ children }) {
  const [scheme, setSchemeState] = useState(() => document.documentElement.dataset.scheme || 'light');
  const [style, setStyle] = useState('aurora');

  useEffect(() => { document.documentElement.dataset.scheme = scheme; }, [scheme]);
  useEffect(() => { document.documentElement.dataset.style = style; }, [style]);
  // 沒有手動選過時跟隨系統外觀
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e) => {
      let saved = null;
      try { saved = localStorage.getItem('scheme'); } catch { /* 無法使用儲存空間時照常運作 */ }
      if (!saved) setSchemeState(e.matches ? 'dark' : 'light');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const toggleScheme = useCallback(() => {
    setSchemeState((s) => {
      const next = s === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('scheme', next); } catch { /* ignore */ }
      return next;
    });
  }, []);
  const value = useMemo(() => ({ scheme, toggleScheme, style, setStyle }), [scheme, toggleScheme, style]);
  return <LookContext.Provider value={value}>{children}</LookContext.Provider>;
}

/** 進入某個空間或日記時換成該空間主題的桌布，離開時還原。 */
export function usePageStyle(styleKey) {
  const { setStyle } = useLook();
  useEffect(() => {
    if (!styleKey) return undefined;
    setStyle(styleKey);
    return () => setStyle('aurora');
  }, [styleKey, setStyle]);
}

// ---------- 提示訊息與確認對話框 ----------
const FeedbackContext = createContext(null);
export const useFeedback = () => useContext(FeedbackContext);

export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);
  const seq = useRef(0);

  const toast = useCallback((message, kind = 'info') => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);
  const fail = useCallback((err) => toast(err?.message || '發生錯誤', 'error'), [toast]);
  const confirm = useCallback((options) => new Promise((resolve) => setDialog({ ...options, resolve })), []);
  const close = (answer) => { dialog?.resolve(answer); setDialog(null); };

  useEffect(() => {
    if (!dialog) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') close(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const value = useMemo(() => ({ toast, fail, confirm }), [toast, fail, confirm]);
  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind === 'error' ? 'is-error' : ''}`}>{t.message}</div>
        ))}
      </div>
      {dialog && (
        <div className="scrim" onClick={() => close(false)}>
          <div className="dialog stack" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3 className="heading">{dialog.title}</h3>
            {dialog.body && <p className="muted">{dialog.body}</p>}
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn is-quiet" onClick={() => close(false)}>取消</button>
              <button className={`btn ${dialog.danger ? 'is-danger' : 'is-primary'}`} autoFocus onClick={() => close(true)}>
                {dialog.confirmLabel || '確定'}
              </button>
            </div>
          </div>
        </div>
      )}
    </FeedbackContext.Provider>
  );
}
