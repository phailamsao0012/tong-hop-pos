'use client';

// Màn mở đầu logo MEGATECH (09/10/2026, làm theo video mẫu anh Vũ gửi): nền bản vẽ kỹ thuật, ngòi bút sáng vẽ viền ô logo, chữ M và
// đường tăng trưởng (có điểm neo như phần mềm vẽ), rồi đổ màu như chất lỏng dâng lên, quét màu chữ M, vệt sáng lướt qua; logo thu nhỏ
// lên trên, chữ MEGATECH hiện từ mờ sang rõ cùng dòng mô tả; cuối cùng logo phóng to xuyên qua màn hình để lộ trang đăng nhập.
// Chạy bằng một dòng thời gian (requestAnimationFrame) để mọi bước ăn khớp; bấm chuột hoặc phím bất kỳ để bỏ qua.
// Màu lấy từ logo: nền xanh lá #1b5a45 → #0f3328, chữ M xanh chanh #d9f36d, đường tăng trưởng cam #ff8a3d.
import { useEffect, useRef, useState } from 'react';
import './logo-intro.css';

// Hình logo (khung 64×64, giống public/logo.svg): ô bo góc, chữ M một nét liền, đường tăng trưởng.
const TILE = 'M16 0H48A16 16 0 0 1 64 16V48A16 16 0 0 1 48 64H16A16 16 0 0 1 0 48V16A16 16 0 0 1 16 0Z';
const M_SHAPE = 'M11 49V21Q11 18 14 18H17.7L32 33.2L46.3 18H50Q53 18 53 21V49Q53 52 50 52H47Q44 52 44 49V32.1L34.9 41.7A4 4 0 0 1 29.1 41.7L20 32.1V49Q20 52 17 52H14Q11 52 11 49Z';
const GROWTH = 'M14 48L27 41L37 45L52 32';
const TILE_PTS: [number, number][] = [[16, 0], [48, 0], [64, 16], [64, 48], [48, 64], [16, 64], [0, 48], [0, 16]];
const M_PTS: [number, number][] = [[11, 49], [11, 21], [14, 18], [17.7, 18], [32, 33.2], [46.3, 18], [50, 18], [53, 21], [53, 49], [50, 52], [47, 52], [44, 49], [44, 32.1], [34.9, 41.7], [29.1, 41.7], [20, 32.1], [20, 49], [17, 52], [14, 52]];
const GROWTH_PTS: [number, number][] = [[14, 48], [27, 41], [37, 45], [52, 32]];

// Dòng thời gian (giây).
const T = {
  grid: [0, 0.35], tile: [0.25, 1.2], m: [0.75, 1.75], growth: [1.4, 2.0], liquid: [1.9, 2.6], mFill: [2.3, 2.85], line: [2.65, 3.0],
  guidesOut: [2.75, 3.1], shine: [3.05, 3.55], lift: [3.45, 4.05], word: [3.7, 4.35], tag: [4.15, 4.6], wordOut: [5.35, 5.65],
  zoom: [5.5, 6.15], fade: [5.85, 6.3], reveal: 5.9, end: 6.35,
} as const;
const WORD = 'MEGATECH';

const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const span = (t: number, [a, b]: readonly [number, number]) => clamp((t - a) / (b - a));
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeIn = (x: number) => x * x * x;
const backOut = (x: number) => { const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };

/** Phần đường (0..1) mà mỗi điểm neo nằm trên, để điểm neo bật ra đúng lúc ngòi bút đi qua. */
function anchorsAt(path: SVGPathElement, pts: [number, number][]) {
  const len = path.getTotalLength(); const n = 600; const samples: { x: number; y: number }[] = [];
  for (let i = 0; i <= n; i++) samples.push(path.getPointAtLength((len * i) / n));
  return pts.map(([x, y]) => { let best = 0, bd = Infinity; samples.forEach((s, i) => { const d = (s.x - x) ** 2 + (s.y - y) ** 2; if (d < bd) { bd = d; best = i; } }); return best / n; });
}

type Stage = 'play' | 'reveal' | 'done';

