// 幾何圖案：自己畫的抽象構成（圓、方、弧線與紙頁），不描繪人物或實景。
// 顏色全部取自 styles.css 的粉彩變數，線條用 currentColor，深淺色外觀都會跟著變。

const Lines = ({ x, y, widths, gap = 22 }) => (
  <g className="stroke">
    {widths.map((w, i) => <path key={i} d={`M${x} ${y + i * gap}h${w}`} />)}
  </g>
);

const Dots = ({ x, y, cols, rows, gap = 16 }) => (
  <g className="ink">
    {Array.from({ length: cols * rows }, (_, i) => (
      <circle key={i} cx={x + (i % cols) * gap} cy={y + Math.floor(i / cols) * gap} r="2.2" />
    ))}
  </g>
);

const Burst = ({ cx, cy, r = 26 }) => (
  <g className="stroke spin">
    {[0, 45, 90, 135].map((a) => (
      <path key={a} d={`M${cx - r} ${cy}h${r * 2}`} transform={`rotate(${a} ${cx} ${cy})`} />
    ))}
  </g>
);

/** 首頁主視覺：一疊日記紙頁、太陽與筆。 */
export function HeroArt() {
  return (
    <svg className="art" viewBox="0 0 520 440" role="img" aria-label="紙頁與幾何圖形組成的插圖">
      <circle className="float-b" cx="352" cy="148" r="118" fill="var(--yellow-2)" />
      <path d="M36 404a150 150 0 0 1 150-150v150z" fill="var(--blue-2)" />
      <rect className="float-a" x="392" y="286" width="92" height="92" rx="10" fill="var(--green-2)" transform="rotate(14 438 332)" />
      <circle cx="96" cy="96" r="30" fill="var(--purple-2)" />
      <path d="M450 60l34 58h-68z" fill="var(--red-2)" />
      <Dots x={396} y={196} cols={6} rows={4} />
      <Burst cx={84} cy={212} />

      <g transform="rotate(7 300 250)">
        <rect className="paper" x="196" y="118" width="204" height="264" rx="8" />
      </g>
      <g transform="rotate(-6 262 246)">
        <rect className="paper" x="160" y="112" width="204" height="264" rx="8" />
        <circle cx="190" cy="150" r="7" fill="var(--red-2)" />
        <path className="stroke" d="M210 150h92" />
        <Lines x={186} y={196} widths={[150, 132, 150, 96]} />
        <rect x="186" y="290" width="150" height="58" rx="6" fill="var(--teal)" stroke="currentColor" strokeWidth="2.5" />
        <path className="stroke" d="M198 334l26-24 20 16 28-30 52 38" />
      </g>

      <g className="float-a" transform="rotate(38 372 318)">
        <rect className="ink" x="362" y="226" width="20" height="150" rx="4" />
        <path className="paper" d="M362 376h20l-10 26z" />
        <rect x="362" y="226" width="20" height="22" rx="4" fill="var(--yellow-2)" stroke="currentColor" strokeWidth="2.5" />
      </g>
      <path className="stroke" d="M250 60c40-34 96-34 136 0" />
    </svg>
  );
}

/** 登入、註冊頁：攤開的筆記本。 */
export function AuthArt({ variant = 'login' }) {
  const a = variant === 'login' ? 'var(--red-2)' : 'var(--yellow-2)';
  const b = variant === 'login' ? 'var(--blue-2)' : 'var(--purple-2)';
  return (
    <svg className="art" viewBox="0 0 420 420" role="img" aria-label="攤開的筆記本插圖">
      <circle className="float-b" cx="292" cy="128" r="92" fill={a} />
      <rect className="float-a" x="40" y="250" width="110" height="110" rx="12" fill={b} transform="rotate(-12 95 305)" />
      <path d="M300 392a84 84 0 0 1 84-84v84z" fill="var(--green-2)" />
      <Dots x={48} y={64} cols={5} rows={5} />
      <Burst cx={352} cy={262} r={22} />
      <g transform="rotate(-4 210 220)">
        <rect className="paper" x="70" y="130" width="140" height="190" rx="6" />
        <rect className="paper" x="210" y="130" width="140" height="190" rx="6" />
        <path className="stroke" d="M210 130v190" />
        <Lines x={92} y={168} widths={[96, 80, 96, 60]} gap={24} />
        <Lines x={232} y={168} widths={[96, 96]} gap={24} />
        <circle cx="280" cy="264" r="26" fill="var(--teal)" stroke="currentColor" strokeWidth="2.5" />
        <path className="stroke" d="M268 264l9 9 16-18" />
      </g>
    </svg>
  );
}

/** 空狀態的小圖。 */
export function EmptyArt() {
  return (
    <svg className="art" viewBox="0 0 120 96" aria-hidden="true">
      <circle cx="84" cy="34" r="26" fill="var(--yellow-2)" />
      <path d="M10 90a34 34 0 0 1 34-34v34z" fill="var(--blue-2)" />
      <g transform="rotate(-6 58 54)">
        <rect className="paper" x="34" y="20" width="50" height="64" rx="4" />
        <Lines x={43} y={36} widths={[32, 26, 32]} gap={12} />
      </g>
    </svg>
  );
}

/** 空間頁首的背景圖樣：顏色跟著主題（currentColor = --tint-2）。 */
export function ThemeArt() {
  return (
    <svg className="theme-art" viewBox="0 0 1080 340" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <circle cx="70" cy="300" r="150" fill="currentColor" opacity="0.55" />
      <rect x="150" y="36" width="64" height="64" rx="8" fill="currentColor" opacity="0.35" transform="rotate(18 182 68)" />
      <path d="M1080 0v170a170 170 0 0 1-170-170z" fill="currentColor" opacity="0.55" />
      <circle cx="930" cy="250" r="46" fill="none" stroke="currentColor" strokeWidth="14" opacity="0.5" />
      <g fill="currentColor" opacity="0.7">
        {Array.from({ length: 24 }, (_, i) => (
          <circle key={i} cx={780 + (i % 6) * 18} cy={58 + Math.floor(i / 6) * 18} r="2.6" />
        ))}
      </g>
      <path d="M250 300c50-40 110-40 160 0" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}
