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
/** 把 @帳號 顯示成連到對方空間的連結；查不到的帳號維持原樣。 */
function withMentions(content, mentions) {
  if (!mentions) return content;
  return content.split(/(@[a-z0-9_]{3,30})/gi).map((part, i) => {
    const blogId = part.startsWith('@') ? mentions[part.slice(1).toLowerCase()] : null;
    return blogId ? <Link key={i} className="mention" to={`/blog/${blogId}`}>{part}</Link> : part;
  });
}

export default function Messages({ kind, items, postUrl, onChanged, notice, emptyText, mentions }) {
  const { user, isSuspended } = useAuth();
  const { fail, toast, confirm } = useFeedback();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editText, setEditText] = useState('');
  const [replyTo, setReplyTo] = useState(null);     // 正在回覆的留言
  const [replyText, setReplyText] = useState('');
  const [replyBusy, setReplyBusy] = useState(false);
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
  const sendReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || replyBusy) return;
    setReplyBusy(true);
    try {
      await api.post(postUrl, { content: replyText, parent_id: replyTo.comment_id });
      setReplyTo(null);
      setReplyText('');
      toast('回覆已送出');
      onChanged();
    } catch (err) { fail(err); } finally { setReplyBusy(false); }
  };
  const startReply = (m) => {
    setReplyTo(m);
    setReplyText(m.is_mine ? '' : `@${m.username} `);
  };
  // 留言串：最上層留言依時間排列，回覆接在所屬留言底下；上層已被移除的回覆仍會顯示
  const threads = [];
  if (kind === 'comment') {
    const byId = new Map(items.map((m) => [m.comment_id, m]));
    const groups = new Map();
    for (const m of items) {
      const rootId = m.parent_id || m.comment_id;
      if (!groups.has(rootId)) { groups.set(rootId, { root: byId.get(rootId) || null, replies: [] }); threads.push(groups.get(rootId)); }
      if (m.parent_id) groups.get(rootId).replies.push(m);
    }
  } else {
    for (const m of items) threads.push({ root: m, replies: [] });
  }
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

  const renderMessage = (m, isReply) => (
          <div key={m[idKey]} className={`message ${isReply ? 'is-reply' : ''}`}>
            <Avatar name={m.nickname} src={m.avatar} size={isReply ? 'is-mid' : ''} />
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
              ) : (
                <>
                  <p className="prewrap">{withMentions(m.content, mentions)}</p>
                  {kind === 'comment' && user && !isSuspended && m.status === 'visible' && (
                    <div><button type="button" className="reply-link" onClick={() => startReply(m)}><Icon name="reply" size={14} />回覆</button></div>
                  )}
                </>
              )}
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
  );

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
          {threads.map((t) => (
            <div key={t.root ? t.root[idKey] : `gone-${t.replies[0][idKey]}`} className="thread">
              {t.root ? renderMessage(t.root, false) : <p className="message tiny">這則留言已被移除。</p>}
              {t.replies.map((r) => renderMessage(r, true))}
              {replyTo && [t.root, ...t.replies].some((m) => m && m.comment_id === replyTo.comment_id) && (
                <form className="message is-reply stack" style={{ display: 'flex' }} onSubmit={sendReply}>
                  <textarea className="textarea" autoFocus rows={2} maxLength={1000} value={replyText}
                    aria-label={`回覆 ${replyTo.nickname}`} placeholder={`回覆 ${replyTo.nickname}`} onChange={(e) => setReplyText(e.target.value)} />
                  <div className="row is-tight">
                    <Button className="is-primary is-small" type="submit" busy={replyBusy} disabled={!replyText.trim()}>送出回覆</Button>
                    <Button className="is-quiet is-small" type="button" onClick={() => setReplyTo(null)}>取消</Button>
                  </div>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
