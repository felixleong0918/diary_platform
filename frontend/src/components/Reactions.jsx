// 對日記的表情回應：每人一種，再按一次取消。
import { useState } from 'react';
import { api } from '../api.js';
import { useAuth, useFeedback } from '../context.jsx';
import { useData } from '../hooks.js';
import Icon from './Icon.jsx';

export const REACTION_LABEL = { like: '喜歡', hug: '抱抱', cheer: '加油', haha: '好笑', sad: '難過' };
const ICON = { like: 'heart', hug: 'hug', cheer: 'bolt', haha: 'smile', sad: 'frown' };

export default function Reactions({ entryId, disabled }) {
  const { user, isSuspended } = useAuth();
  const { fail } = useFeedback();
  const [busy, setBusy] = useState(false);
  const state = useData(() => api.get(`/entries/${entryId}/reactions`), [entryId, user?.user_id]);
  if (!state.data) return null;
  const { reactions, my_reaction: mine } = state.data;
  const total = Object.values(reactions).reduce((a, b) => a + b, 0);
  const canReact = user && !isSuspended && !disabled;

  const pick = async (kind) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = mine === kind ? await api.del(`/entries/${entryId}/reaction`) : await api.put(`/entries/${entryId}/reaction`, { reaction: kind });
      state.setData(() => r);
    } catch (err) { fail(err); } finally { setBusy(false); }
  };

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="reactions" role="group" aria-label="表情回應">
        {Object.keys(REACTION_LABEL).map((kind) => (
          <button key={kind} type="button" className={`reaction ${mine === kind ? 'is-active' : ''}`} aria-pressed={mine === kind}
            disabled={!canReact} onClick={() => pick(kind)}>
            <Icon name={ICON[kind]} size={18} filled={mine === kind && kind === 'like'} />
            <span>{REACTION_LABEL[kind]}</span>
            {reactions[kind] > 0 && <b className="num">{reactions[kind]}</b>}
          </button>
        ))}
      </div>
      {!user && total > 0 && <p className="tiny">登入後可以回應這篇日記。</p>}
    </div>
  );
}
