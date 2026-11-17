import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 分頁清單：fetchPage(page) 回傳 { items, has_more }。deps 改變時從第一頁重新載入。
 */
export function usePaged(fetchPage, deps) {
  const [state, setState] = useState({ items: [], loading: true, more: false, error: null, loadingMore: false });
  const page = useRef(1);
  const run = useRef(0);

  const load = useCallback(async (reset) => {
    const id = ++run.current;
    const target = reset ? 1 : page.current + 1;
    setState((s) => (reset ? { ...s, loading: true, error: null } : { ...s, loadingMore: true }));
    try {
      const { items, has_more } = await fetchPage(target);
      if (id !== run.current) return;
      page.current = target;
      setState((s) => ({
        items: reset ? items : [...s.items, ...items], loading: false, loadingMore: false, more: has_more, error: null,
      }));
    } catch (error) {
      if (id !== run.current) return;
      setState((s) => ({ ...s, loading: false, loadingMore: false, error }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { load(true); }, [load]);

  return {
    ...state,
    loadMore: () => load(false),
    reload: () => load(true),
    setItems: (fn) => setState((s) => ({ ...s, items: fn(s.items) })),
  };
}

/** 單次載入的資料。 */
export function useData(fetcher, deps) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const run = useRef(0);
  const load = useCallback(async () => {
    const id = ++run.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fetcher();
      if (id === run.current) setState({ data, loading: false, error: null });
    } catch (error) {
      if (id === run.current) setState({ data: null, loading: false, error });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load, setData: (fn) => setState((s) => ({ ...s, data: fn(s.data) })) };
}
