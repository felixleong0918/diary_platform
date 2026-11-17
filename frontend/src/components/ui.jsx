import { useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';
import { formatDate, photoUrl } from '../api.js';
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
export function Avatar({ name, size = '' }) {
  const text = name || '?';
  let hash = 0;
  for (const ch of text) hash = (hash * 31 + ch.codePointAt(0)) % 997;
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
            <Avatar name={entry.author_nickname} size="is-small" />
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
          <span className="num"><Icon name="heart" size={15} />{entry.favorite_count}</span>
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
