import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context.jsx';
import NavBar from './components/NavBar.jsx';
import Explore from './pages/Explore.jsx';
import { Login, Register } from './pages/Auth.jsx';
import Blog from './pages/Blog.jsx';
import Entry from './pages/Entry.jsx';
import Editor from './pages/Editor.jsx';
import MyDiary from './pages/MyDiary.jsx';
import Settings from './pages/Settings.jsx';
import Following from './pages/Following.jsx';
import Favorites from './pages/Favorites.jsx';
import Operator from './pages/Operator.jsx';
import { Empty } from './components/ui.jsx';

function Protected({ operator = false, children }) {
  const { user, ready, isOperator } = useAuth();
  const location = useLocation();
  if (!ready) return null;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (operator && !isOperator) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  return (
    <>
      <NavBar />
      <Routes>
        <Route path="/" element={<Explore />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/blog/:blogId" element={<Blog />} />
        <Route path="/entry/:entryId" element={<Entry />} />
        <Route path="/write" element={<Protected><Editor /></Protected>} />
        <Route path="/entry/:entryId/edit" element={<Protected><Editor /></Protected>} />
        <Route path="/me" element={<Protected><MyDiary /></Protected>} />
        <Route path="/settings" element={<Protected><Settings /></Protected>} />
        <Route path="/following" element={<Protected><Following /></Protected>} />
        <Route path="/favorites" element={<Protected><Favorites /></Protected>} />
        <Route path="/operator" element={<Protected operator><Operator /></Protected>} />
        <Route path="*" element={<main className="page is-narrow"><Empty title="找不到這個頁面">網址可能有誤，或頁面已經不存在。</Empty></main>} />
      </Routes>
    </>
  );
}
