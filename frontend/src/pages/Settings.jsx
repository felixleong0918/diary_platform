import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useAuth, useFeedback, useLook } from '../context.jsx';
import { useData } from '../hooks.js';
import Icon from '../components/Icon.jsx';
import { Avatar, Button, Field, Segmented, SongField } from '../components/ui.jsx';
import { COVER_PATTERNS, ThemeArt } from '../components/Art.jsx';

const FONTS = [{ value: 'serif', label: '襯線' }, { value: 'sans', label: '黑體' }, { value: 'mono', label: '等寬' }];

export default function Settings() {
  const { user, refresh, isSuspended } = useAuth();
  const { fail, toast } = useFeedback();
  const { setStyle } = useLook();
  const space = useData(() => api.get('/me/space'), []);
  const themes = useData(() => api.get('/themes'), []);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [renaming, setRenaming] = useState(null);
  const [renameText, setRenameText] = useState('');
  const [pw, setPw] = useState({ current_password: '', new_password: '' });
  const [pwBusy, setPwBusy] = useState(false);
  const avatarRef = useRef(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [mood, setMood] = useState({ status_text: '', duration: '24h' });
  const [moodBusy, setMoodBusy] = useState(false);
  const bgRef = useRef(null);
  const [bgBusy, setBgBusy] = useState(false);

  useEffect(() => {
    if (space.data && !form) {
      setForm({
        nickname: space.data.nickname, blog_name: space.data.blog.blog_name,
        description: space.data.blog.description || '', theme_id: space.data.blog.theme_id,
        tagline: space.data.blog.tagline || '', cover_pattern: space.data.blog.cover_pattern,
        title_font: space.data.blog.title_font, theme_scope: space.data.blog.theme_scope,
        song_url: space.data.blog.song_url || '', song_title: space.data.blog.song_title || '',
      });
    }
  }, [space.data, form]);

  // 選主題時即時預覽桌布，離開頁面還原
  const options = themes.data?.themes || [];
  const current = space.data?.blog;
  const selected = options.find((t) => t.theme_id === form?.theme_id);
  const previewKey = selected?.style_key || (form?.theme_id === current?.theme_id ? current?.style_key : null);
  useEffect(() => {
    if (previewKey) setStyle(previewKey);
    return () => setStyle('aurora');
  }, [previewKey, setStyle]);

  if (!form || !space.data) return <main className="page is-narrow"><div className="skeleton" style={{ minHeight: 400 }} /></main>;
  const categories = space.data.categories;
  const currentRetired = current.theme_status === 'retired' && !options.some((t) => t.theme_id === current.theme_id);

  const saveSpace = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.put('/me/space', form);
      await Promise.all([refresh(), space.reload()]);
      toast('空間設定已更新');
    } catch (err) { fail(err); } finally { setBusy(false); }
  };
  const addCategory = async (e) => {
    e.preventDefault();
    try {
      await api.post('/me/categories', { category_name: newCategory });
      setNewCategory('');
      space.reload();
    } catch (err) { fail(err); }
  };
  const updateCategory = async (no, body) => {
    try { await api.put(`/me/categories/${no}`, body); setRenaming(null); space.reload(); } catch (err) { fail(err); }
  };
  const pickAvatar = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { fail({ message: '大頭貼大小不可超過 2 MB' }); return; }
    setAvatarBusy(true);
    try {
      const data = new FormData();
      data.append('avatar', file);
      await api.put('/me/avatar', data);
      await refresh();
      toast('大頭貼已更新');
    } catch (err) { fail(err); } finally { setAvatarBusy(false); }
  };
  const removeAvatar = async () => {
    try { await api.del('/me/avatar'); await refresh(); toast('已移除大頭貼'); } catch (err) { fail(err); }
  };
  // 背景圖選好就直接上傳，不必再按「儲存空間設定」
  const pickBackground = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { fail({ message: '背景圖大小不可超過 4 MB' }); return; }
    setBgBusy(true);
    try {
      const data = new FormData();
      data.append('background', file);
      await api.put('/me/background', data);
      await space.reload();
      toast('背景圖已更新');
    } catch (err) { fail(err); } finally { setBgBusy(false); }
  };
  const removeBackground = async () => {
    try { await api.del('/me/background'); await space.reload(); toast('已移除背景圖'); } catch (err) { fail(err); }
  };
  const saveMood = async (e) => {
    e.preventDefault();
    setMoodBusy(true);
    try {
      await api.put('/me/status', mood);
      await refresh();
      setMood((m) => ({ ...m, status_text: '' }));
      toast('已更新現在的心情');
    } catch (err) { fail(err); } finally { setMoodBusy(false); }
  };
  const clearMood = async () => {
    try { await api.del('/me/status'); await refresh(); toast('已清除'); } catch (err) { fail(err); }
  };
  const changePassword = async (e) => {
    e.preventDefault();
    setPwBusy(true);
    try {
      await api.put('/auth/password', pw);
      setPw({ current_password: '', new_password: '' });
      toast('密碼已更新');
    } catch (err) { fail(err); } finally { setPwBusy(false); }
  };

  return (
    <main className="page is-narrow stack is-loose">
      <header className="stack" style={{ gap: 6 }}>
        <h1 className="title">空間與帳號設定</h1>
      </header>
      {isSuspended && <div className="notice is-danger"><Icon name="info" />帳號已被停權，只能修改密碼。</div>}

      <section className="glass panel is-roomy stack is-loose">
        <h2 className="heading">大頭貼與現在的心情</h2>
        <div className="row">
          <Avatar name={user.nickname} src={user.avatar} size="is-large" />
          <div className="stack" style={{ gap: 8 }}>
            <div className="row is-tight">
              <input ref={avatarRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={pickAvatar} />
              <Button type="button" busy={avatarBusy} disabled={isSuspended} onClick={() => avatarRef.current.click()}>
                <Icon name="image" size={17} />{user.avatar ? '更換大頭貼' : '上傳大頭貼'}
              </Button>
              {user.avatar && <Button type="button" className="is-quiet is-danger" onClick={removeAvatar}>移除</Button>}
            </div>
            <small className="tiny">JPG、PNG 或 WebP，最大 2 MB。沒有上傳時顯示暱稱的第一個字。</small>
          </div>
        </div>
        <form className="stack" onSubmit={saveMood}>
          <Field label="現在的心情" hint="一句話，會顯示在你的空間與日記旁，到期後自動消失">
            <input className="input" maxLength={60} required value={mood.status_text} placeholder={user.status_text || '例如：期末週，努力中'}
              onChange={(e) => setMood({ ...mood, status_text: e.target.value })} />
          </Field>
          <div className="row is-between">
            <Segmented label="顯示時間" value={mood.duration} onChange={(v) => setMood({ ...mood, duration: v })}
              options={[{ value: '4h', label: '4 小時' }, { value: '24h', label: '1 天' }, { value: '7d', label: '7 天' }]} />
            <div className="row is-tight">
              {user.status_text && <Button type="button" className="is-quiet" onClick={clearMood}>清除目前的心情</Button>}
              <Button type="submit" busy={moodBusy} disabled={isSuspended || !mood.status_text.trim()}>更新</Button>
            </div>
          </div>
          {user.status_text && <p className="tiny">目前顯示：<span className="status-chip" style={{ marginLeft: 0 }}>{user.status_text}</span></p>}
        </form>
      </section>

      <form className="glass theme-tile panel is-roomy stack is-loose" onSubmit={saveSpace}>
        <h2 className="heading">個人空間</h2>
        <div className="form-grid">
          <Field label="暱稱">
            <input className="input" required maxLength={50} value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} />
          </Field>
          <Field label="空間名稱">
            <input className="input" required maxLength={100} value={form.blog_name} onChange={(e) => setForm({ ...form, blog_name: e.target.value })} />
          </Field>
        </div>
        <Field label="簡介" hint={`${[...form.description].length} / 1000 字`}>
          <textarea className="textarea" maxLength={1000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <div className="field">
          <span>主題</span>
          <div className="swatches" role="radiogroup" aria-label="空間主題">
            {currentRetired && (
              <button type="button" role="radio" aria-checked={form.theme_id === current.theme_id} data-style={current.style_key}
                className={`swatch ${form.theme_id === current.theme_id ? 'is-active' : ''}`} onClick={() => setForm({ ...form, theme_id: current.theme_id })}>
                <i />{current.theme_name}（已停用）
              </button>
            )}
            {options.map((t) => (
              <button
                key={t.theme_id} type="button" role="radio" aria-checked={form.theme_id === t.theme_id} data-style={t.style_key}
                className={`swatch ${form.theme_id === t.theme_id ? 'is-active' : ''}`} onClick={() => setForm({ ...form, theme_id: t.theme_id })}
              >
                <i />{t.theme_name}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>主題套用範圍</span>
          <div><Segmented label="主題套用範圍" value={form.theme_scope} onChange={(v) => setForm({ ...form, theme_scope: v })}
            options={[{ value: 'header', label: '只有標頭' }, { value: 'page', label: '整個主頁' }]} /></div>
          <small>選「整個主頁」時，主題的顏色會鋪滿你的個人主頁。有上傳背景圖時以背景圖為主。</small>
        </div>
        <div className="field">
          <span>背景圖</span>
          <div className="row">
            {current.background && <img className="bg-thumb" src={current.background} alt="目前的背景圖" />}
            <div className="row is-tight">
              <input ref={bgRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={pickBackground} />
              <Button type="button" busy={bgBusy} disabled={isSuspended} onClick={() => bgRef.current.click()}>
                <Icon name="image" size={17} />{current.background ? '更換背景圖' : '上傳背景圖'}
              </Button>
              {current.background && <Button type="button" className="is-quiet is-danger" onClick={removeBackground}>移除</Button>}
            </div>
          </div>
          <small>JPG、PNG 或 WebP，最大 4 MB。圖片會鋪滿整個個人主頁，選好後立即生效。</small>
        </div>
        <Field label="簽名" hint="顯示在空間名稱下方的一句話，最多 60 字">
          <input className="input" maxLength={60} value={form.tagline} placeholder="例如：慢慢來，比較快。" onChange={(e) => setForm({ ...form, tagline: e.target.value })} />
        </Field>
        <div className="field">
          <span>封面圖案</span>
          <div className="swatches" role="radiogroup" aria-label="封面圖案">
            {COVER_PATTERNS.map((p) => (
              <button key={p.value} type="button" role="radio" aria-checked={form.cover_pattern === p.value}
                className={`swatch is-cover ${form.cover_pattern === p.value ? 'is-active' : ''}`} onClick={() => setForm({ ...form, cover_pattern: p.value })}>
                <i><ThemeArt pattern={p.value} /></i>{p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>標題字體</span>
          <div className="swatches" role="radiogroup" aria-label="標題字體">
            {FONTS.map((f) => (
              <button key={f.value} type="button" role="radio" aria-checked={form.title_font === f.value}
                className={`swatch is-font ${form.title_font === f.value ? 'is-active' : ''}`} onClick={() => setForm({ ...form, title_font: f.value })}>
                <b className="title" data-font={f.value}>日記 Aa</b>{f.label}
              </button>
            ))}
          </div>
        </div>
        <SongField label="代表歌曲" value={{ song_url: form.song_url, song_title: form.song_title }} onChange={(v) => setForm((f) => ({ ...f, ...v }))} />
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Button className="is-primary" type="submit" busy={busy} disabled={isSuspended}>儲存空間設定</Button>
        </div>
      </form>

      <section className="glass panel is-roomy stack">
        <h2 className="heading">分類</h2>
        {categories.length > 0 && (
          <div>
            {categories.map((c) => (
              <div key={c.category_no} className="listrow" style={{ padding: '12px 0' }}>
                {renaming === c.category_no ? (
                  <form className="row grow is-tight" onSubmit={(e) => { e.preventDefault(); updateCategory(c.category_no, { category_name: renameText }); }}>
                    <input className="input grow" autoFocus required maxLength={40} value={renameText} aria-label="分類名稱" onChange={(e) => setRenameText(e.target.value)} />
                    <Button className="is-primary is-small" type="submit">儲存</Button>
                    <Button className="is-quiet is-small" type="button" onClick={() => setRenaming(null)}>取消</Button>
                  </form>
                ) : (
                  <>
                    <div className="grow row is-tight">
                      <b>{c.category_name}</b>
                      {c.status === 'retired' && <span className="badge">已停用</span>}
                      <span className="tiny muted num">{c.entry_count} 篇</span>
                    </div>
                    <Button className="is-quiet is-small" disabled={isSuspended} onClick={() => { setRenaming(c.category_no); setRenameText(c.category_name); }}>更名</Button>
                    <Button className="is-quiet is-small" disabled={isSuspended} onClick={() => updateCategory(c.category_no, { status: c.status === 'active' ? 'retired' : 'active' })}>
                      {c.status === 'active' ? '停用' : '重新啟用'}
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
        <form className="row" onSubmit={addCategory}>
          <input className="input grow" required maxLength={40} placeholder="新分類名稱" aria-label="新分類名稱" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
          <Button type="submit" disabled={isSuspended || !newCategory.trim()}><Icon name="plus" size={17} />新增分類</Button>
        </form>
      </section>

      <form className="glass panel is-roomy stack" onSubmit={changePassword}>
        <h2 className="heading">修改密碼</h2>
        <div className="form-grid">
          <Field label="目前的密碼">
            <input className="input" type="password" autoComplete="current-password" required value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} />
          </Field>
          <Field label="新密碼" hint="至少 8 個字元">
            <input className="input" type="password" autoComplete="new-password" required minLength={8} maxLength={72} value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} />
          </Field>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Button type="submit" busy={pwBusy}>更新密碼</Button>
        </div>
      </form>
    </main>
  );
}
