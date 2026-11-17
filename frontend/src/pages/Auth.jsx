import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, useFeedback } from '../context.jsx';
import { Button, Field } from '../components/ui.jsx';
import { AuthArt } from '../components/Art.jsx';

function useAuthForm(action, initial) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const bind = (name) => ({
    value: form[name],
    onChange: (e) => setForm((f) => ({ ...f, [name]: e.target.value })),
  });
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await action(form);
      navigate(location.state?.from || '/me', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return { bind, submit, error, busy };
}

export function Login() {
  const { user, login } = useAuth();
  const { toast } = useFeedback();
  const { bind, submit, error, busy } = useAuthForm(
    async (f) => { await login(f.username, f.password); toast('歡迎回來'); },
    { username: '', password: '' },
  );
  if (user && !busy) return <Navigate to="/me" replace />;
  return (
    <main className="auth">
      <div className="auth-side"><AuthArt variant="login" /></div>
      <div className="auth-main">
      <form className="auth-card stack is-loose" onSubmit={submit}>
        <div className="stack" style={{ gap: 6 }}>
          <h1 className="title">歡迎回來</h1>
          <p className="muted">回到你的空間，繼續寫今天的事。</p>
        </div>
        <Field label="登入帳號或電子郵件">
          <input className="input" autoComplete="username" autoFocus required {...bind('username')} />
        </Field>
        <Field label="密碼">
          <input className="input" type="password" autoComplete="current-password" required {...bind('password')} />
        </Field>
        {error && <p className="error-text" role="alert">{error}</p>}
        <Button className="is-primary" busy={busy} type="submit">登入</Button>
        <p className="small muted">還沒有帳號？<Link className="link" to="/register">建立一個</Link></p>
      </form>
      </div>
    </main>
  );
}

export function Register() {
  const { user, register } = useAuth();
  const { toast } = useFeedback();
  const { bind, submit, error, busy } = useAuthForm(
    async (f) => { await register(f); toast('空間已建立，開始寫第一篇吧'); },
    { username: '', email: '', nickname: '', blog_name: '', password: '' },
  );
  if (user && !busy) return <Navigate to="/me" replace />;
  return (
    <main className="auth">
      <div className="auth-side is-register"><AuthArt variant="register" /></div>
      <div className="auth-main">
      <form className="auth-card stack is-loose" onSubmit={submit}>
        <div className="stack" style={{ gap: 6 }}>
          <h1 className="title">建立帳號</h1>
          <p className="muted">註冊後就有一個自己的空間。</p>
        </div>
        <div className="form-grid">
          <Field label="登入帳號" hint="英文、數字、底線或句點，3 至 30 字">
            <input className="input" autoComplete="username" required minLength={3} maxLength={30} autoFocus {...bind('username')} />
          </Field>
          <Field label="暱稱">
            <input className="input" required maxLength={50} {...bind('nickname')} />
          </Field>
        </div>
        <Field label="電子郵件">
          <input className="input" type="email" autoComplete="email" required maxLength={254} {...bind('email')} />
        </Field>
        <Field label="空間名稱" hint="可留空">
          <input className="input" maxLength={100} {...bind('blog_name')} />
        </Field>
        <Field label="密碼" hint="至少 8 個字元">
          <input className="input" type="password" autoComplete="new-password" required minLength={8} maxLength={72} {...bind('password')} />
        </Field>
        {error && <p className="error-text" role="alert">{error}</p>}
        <Button className="is-primary" busy={busy} type="submit">建立帳號與空間</Button>
        <p className="small muted">已經有帳號？<Link className="link" to="/login">登入</Link></p>
      </form>
      </div>
    </main>
  );
}
