import { useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';
import { api, formatDate, photoUrl } from '../api.js';
import { EmptyArt } from './Art.jsx';

export function Button({ busy, children, className = '', ...props }) {
  return (
    <button className={`btn ${className}`} disabled={busy || props.disabled} {...props}>
      {busy && <i className="spinner" />}
      {children}
    </button>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

/** 分段控制：玻璃膠囊以彈性曲線滑到選取項目。options: [{ value, label }] */
export function Segmented({ options, value, onChange, label }) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div className="segmented" role="tablist" aria-label={label}>
      <i className="thumb" style={{ width: `calc((100% - 4px) / ${options.length})`, transform: `translateX(${index * 100}%)` }} />
      {options.map((o) => (
        <button
          key={o.value} type="button" role="tab" aria-selected={o.value === value}
          className={o.value === value ? 'is-active' : ''} onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** 姓名首字的圓形頭像；底色由名字決定，同一個人永遠是同一色。 */
export function Avatar({ name, size = '', src = null }) {
  const text = name || '?';
  let hash = 0;
  for (const ch of text) hash = (hash * 31 + ch.codePointAt(0)) % 997;
  const [broken, setBroken] = useState(false);
  if (src && !broken) {
    return <span className={`avatar is-photo ${size}`} aria-hidden="true"><img src={src} alt="" loading="lazy" onError={() => setBroken(true)} /></span>;
  }
  return <span className={`avatar ${size}`} data-c={hash % 6} aria-hidden="true">{[...text][0]}</span>;
}

export function Mood({ score }) {
  return (
    <span className="mood" role="img" aria-label={`心情分數 ${score} 分（滿分 5 分）`}>
      {[1, 2, 3, 4, 5].map((n) => <i key={n} className={n <= score ? 'is-on' : ''} />)}
    </span>
  );
}

export function Empty({ title, children }) {
  return (
    <div className="empty">
      <EmptyArt />
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}

export function Skeletons({ count = 3 }) {
  return (
    <div className="stack" aria-busy="true">
      {Array.from({ length: count }, (_, i) => <div key={i} className="skeleton" />)}
    </div>
  );
}

export function LoadMore({ show, busy, onClick }) {
  if (!show) return null;
  return (
    <div className="row" style={{ justifyContent: 'center' }}>
      <Button busy={busy} onClick={onClick}>載入更多</Button>
    </div>
  );
}

export function StatusBadges({ entry }) {
  return (
    <>
      {entry.visibility === 'private' && <span className="badge"><Icon name="lock" size={13} />私密</span>}
      {entry.status === 'hidden' && <span className="badge is-danger"><Icon name="eyeoff" size={13} />已被營運隱藏</span>}
    </>
  );
}

/** 日記列（Medium 的文章列）。心情分數只在作者自己的清單（showMood）出現。 */
export function EntryCard({ entry, showAuthor = true, showMood = false }) {
  return (
    <Link to={`/entry/${entry.entry_id}`} className="story">
      <div className="story-meta">
        {showAuthor && (
          <>
            <Avatar name={entry.author_nickname} src={entry.author_avatar} size="is-small" />
            <b>{entry.author_nickname}</b>
            <span>·</span>
          </>
        )}
        <span>{formatDate(entry.entry_date)}</span>
        {entry.category_name && <><span>·</span><span>{entry.category_name}</span></>}
        <StatusBadges entry={entry} />
      </div>
      <div>
        <h3 className="story-title">{entry.title}</h3>
        <p className="story-excerpt clamp-2">{entry.excerpt}</p>
        <div className="story-foot">
          {showMood && <Mood score={entry.mood_score} />}
          <span className="num"><Icon name="chat" size={15} />{entry.comment_count}</span>
          <span className="num"><Icon name="heart" size={15} />{entry.reaction_count ?? 0}</span>
          <span className="num"><Icon name="bookmark" size={15} />{entry.favorite_count}</span>
          {entry.song_title && <span className="story-song"><Icon name="music" size={15} /><span>{entry.song_title}</span></span>}
          {entry.tags.slice(0, 3).map((t) => <span key={t.tag_id} className="chip is-small">{t.tag_name}</span>)}
        </div>
      </div>
      {entry.has_photo && (
        <div className="story-thumb"><img src={photoUrl(entry.entry_id)} alt="" loading="lazy" /></div>
      )}
    </Link>
  );
}

/** 滑動的玻璃膠囊：量測目前作用中的元素位置。回傳 [containerRef, pillStyle] */
export function useSlidingPill(activeKey) {
  const ref = useRef(null);
  const [style, setStyle] = useState({ opacity: 0 });
  useLayoutEffect(() => {
    const measure = () => {
      const el = ref.current?.querySelector('.is-active');
      if (!el) return setStyle({ opacity: 0 });
      setStyle({ opacity: 1, width: el.offsetWidth, transform: `translateX(${el.offsetLeft}px)` });
    };
    measure();
    window.addEventListener('resize', measure);
    document.fonts?.ready.then(measure);
    return () => window.removeEventListener('resize', measure);
  }, [activeKey]);
  return [ref, style];
}

/** 歌曲連結：顯示歌名，另開分頁到原網站。 */
export function SongLink({ title, url, className = '' }) {
  if (!title || !url) return null;
  let host = '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return null;      // 只連到 https，避免 javascript: 之類的連結
    host = parsed.hostname.replace(/^www\./, '');
  } catch { return null; }
  return (
    <a className={`song ${className}`} href={url} target="_blank" rel="noopener noreferrer nofollow">
      <span className="song-disc"><Icon name="music" size={16} /></span>
      <span className="song-text"><b>{title}</b><span>{host}</span></span>
      <Icon name="external" size={15} />
    </a>
  );
}

/**
 * 歌曲欄位：貼上連結後向後端查歌名並帶入，使用者可以再修改。
 * value: { song_url, song_title }
 */
export function SongField({ value, onChange, label = '歌曲' }) {
  const [state, setState] = useState({ status: 'idle', provider: null });
  const looked = useRef(value.song_url || '');
  const autoTitle = useRef(null);

  const lookup = async (raw) => {
    const url = raw.trim();
    if (!url || url === looked.current) return;
    looked.current = url;
    if (!/^https:\/\/\S+$/.test(url)) { setState({ status: 'invalid' }); return; }
    setState({ status: 'loading' });
    try {
      const r = await api.get(`/song-info?url=${encodeURIComponent(url)}`);
      if (looked.current !== url) return;
      if (r.title) {
        // 只在歌名還是空的，或仍是上一次自動帶入的內容時才覆蓋
        const untouched = !value.song_title || value.song_title === autoTitle.current;
        if (untouched) { autoTitle.current = r.title; onChange({ song_url: url, song_title: r.title }); }
        setState({ status: untouched ? 'filled' : 'kept', provider: r.provider });
      } else {
        setState({ status: r.provider ? 'missing' : 'manual', provider: r.provider });
      }
    } catch { if (looked.current === url) setState({ status: 'manual' }); }
  };
  const hint = {
    loading: '正在查詢歌名…',
    invalid: '連結必須以 https:// 開頭',
    filled: `已從 ${state.provider} 帶入歌名，可以修改`,
    kept: '已保留你輸入的歌名',
    missing: `在 ${state.provider} 查不到這首歌，請自行輸入歌名`,
    manual: '這個網站無法自動帶入歌名，請自行輸入',
  }[state.status] || '支援 YouTube 與 Spotify 自動帶入歌名；其他網站請自行輸入';

  return (
    <div className="field">
      <span>{label}</span>
      <div className="song-field">
        <input className="input" type="url" inputMode="url" maxLength={500} placeholder="貼上歌曲連結（https://…）" aria-label={`${label}連結`}
          value={value.song_url} onChange={(e) => onChange({ ...value, song_url: e.target.value })}
          onBlur={(e) => lookup(e.target.value)}
          onPaste={(e) => { const text = e.clipboardData.getData('text'); setTimeout(() => lookup(text), 0); }} />
        <input className="input" maxLength={120} placeholder="歌名" aria-label={`${label}名稱`}
          value={value.song_title} onChange={(e) => onChange({ ...value, song_title: e.target.value })} />
        {(value.song_url || value.song_title) && (
          <Button type="button" className="is-quiet" onClick={() => { looked.current = ''; setState({ status: 'idle' }); onChange({ song_url: '', song_title: '' }); }}>清除</Button>
        )}
      </div>
      <small aria-live="polite">{hint}</small>
      {value.song_url && value.song_title && state.status !== 'invalid' && <SongLink title={value.song_title} url={value.song_url} />}
    </div>
  );
}
