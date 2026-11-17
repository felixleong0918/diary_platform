import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, photoUrl, today } from '../api.js';
import { useAuth, useFeedback } from '../context.jsx';
import Icon from '../components/Icon.jsx';
import { Button, Empty, Field, Segmented } from '../components/ui.jsx';

const MOODS = ['很差', '不太好', '普通', '不錯', '很好'];
const BLANK = { entry_date: today(), title: '', content: '', mood_score: null, category_no: '', visibility: 'private', tag_ids: [] };

export default function Editor() {
  const { entryId } = useParams();
  const { isSuspended } = useAuth();
  const { fail, toast } = useFeedback();
  const navigate = useNavigate();
  const fileRef = useRef(null);

  const [form, setForm] = useState(BLANK);
  const [meta, setMeta] = useState(null);       // { tags, categories }
  const [original, setOriginal] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);

  const load = async () => {
    try {
      const [tags, space, existing] = await Promise.all([
        api.get('/tags'),
        api.get('/me/space'),
        entryId ? api.get(`/entries/${entryId}`) : null,
      ]);
      const e = existing?.entry;
      if (e && !e.is_owner) throw new Error('只能編輯自己的日記');
      // 選單：active 的項目，加上這篇日記原本就引用的已停用項目
      const tagOptions = [...tags.tags.map((t) => ({ ...t, status: 'active' }))];
      for (const t of e?.tags || []) if (!tagOptions.some((o) => o.tag_id === t.tag_id)) tagOptions.push(t);
      setMeta({
        tags: tagOptions,
        categories: space.categories.filter((c) => c.status === 'active' || c.category_no === e?.category_no),
      });
      if (e) {
        setOriginal(e);
        setForm({
          entry_date: e.entry_date, title: e.title, content: e.content, mood_score: e.mood_score,
          category_no: e.category_no ?? '', visibility: e.visibility, tag_ids: e.tags.map((t) => t.tag_id),
        });
      }
      setConflict(false);
      setError('');
    } catch (err) { setLoadError(err); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [entryId]);
  useEffect(() => {
    if (!file) { setPreview(null); return undefined; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (isSuspended) return <main className="page is-narrow"><Empty title="帳號已被停權" /></main>;
  if (loadError) return <main className="page is-narrow"><Empty title="無法編輯這篇日記">{loadError.message}</Empty></main>;
  if (!meta) return <main className="page is-narrow"><div className="skeleton" style={{ minHeight: 420 }} /></main>;

  const set = (name, value) => setForm((f) => ({ ...f, [name]: value }));
  const toggleTag = (id) => set('tag_ids', form.tag_ids.includes(id) ? form.tag_ids.filter((t) => t !== id) : [...form.tag_ids, id]);
  const pickFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { fail({ message: '照片大小不可超過 5 MB' }); e.target.value = ''; return; }
    setFile(f);
    setRemovePhoto(false);
  };
  const hasExistingPhoto = original?.has_photo && !removePhoto && !file;

  const submit = async (ev) => {
    ev.preventDefault();
    if (!form.mood_score) { setError('請選擇今天的心情分數'); return; }
    setBusy(true);
    setError('');
    try {
      const body = { ...form, category_no: form.category_no === '' ? null : Number(form.category_no) };
      const saved = entryId
        ? await api.put(`/entries/${entryId}`, { ...body, version: original.version })
        : await api.post('/entries', body);
      const id = saved.entry.entry_id;
      try {
        if (file) {
          const data = new FormData();
          data.append('photo', file);
          await api.put(`/entries/${id}/photo`, data);
        } else if (removePhoto && original?.has_photo) {
          await api.del(`/entries/${id}/photo`);
        }
      } catch (err) {
        toast(`日記已儲存，但照片沒有更新：${err.message}`, 'error');
        navigate(`/entry/${id}/edit`, { replace: true });
        return;
      }
      toast(form.visibility === 'public' ? '已儲存並公開' : '已儲存為私密日記');
      navigate(`/entry/${id}`);
    } catch (err) {
      if (err.code === 'version_conflict') { setConflict(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }
      else setError(err.message);
    } finally { setBusy(false); }
  };

  return (
    <main className="page is-narrow">
      <form className="glass panel is-roomy stack is-loose" onSubmit={submit}>
        <div className="row is-between">
          <h1 className="title">{entryId ? '編輯日記' : '寫日記'}</h1>
          <Segmented
            label="可見度" value={form.visibility} onChange={(v) => set('visibility', v)}
            options={[{ value: 'private', label: '只有自己' }, { value: 'public', label: '公開分享' }]}
          />
        </div>
        {original?.status === 'hidden' && (
          <div className="notice is-danger"><Icon name="eyeoff" />這篇日記已被營運者隱藏。</div>
        )}
        {conflict && (
          <div className="notice is-danger" role="alert">
            <Icon name="info" />
            <div className="stack" style={{ gap: 8 }}>
              <span>這篇日記已在別處被修改，請重新載入後再編輯。</span>
              <div><Button className="is-small" type="button" onClick={load}>重新載入最新版本</Button></div>
            </div>
          </div>
        )}

        <div className="form-grid">
          <Field label="日期">
            <input className="input" type="date" required value={form.entry_date} onChange={(e) => set('entry_date', e.target.value)} />
          </Field>
          <Field label="分類" hint={meta.categories.length === 0 ? '還沒有分類，可到設定新增' : null}>
            <select className="select" value={form.category_no} onChange={(e) => set('category_no', e.target.value)}>
              <option value="">不分類</option>
              {meta.categories.map((c) => (
                <option key={c.category_no} value={c.category_no}>{c.category_name}{c.status === 'retired' ? '（已停用）' : ''}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="標題">
          <input className="input" required maxLength={150} value={form.title} placeholder="今天想記下什麼" onChange={(e) => set('title', e.target.value)} />
        </Field>
        <Field label="內文" hint={`${[...form.content].length.toLocaleString()} / 20,000 字`}>
          <textarea className="textarea is-tall" required maxLength={20000} value={form.content} onChange={(e) => set('content', e.target.value)} />
        </Field>

        <div className="field">
          <span>今天的心情</span>
          <div className="mood-picker" role="radiogroup" aria-label="心情分數">
            {MOODS.map((label, i) => (
              <button
                key={label} type="button" role="radio" aria-checked={form.mood_score === i + 1}
                className={form.mood_score === i + 1 ? 'is-active' : ''} onClick={() => set('mood_score', i + 1)}
              >
                <b>{i + 1}</b>{label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>標籤</span>
          <div className="row is-tight">
            {meta.tags.map((t) => {
              const on = form.tag_ids.includes(t.tag_id);
              return (
                <button
                  key={t.tag_id} type="button" aria-pressed={on}
                  className={`chip ${on ? 'is-active' : ''} ${t.status === 'retired' ? 'is-retired' : ''}`}
                  onClick={() => toggleTag(t.tag_id)}
                >
                  #{t.tag_name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="field">
          <span>照片</span>
          {(preview || hasExistingPhoto) && (
            <div className="article-photo" style={{ maxHeight: 280 }}>
              <img src={preview || photoUrl(original.entry_id, original.updated_at)} alt="照片預覽" style={{ maxHeight: 280 }} />
            </div>
          )}
          <div className="row is-tight">
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={pickFile} />
            <Button type="button" onClick={() => fileRef.current.click()}>
              <Icon name="image" size={17} />{preview || hasExistingPhoto ? '更換照片' : '選擇照片'}
            </Button>
            {(preview || hasExistingPhoto) && (
              <Button type="button" className="is-quiet is-danger" onClick={() => { setFile(null); setRemovePhoto(true); fileRef.current.value = ''; }}>移除照片</Button>
            )}
          </div>
        </div>

        {error && <p className="error-text" role="alert">{error}</p>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Link to={entryId ? `/entry/${entryId}` : '/me'} className="btn is-quiet">取消</Link>
          <Button className="is-primary" type="submit" busy={busy} disabled={conflict}>
            {form.visibility === 'public' ? '儲存並公開' : '儲存'}
          </Button>
        </div>
      </form>
    </main>
  );
}