export function LogoIntro({ onReveal, onDone }: { onReveal: () => void; onDone: () => void }) {
  const [stage, setStage] = useState<Stage>('play');
  const root = useRef<HTMLDivElement>(null);
  const cbs = useRef({ onReveal, onDone }); cbs.current = { onReveal, onDone };

  useEffect(() => {
    const el = root.current; if (!el) return;
    const $ = <E extends Element>(s: string) => el.querySelector(s) as E;
    const $$ = <E extends Element>(s: string) => Array.from(el.querySelectorAll(s)) as E[];
    // Không thích chuyển động: bỏ qua, vào thẳng trang đăng nhập.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { cbs.current.onReveal(); cbs.current.onDone(); setStage('done'); return; }

    const tilePath = $<SVGPathElement>('.li-o-tile'), mPath = $<SVGPathElement>('.li-o-m'), gPath = $<SVGPathElement>('.li-o-g');
    const draws = [
      { path: tilePath, win: T.tile, pen: $<SVGGElement>('.li-pen-tile'), dots: $$<SVGRectElement>('.li-a-tile'), at: anchorsAt(tilePath, TILE_PTS) },
      { path: mPath, win: T.m, pen: $<SVGGElement>('.li-pen-m'), dots: $$<SVGRectElement>('.li-a-m'), at: anchorsAt(mPath, M_PTS) },
      { path: gPath, win: T.growth, pen: $<SVGGElement>('.li-pen-g'), dots: $$<SVGRectElement>('.li-a-g'), at: anchorsAt(gPath, GROWTH_PTS) },
    ].map((d) => ({ ...d, len: d.path.getTotalLength() }));
    for (const d of draws) d.path.style.strokeDasharray = String(d.len);
    const grid = $<HTMLDivElement>('.li-grid'), guides = $<SVGGElement>('.li-guides'), outlines = $<SVGGElement>('.li-outlines');
    const liquid = $<SVGGElement>('.li-liquid'), rim = $<SVGPathElement>('.li-rim'), wave = $<SVGPathElement>('.li-wave'), mClip = $<SVGRectElement>('.li-mclip');
    const mFill = $<SVGPathElement>('.li-m'), lineDark = $<SVGPathElement>('.li-g-dark'), lineOrange = $<SVGPathElement>('.li-g-orange'), dot = $<SVGGElement>('.li-dot');
    const shine = $<SVGRectElement>('.li-shine'), glow = $<HTMLDivElement>('.li-glow'), mark = $<HTMLDivElement>('.li-mark');
    const letters = $$<HTMLSpanElement>('.li-word span'), rule = $<HTMLDivElement>('.li-rule'), tag = $<HTMLParagraphElement>('.li-tag'), lockup = $<HTMLDivElement>('.li-lockup');
    const gLen = lineOrange.getTotalLength();
    lineDark.style.strokeDasharray = lineOrange.style.strokeDasharray = String(gLen);

    let raf = 0, t0 = 0, revealed = false, finished = false, skipAt = -1;
    const finish = () => { if (finished) return; finished = true; cancelAnimationFrame(raf); setStage('done'); cbs.current.onDone(); };
    const reveal = () => { if (revealed) return; revealed = true; setStage('reveal'); cbs.current.onReveal(); };

    const frame = (now: number) => {
      if (!t0) t0 = now;
      let t = (now - t0) / 1000;
      // Bỏ qua: nhảy tới đoạn phóng to cuối.
      if (skipAt >= 0) t = Math.max(t, T.wordOut[0] + (now - skipAt) / 1000);

      grid.style.opacity = String(easeOut(span(t, T.grid)) * (1 - span(t, T.guidesOut) * 0.75) * (1 - span(t, T.fade)));
      guides.style.opacity = String(0.9 * easeOut(span(t, T.grid)) * (1 - easeOut(span(t, T.guidesOut))));
      outlines.style.opacity = String(1 - easeOut(span(t, T.guidesOut)));

      // Ngòi bút sáng chạy theo từng nét; điểm neo bật ra khi bút đi qua.
      for (const d of draws) {
        const p = easeInOut(span(t, d.win));
        d.path.style.strokeDashoffset = String(d.len * (1 - p));
        const on = p > 0 && p < 1;
        if (on) { const pt = d.path.getPointAtLength(d.len * p); d.pen.setAttribute('transform', `translate(${pt.x} ${pt.y})`); }
        d.pen.style.opacity = on ? '1' : '0';
        d.dots.forEach((r, i) => { const k = clamp((p - d.at[i]) / 0.06 + (p >= 1 ? 1 : 0)); r.style.opacity = String(k); r.style.transform = `scale(${0.3 + 0.7 * backOut(k)})`; });
      }

      // Đổ màu ô logo như nước dâng: sóng chạy ngang, mép sóng đi từ đáy lên đỉnh.
      const lq = easeInOut(span(t, T.liquid));
      liquid.style.opacity = lq > 0 ? '1' : '0';
      rim.style.opacity = String(easeOut(span(t, [T.liquid[1] - 0.15, T.shine[0]])));
      wave.setAttribute('transform', `translate(${-64 + ((t * 70) % 64)} ${70 - 80 * lq})`);
      // Chữ M được quét màu chéo từ trái sang phải.
      const mf = easeInOut(span(t, T.mFill));
      mClip.setAttribute('width', String(130 * mf));
      mFill.style.opacity = mf > 0 ? '1' : '0';
      // Đường tăng trưởng cam vẽ đậm, điểm cuối nảy lên.
      const ln = easeOut(span(t, T.line));
      lineDark.style.strokeDashoffset = lineOrange.style.strokeDashoffset = String(gLen * (1 - ln));
      lineDark.style.opacity = lineOrange.style.opacity = ln > 0 ? '1' : '0';
      const dk = span(t, [T.line[1] - 0.12, T.line[1] + 0.25]);
      dot.style.transform = `scale(${backOut(dk) * (dk > 0 ? 1 : 0)})`;
      // Vệt sáng lướt chéo qua logo.
      const sh = easeInOut(span(t, T.shine));
      shine.setAttribute('x', String(-60 + 150 * sh)); shine.style.opacity = sh > 0 && sh < 1 ? '1' : '0';
      glow.style.opacity = String(0.85 * easeOut(span(t, [T.liquid[1] - 0.2, T.shine[1]])) * (1 - span(t, T.zoom)));

      // Logo thu nhỏ, đi lên; chữ MEGATECH hiện từng chữ từ mờ sang rõ; vạch nhỏ và dòng mô tả theo sau.
      const lift = easeInOut(span(t, T.lift)), zoom = easeIn(span(t, T.zoom));
      const scale = (1 - 0.36 * lift) * (1 + 11 * zoom);
      mark.style.transform = `translateY(${-30 * lift * (1 - zoom)}px) scale(${scale})`;
      mark.style.opacity = String(1 - span(t, [T.zoom[0] + 0.3, T.zoom[1]]));
      const wo = easeOut(span(t, T.wordOut));
      letters.forEach((s, i) => {
        const k = easeOut(span(t, [T.word[0] + i * 0.05, T.word[0] + i * 0.05 + 0.4]));
        s.style.opacity = String(k * (1 - wo)); s.style.filter = `blur(${(1 - k) * 10 + wo * 8}px)`; s.style.transform = `translateY(${(1 - k) * 10}px)`;
      });
      const tg = easeOut(span(t, T.tag));
      rule.style.transform = `scaleX(${easeOut(span(t, [T.word[1] - 0.25, T.word[1] + 0.2]))})`; rule.style.opacity = String(1 - wo);
      tag.style.opacity = String(tg * (1 - wo)); tag.style.transform = `translateY(${(1 - tg) * 6}px)`;
      lockup.style.transform = `translateY(${(1 - lift) * 40}px)`;
      el.style.setProperty('--li-fade', String(1 - easeInOut(span(t, T.fade))));

      if (t >= T.reveal) reveal();
      if (t >= T.end) { finish(); return; }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const skip = () => { if (skipAt < 0) skipAt = performance.now(); };
    window.addEventListener('keydown', skip); el.addEventListener('pointerdown', skip);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', skip); el.removeEventListener('pointerdown', skip); };
  }, []);

  if (stage === 'done') return null;
  const box = (pts: [number, number][], cls: string, s = 2.2) => pts.map(([x, y], i) => <rect key={i} className={cls} x={x - s / 2} y={y - s / 2} width={s} height={s} style={{ transformOrigin: `${x}px ${y}px` }} />);
  return (
    <div ref={root} className={`li-root ${stage === 'reveal' ? 'is-reveal' : ''}`} role="img" aria-label="MEGATECH" title="Bấm để bỏ qua">
      <div className="li-grid" />
      <div className="li-stage">
        <div className="li-mark">
          <div className="li-glow" />
          <svg viewBox="-12 -12 88 88" className="li-svg" aria-hidden="true">
            <defs>
              <linearGradient id="li-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#1f6a51" /><stop offset="1" stopColor="#0f3328" /></linearGradient>
              <linearGradient id="li-lime" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ecff9b" /><stop offset=".55" stopColor="#d9f36d" /><stop offset="1" stopColor="#b8e04a" /></linearGradient>
              <linearGradient id="li-shine-g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#fff" stopOpacity=".55" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
              <clipPath id="li-tile-clip"><path d={TILE} /></clipPath>
              <clipPath id="li-m-clip"><rect className="li-mclip" x="-10" y="-20" width="0" height="110" transform="skewX(-22)" /></clipPath>
              <filter id="li-pen-glow" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="1.6" /></filter>
            </defs>
            {/* Đường dựng hình mờ như bản vẽ: các trục canh, vòng tròn, đường chéo theo chân chữ M. */}
            <g className="li-guides">
              {[0, 11, 20, 32, 44, 53, 64].map((x) => <line key={`x${x}`} x1={x} y1={-12} x2={x} y2={76} />)}
              {[0, 18, 32, 52, 64].map((y) => <line key={`y${y}`} x1={-12} y1={y} x2={76} y2={y} />)}
              <circle cx="32" cy="32" r="22" /><circle cx="32" cy="32" r="31" /><circle cx="32" cy="39" r="4" />
              <line x1="-2" y1="2.6" x2="40" y2="47" /><line x1="66" y1="2.6" x2="24" y2="47" />
            </g>
            {/* Lớp màu (đổ dần). */}
            <g clipPath="url(#li-tile-clip)">
              <g className="li-liquid">
                <path className="li-wave" d="M0 6Q8 0 16 6T32 6T48 6T64 6T80 6T96 6T112 6T128 6V100H0Z" fill="url(#li-bg)" />
              </g>
              <rect className="li-shine" x="-60" y="-10" width="26" height="90" fill="url(#li-shine-g)" transform="skewX(-22)" />
            </g>
            <path className="li-rim" d={TILE} />
            <path className="li-m" d={M_SHAPE} fill="url(#li-lime)" clipPath="url(#li-m-clip)" />
            <path className="li-g-dark" d={GROWTH} />
            <path className="li-g-orange" d={GROWTH} />
            <g className="li-dot" style={{ transformOrigin: '52px 32px' }}><circle cx="52" cy="32" r="3.6" fill="#ff8a3d" stroke="#0f3328" strokeWidth="1.5" /></g>
            {/* Nét viền đang vẽ + điểm neo + ngòi bút sáng. */}
            <g className="li-outlines">
              <path className="li-o li-o-tile" d={TILE} />
              <path className="li-o li-o-m" d={M_SHAPE} />
              <path className="li-o li-o-g" d={GROWTH} />
              {box(TILE_PTS, 'li-a li-a-tile')}
              {box(M_PTS, 'li-a li-a-m', 1.8)}
              {box(GROWTH_PTS, 'li-a li-a-g', 2)}
              {(['tile', 'm', 'g'] as const).map((k) => (
                <g key={k} className={`li-pen li-pen-${k}`}><circle r="3.2" filter="url(#li-pen-glow)" /><circle r="1.1" className="li-pen-core" /></g>
              ))}
            </g>
          </svg>
        </div>
        <div className="li-lockup">
          <div className="li-word" aria-hidden="true">{WORD.split('').map((c, i) => <span key={i} className={i >= 4 ? 'is-accent' : ''}>{c}</span>)}</div>
          <div className="li-rule" />
          <p className="li-tag">Tổng hợp POS · Điều hành 6 POS</p>
        </div>
      </div>
      <p className="li-skip">Bấm để bỏ qua</p>
    </div>
  );
}

/** Tia chớp lóe sau thẻ đăng nhập (như video mẫu), màu xanh chanh của logo. */
export function LoginBolts() {
  const bolt = (cls: string) => (
    <svg className={`li-bolt ${cls}`} viewBox="0 0 60 300" aria-hidden="true">
      <path d="M38 0L30 46L41 58L22 112L34 122L14 186L27 196L8 300" />
      <path d="M30 46L12 70M22 112L44 150M14 186L2 214" />
    </svg>
  );
  return <div className="li-bolts">{bolt('is-a')}{bolt('is-b')}</div>;
}
