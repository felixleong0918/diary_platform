// 營運 Dashboard 的圖表。單一序列用墨色，兩個以上的序列才用分類色（--viz-1 之後依固定順序）。
// 每張圖都有滑鼠與鍵盤可用的數值提示，多序列的圖另附圖例與資料表。
import { useEffect, useId, useRef, useState } from 'react';

const fmt = (n) => Number(n).toLocaleString();
const md = (ymd) => ymd.slice(5).replace('-', '/');
const tick = (n, compact) => (compact ? `${n / 1000}K` : fmt(n));

function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/** 把 [lo, hi] 取成整齊的刻度。 */
function niceScale(lo, hi, count = 4) {
  if (hi <= lo) hi = lo + 1;
  const raw = (hi - lo) / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, [1, 2, 5, 10].find((m) => m * pow >= raw) * pow);
  const min = Math.floor(lo / step) * step;
  const max = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let v = min; v <= max + step / 2; v += step) ticks.push(Math.round(v));
  return { min, max, ticks };
}

function Legend({ series, mark }) {
  return (
    <ul className="viz-legend">
      {series.map((s) => (
        <li key={s.key}><i className={`viz-key is-${mark}`} style={{ background: s.color }} />{s.label}</li>
      ))}
    </ul>
  );
}

function DataTable({ labels, series }) {
  return (
    <details className="viz-table">
      <summary>查看資料表</summary>
      <div className="table-wrap" style={{ maxHeight: 260, overflowY: 'auto' }}>
        <table className="table">
          <thead><tr><th>日期</th>{series.map((s) => <th key={s.key} className="is-right">{s.label}</th>)}</tr></thead>
          <tbody>
            {labels.map((day, i) => (
              <tr key={day}>
                <td className="num">{day}</td>
                {series.map((s) => <td key={s.key} className="is-right num">{fmt(s.values[i])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/**
 * 以日期為橫軸的圖。type = 'line'（可多條）或 'stack'（堆疊柱）。
 * series: [{ key, label, color, values }]；zero=false 時縱軸不從 0 開始（只用於折線）。
 */
export function TimeChart({ labels, series, type = 'line', height = 220, zero = true, title }) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState(null);
  const n = labels.length;
  const multi = series.length > 1;
  const totals = labels.map((_, i) => series.reduce((s, x) => s + x.values[i], 0));
  const all = type === 'stack' ? totals : series.flatMap((s) => s.values);
  const scale = niceScale(zero || type === 'stack' ? 0 : Math.min(...all), Math.max(...all, 1));
  const compact = scale.max >= 10000;
  const m = { top: 10, right: 14, bottom: 24, left: compact ? 40 : Math.max(30, String(fmt(scale.max)).length * 7 + 10) };
  const w = Math.max(0, width - m.left - m.right);
  const h = height - m.top - m.bottom;
  const band = n > 0 ? w / n : 0;
  const x = (i) => m.left + (type === 'stack' ? band * (i + 0.5) : n > 1 ? (w * i) / (n - 1) : w / 2);
  const y = (v) => m.top + h - ((v - scale.min) / (scale.max - scale.min)) * h;
  const barW = Math.max(1, Math.min(24, band - 2));

  const locate = (clientX, target) => {
    const rect = target.getBoundingClientRect();
    const px = clientX - rect.left - m.left;
    const i = type === 'stack' ? Math.floor(px / band) : Math.round((px / w) * (n - 1));
    setActive(Math.max(0, Math.min(n - 1, i)));
  };
  const onKey = (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    setActive((i) => Math.max(0, Math.min(n - 1, (i ?? n - 1) + (e.key === 'ArrowRight' ? 1 : -1))));
  };
  const xTicks = n > 2 ? [0, Math.floor((n - 1) / 2), n - 1] : [...labels.keys()];
  const tipLeft = active === null ? 0 : Math.max(70, Math.min(width - 70, x(active)));

  return (
    <div className="viz">
      {multi && <Legend series={series} mark={type === 'stack' ? 'box' : 'line'} />}
      <div ref={ref} className="viz-plot" style={{ height }}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={title} tabIndex={0}
            onPointerMove={(e) => locate(e.clientX, e.currentTarget)} onPointerDown={(e) => locate(e.clientX, e.currentTarget)}
            onPointerLeave={() => setActive(null)} onBlur={() => setActive(null)} onKeyDown={onKey}
            onFocus={() => setActive((i) => i ?? n - 1)}>
            {scale.ticks.map((t) => (
              <g key={t}>
                <line className="viz-grid" x1={m.left} x2={m.left + w} y1={y(t)} y2={y(t)} />
                <text className="viz-tick" x={m.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle">{tick(t, compact)}</text>
              </g>
            ))}
            {xTicks.map((i, k) => (
              <text key={i} className="viz-tick" x={x(i)} y={height - 6}
                textAnchor={type === 'stack' ? 'middle' : k === 0 ? 'start' : k === xTicks.length - 1 ? 'end' : 'middle'}>{md(labels[i])}</text>
            ))}
            {type === 'stack' && labels.map((day, i) => {
              let base = 0;
              const top = series.findLast((s) => s.values[i] > 0);
              return (
                <g key={day} opacity={active === null || active === i ? 1 : 0.45}>
                  {series.map((s) => {
                    const v = s.values[i];
                    if (!v) return null;
                    const y0 = y(base); const y1 = y(base + v); base += v;
                    const gap = s === top ? 0 : 2;                         // 段與段之間留 2px 底色
                    const hh = Math.max(1, y0 - y1 - gap);
                    const r = s === top ? Math.min(4, barW / 2, hh) : 0;   // 只有最上端是圓角
                    const left = x(i) - barW / 2;
                    return (
                      <path key={s.key} fill={s.color}
                        d={`M${left},${y1 + gap + hh} V${y1 + gap + r} Q${left},${y1 + gap} ${left + r},${y1 + gap} H${left + barW - r} Q${left + barW},${y1 + gap} ${left + barW},${y1 + gap + r} V${y1 + gap + hh} Z`} />
                    );
                  })}
                </g>
              );
            })}
            {type === 'line' && series.map((s) => (
              <g key={s.key}>
                {!multi && (
                  <path fill={s.color} opacity="0.08"
                    d={`M${x(0)},${y(scale.min)} ${s.values.map((v, i) => `L${x(i)},${y(v)}`).join(' ')} L${x(n - 1)},${y(scale.min)} Z`} />
                )}
                <path className="viz-line" stroke={s.color} d={s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ')} />
                {active === null && <circle className="viz-dot" fill={s.color} cx={x(n - 1)} cy={y(s.values[n - 1])} r="4" />}
              </g>
            ))}
            {type === 'line' && active !== null && (
              <g>
                <line className="viz-cross" x1={x(active)} x2={x(active)} y1={m.top} y2={m.top + h} />
                {series.map((s) => <circle key={s.key} className="viz-dot" fill={s.color} cx={x(active)} cy={y(s.values[active])} r="4" />)}
              </g>
            )}
          </svg>
        )}
        {active !== null && (
          <div className="viz-tip" style={{ left: tipLeft }} aria-live="polite">
            <span className="viz-tip-title num">{labels[active]}</span>
            {series.map((s) => (
              <span key={s.key} className="viz-tip-row">
                {multi && <i className="viz-key is-line" style={{ background: s.color }} />}
                <b className="num">{fmt(s.values[active])}</b><span>{s.label}</span>
              </span>
            ))}
            {type === 'stack' && multi && <span className="viz-tip-row"><b className="num">{fmt(totals[active])}</b><span>合計</span></span>}
          </div>
        )}
      </div>
      {multi && <DataTable labels={labels} series={series} />}
    </div>
  );
}

/** 一個整體拆成幾個部分。parts: [{ key, label, value, color, onDark }] */
export function SegmentedBar({ parts, unit = '' }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const [active, setActive] = useState(null);
  const share = (p) => (total ? (p.value / total) * 100 : 0);
  return (
    <div className="viz">
      <div className="seg" role="img" aria-label={parts.map((p) => `${p.label} ${fmt(p.value)}${unit}（${share(p).toFixed(1)}%）`).join('、')}>
        {parts.filter((p) => p.value > 0).map((p) => (
          <span key={p.key} tabIndex={0} style={{ flexGrow: p.value, background: p.color, color: p.onDark ? '#fff' : '#111' }}
            onPointerEnter={() => setActive(p.key)} onPointerLeave={() => setActive(null)}
            onFocus={() => setActive(p.key)} onBlur={() => setActive(null)}>
            {share(p) >= 12 && <b className="num">{share(p).toFixed(0)}%</b>}
          </span>
        ))}
      </div>
      <ul className="viz-legend is-values">
        {parts.map((p) => (
          <li key={p.key} className={active && active !== p.key ? 'is-dim' : ''}>
            <i className="viz-key is-box" style={{ background: p.color }} />{p.label}
            <span className="num muted">{fmt(p.value)}{unit}{share(p) < 12 ? `（${share(p).toFixed(1)}%）` : ''}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const DOW = ['一', '二', '三', '四', '五', '六', '日'];

/** 星期 × 小時的熱度圖。cells: [{ dow: 1..7, hour: 0..23, n }] */
export function Heatmap({ cells, unit = '篇' }) {
  const [tip, setTip] = useState(null);
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const c of cells) grid[c.dow - 1][c.hour] = c.n;
  const max = Math.max(1, ...cells.map((c) => c.n));
  const tone = (n) => (n === 0 ? 'var(--fill)' : `color-mix(in oklab, var(--viz-1) ${Math.round(14 + 86 * (n / max))}%, var(--fill))`);
  const id = useId();
  return (
    <div className="viz">
      <div className="heat" role="table" aria-label="各星期與各小時的公開日記篇數">
        <span />
        {Array.from({ length: 24 }, (_, h) => <span key={h} className="heat-hour num">{h % 6 === 0 || h === 23 ? h : ''}</span>)}
        {grid.map((row, d) => (
          <div key={DOW[d]} role="row" style={{ display: 'contents' }}>
            <span className="heat-day" role="rowheader">週{DOW[d]}</span>
            {row.map((n, h) => (
              <i key={h} role="cell" tabIndex={0} style={{ background: tone(n) }}
                aria-label={`週${DOW[d]} ${h} 時：${fmt(n)} ${unit}`} aria-describedby={id}
                onPointerEnter={() => setTip({ d, h, n })} onPointerLeave={() => setTip(null)}
                onFocus={() => setTip({ d, h, n })} onBlur={() => setTip(null)} />
            ))}
          </div>
        ))}
      </div>
      <div className="row is-between" style={{ marginTop: 10 }}>
        <span id={id} className="tiny num" style={{ minHeight: 20 }}>
          {tip ? <><b style={{ color: 'var(--ink)' }}>{fmt(tip.n)} {unit}</b>　週{DOW[tip.d]} {String(tip.h).padStart(2, '0')}:00–{String(tip.h).padStart(2, '0')}:59</> : '橫軸為小時（台北時間）'}
        </span>
        <span className="heat-scale tiny">少{[0, 0.25, 0.5, 0.75, 1].map((v) => <i key={v} style={{ background: tone(v * max) }} />)}多 <span className="num">{fmt(max)}</span></span>
      </div>
    </div>
  );
}

/** 小型趨勢線，放在數字卡片裡。 */
export function Sparkline({ values, height = 32 }) {
  const [ref, width] = useWidth();
  const max = Math.max(1, ...values);
  const n = values.length;
  const pt = (v, i) => `${n > 1 ? (width * i) / (n - 1) : 0},${2 + (height - 4) * (1 - v / max)}`;
  return (
    <div ref={ref} style={{ height }} aria-hidden="true">
      {width > 0 && <svg width={width} height={height}><path className="viz-spark" d={values.map((v, i) => `${i ? 'L' : 'M'}${pt(v, i)}`).join(' ')} /></svg>}
    </div>
  );
}
