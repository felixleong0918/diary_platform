import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatTime } from '../api.js';
import { useAuth, useFeedback } from '../context.jsx';
import Icon from './Icon.jsx';
import { Avatar, Button } from './ui.jsx';

/**
 * 日記留言與空間留言板共用的訊息串。
 *   kind: 'comment' | 'guestbook'；items 內以 idKey 取得代號。
 */
export default function Messages({ kind, items, postUrl, onChanged, notice, emptyText }) {
  const { user, isSuspended } = useAuth();
  const { fail, toast, confirm } = useFeedback();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editText, setEditText] = useState('');
  const idKey = kind === 'comment' ? 'comment_id' : 'guestbook_id';
  const itemUrl = (m) => (kind === 'comment' ? `/comments/${m[idKey]}` : `/guestbook/${m[idKey]}`);
  const noun = kind === 'comment' ? '留言' : '訊息';

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      await api.post(postUrl, { content: text });
      setText('');
      toast(`${noun}已送出`);
      onChanged();
    } catch (err) { fail(err); } finally { setBusy(false); }
  };
  const save = async (m) => {
    try {
      await api.put(itemUrl(m), { content: editText });
      setEditing(null);
      onChanged();
    } catch (err) { fail(err); }
  };
  const remove = async (m) => {
    if (!(await confirm({ title: `移除這則${noun}？`, confirmLabel: '移除', danger: true }))) return;
    try { await api.del(itemUrl(m)); toast(`${noun}已移除`); onChanged(); } catch (err) { fail(err); }
  };

  return (
    <div className="stack">
      {!user ? (
        <p className="muted small"><Link className="link" to="/login">登入</Link>後才能留言。</p>
      ) : isSuspended ? (
        <p className="muted small">帳號已被停權。</p>
      ) : (
        <form className="stack" onSubmit={send}>
          <textarea
            className="textarea" value={text} maxLength={1000} placeholder={`寫下你的${noun}`}
            aria-label={`新增${noun}`} onChange={(e) => setText(e.target.value)}
          />
          {notice && <div className="notice"><Icon name="info" />{notice}</div>}
          <div className="row is-between">
            <span className="tiny muted num">{[...text].length} / 1000</span>
            <Button className="is-primary" type="submit" busy={busy} disabled={!text.trim()}>送出</Button>
          </div>
        </form>
      )}

      {items.length === 0 ? <p className="muted small">{emptyText}</p> : (
        <div>
          {items.map((m) => (
            <div key={m[idKey]} className="message">
              <Avatar name={m.nickname} />
              <div className="grow stack" style={{ gap: 6 }}>
                <div className="row is-tight">
                  {m.author_blog_id
                    ? <Link to={`/blog/${m.author_blog_id}`} style={{ fontWeight: 650 }}>{m.nickname}</Link>
                    : <b>{m.nickname}</b>}
                  <span className="tiny muted">{formatTime(m.created_at)}{m.updated_at !== m.created_at ? ' · 已編輯' : ''}</span>
                  {m.status === 'hidden' && <span className="badge is-danger">已被營運隱藏</span>}
                </div>
                {editing === m[idKey] ? (
                  <div className="stack">
                    <textarea className="textarea" value={editText} maxLength={1000} aria-label={`編輯${noun}`} onChange={(e) => setEditText(e.target.value)} />
                    <div className="row is-tight">
                      <Button className="is-primary is-small" disabled={!editText.trim()} onClick={() => save(m)}>儲存</Button>
                      <Button className="is-quiet is-small" onClick={() => setEditing(null)}>取消</Button>
                    </div>
                  </div>
                ) : <p className="prewrap">{m.content}</p>}
              </div>
              {user && !isSuspended && editing !== m[idKey] && (m.is_mine || m.can_remove) && (
                <div className="row is-tight" style={{ alignSelf: 'flex-start', flexWrap: 'nowrap' }}>
                  {m.is_mine && (
                    <button className="btn is-quiet is-icon is-small" aria-label={`編輯${noun}`} onClick={() => { setEditing(m[idKey]); setEditText(m.content); }}>
                      <Icon name="pen" size={15} />
                    </button>
                  )}
                  <button className="btn is-quiet is-icon is-small is-danger" aria-label={`移除${noun}`} onClick={() => remove(m)}>
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
