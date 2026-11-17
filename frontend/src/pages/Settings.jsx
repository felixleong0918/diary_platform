import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth, useFeedback, useLook } from '../context.jsx';
import { useData } from '../hooks.js';
import Icon from '../components/Icon.jsx';
import { Button, Field } from '../components/ui.jsx';

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

  useEffect(() => {
    if (space.data && !form) {
      setForm({
        nickname: space.data.nickname, blog_name: space.data.blog.blog_name,
        description: space.data.blog.description || '', theme_id: space.data.blog.theme_id,
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
