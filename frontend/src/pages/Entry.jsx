import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, formatDate, formatTime, photoUrl } from '../api.js';
import { useAuth, useFeedback, usePageStyle } from '../context.jsx';
import { useData } from '../hooks.js';
import Icon from '../components/Icon.jsx';
import Messages from '../components/Messages.jsx';
import Reactions from '../components/Reactions.jsx';
import { Avatar, Button, Empty, Mood, StatusBadges } from '../components/ui.jsx';
import SongPlayer from '../components/SongPlayer.jsx';

export default function Entry() {
  const { entryId } = useParams();
  const { user, isSuspended } = useAuth();
  const { fail, toast, confirm } = useFeedback();
  const navigate = useNavigate();
  const [favBusy, setFavBusy] = useState(false);

  const entry = useData(() => api.get(`/entries/${entryId}`), [entryId, user?.user_id]);
  const comments = useData(() => api.get(`/entries/${entryId}/comments`), [entryId, user?.user_id]);
  usePageStyle(entry.data?.entry.style_key);

  if (entry.loading) return <main className="page is-narrow"><div className="skeleton" style={{ minHeight: 360 }} /></main>;
  if (entry.error) {
    return (
      <main className="page is-narrow">
        <Empty title="內容目前無法瀏覽" />
      </main>
    );
  }
  const e = entry.data.entry;

  const toggleFavorite = async () => {
    setFavBusy(true);
    try {
      const r = e.is_favorited ? await api.del(`/entries/${entryId}/favorite`) : await api.post(`/entries/${entryId}/favorite`);
      entry.setData((d) => ({
        entry: { ...d.entry, is_favorited: r.is_favorited, favorite_count: d.entry.favorite_count + (r.is_favorited ? 1 : -1) },
      }));
      toast(r.is_favorited ? '已加入收藏' : '已取消收藏');
    } catch (err) { fail(err); } finally { setFavBusy(false); }
  };
  const remove = async () => {
    const ok = await confirm({
      title: '移除這篇日記？', body: '移除後無法復原。', confirmLabel: '移除', danger: true,
    });
    if (!ok) return;
    try { await api.del(`/entries/${entryId}`); toast('日記已移除'); navigate('/me'); } catch (err) { fail(err); }
  };

  return (
    <main className="page is-narrow stack is-loose">
      <article className="article">
        {e.status === 'hidden' && (
          <div className="notice is-danger">
            <Icon name="eyeoff" />
            <span>這篇日記已被營運者隱藏{e.hidden_at ? `（${formatTime(e.hidden_at)}）` : ''}。</span>
          </div>
        )}
        <h1 className="article-title" data-font={e.title_font}>{e.title}</h1>
        <div className="row is-between">
          <Link to={`/blog/${e.blog_id}`} className="row" style={{ flexWrap: 'nowrap' }}>
            <Avatar name={e.author_nickname} src={e.author_avatar} />
            <span>
              <b style={{ display: 'block', lineHeight: 1.3 }}>{e.author_nickname}{e.author_status_text && <span className="status-chip">{e.author_status_text}</span>}</b>
              <span className="tiny">{e.blog_name} · {formatDate(e.entry_date)}{e.category_name ? ` · ${e.category_name}` : ''}</span>
            </span>
          </Link>
          <div className="row is-tight">
            <StatusBadges entry={{ ...e, status: 'active' }} />
            {e.visibility === 'public' && e.is_owner && <span className="badge is-accent"><Icon name="globe" size={13} />公開</span>}
          </div>
        </div>

        <div className="article-bar">
          {user ? (
            <Button className={`is-quiet ${e.is_favorited ? 'is-on' : ''}`} busy={favBusy} disabled={isSuspended && !e.is_favorited} onClick={toggleFavorite} aria-pressed={e.is_favorited}>
              <Icon name="bookmark" filled={e.is_favorited} size={18} />
              {e.is_favorited ? '已收藏' : '收藏'}<span className="num">{e.favorite_count}</span>
            </Button>
          ) : (
            <span className="row is-tight muted small"><Icon name="heart" size={16} /><span className="num">{e.favorite_count}</span> 人收藏</span>
          )}
          <div className="row is-tight">
            {e.is_owner && (
              <span className="row is-tight" style={{ marginRight: 8 }}>
                <span className="tiny">今日心情</span><Mood score={e.mood_score} />
              </span>
            )}
            {e.is_owner && !isSuspended && (
              <>
                <Link to={`/entry/${e.entry_id}/edit`} className="btn is-small"><Icon name="pen" size={14} />編輯</Link>
                <Button className="is-quiet is-danger is-small" onClick={remove}>移除</Button>
              </>
            )}
          </div>
        </div>

        {e.has_photo && (
          <div className="article-photo"><img src={photoUrl(e.entry_id, e.updated_at)} alt={`${e.title} 的照片`} /></div>
        )}
        <SongPlayer title={e.song_title} url={e.song_url} autoplay />
        <div className="article-body prewrap">{e.content}</div>

        {e.tags.length > 0 && (
          <div className="row is-tight">
            {e.tags.map((t) => (
              <Link key={t.tag_id} to={`/?tag=${encodeURIComponent(t.tag_name)}`} className="chip">{t.tag_name}</Link>
            ))}
          </div>
        )}
        <Reactions entryId={entryId} disabled={e.status !== 'active'} />
      </article>

      <section className="stack" style={{ borderTop: '1px solid var(--hairline)', paddingTop: 32, marginTop: 16 }}>
        <h2 className="title" style={{ fontSize: 24 }}>留言 <span className="muted num">{comments.data?.comments.length ?? ''}</span></h2>
        {comments.loading ? <div className="skeleton" /> : e.status !== 'active' ? (
          <p className="muted small">留言已關閉。</p>
        ) : (
          <Messages
            kind="comment" items={comments.data?.comments || []} postUrl={`/entries/${entryId}/comments`}
            onChanged={comments.reload} mentions={comments.data?.mentions}
            notice={null}
            emptyText="還沒有留言。"
          />
        )}
      </section>
    </main>
  );
}
