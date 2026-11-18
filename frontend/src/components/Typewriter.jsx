// 逐字打出、停留、逐字刪除，再換下一句。
// 螢幕閱讀器只會讀到固定的第一句；系統設定為減少動態效果時不打字，直接顯示第一句。
import { useEffect, useState } from 'react';

const TYPE_MS = 220;     // 每打一個字
const ERASE_MS = 110;    // 每刪一個字
const HOLD_MS = 2600;    // 打完後停留
const GAP_MS = 600;      // 刪完後到下一句

export default function Typewriter({ lines }) {
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  // 第一句一開始就完整顯示，避免頁面載入時標題是空的
  const [state, setState] = useState({ index: 0, count: [...lines[0].join('\n')].length, phase: 'hold' });
  const chars = [...lines[state.index].join('\n')];

  useEffect(() => {
    if (reduced || lines.length < 2) return undefined;
    const { index, count, phase } = state;
    const step = () => {
      if (document.hidden) return;                       // 分頁在背景時暫停，回來後由下一次計時接續
      if (phase === 'hold') setState({ index, count, phase: 'erase' });
      else if (phase === 'erase') setState(count > 0 ? { index, count: count - 1, phase } : { index: (index + 1) % lines.length, count: 0, phase: 'type' });
      else setState(count < chars.length ? { index, count: count + 1, phase } : { index, count, phase: 'hold' });
    };
    const delay = phase === 'hold' ? HOLD_MS : phase === 'erase' ? (count > 0 ? ERASE_MS : GAP_MS) : TYPE_MS;
    const timer = setInterval(step, delay);              // 用 interval：背景時跳過，回到前景自動繼續
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, reduced, lines]);

  const typed = chars.slice(0, state.count).join('').split('\n');
  return (
    <>
      <span className="sr-only">{lines[0].join('')}</span>
      <span className="typewriter" aria-hidden="true">
        {/* 固定保留兩行的高度，打字時下方的內容不會跳動 */}
        <span>{typed[0]}{typed.length === 1 && <i className={`caret ${state.phase === 'hold' ? 'is-idle' : ''}`} />}</span>
        <span>{typed[1] ?? ''}{typed.length === 2 && <i className={`caret ${state.phase === 'hold' ? 'is-idle' : ''}`} />}</span>
      </span>
    </>
  );
}
