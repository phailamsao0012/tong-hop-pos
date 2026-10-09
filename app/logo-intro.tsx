'use client';

// Màn mở đầu logo MEGATECH (09/10/2026, làm theo video mẫu anh Vũ gửi, dùng logo chính thức của công ty anh gửi cùng ngày):
// nền bản vẽ kỹ thuật, ngòi bút sáng lần lượt vẽ viền cánh đồng, con bò, con lợn, con gà, hai cây thông (có điểm neo như phần mềm
// vẽ); rồi màu xanh lá dâng lên như nước, vệt sáng lướt qua; logo thu nhỏ lên trên, chữ MEGATECH hiện từ mờ sang rõ cùng dòng
// mô tả; cuối cùng logo phóng to xuyên qua màn hình để lộ trang đăng nhập, nơi chính logo đó thành linh vật sống (megatech-mascot.tsx).
// Chạy bằng một dòng thời gian (requestAnimationFrame) để mọi bước ăn khớp; bấm chuột hoặc phím bất kỳ để bỏ qua.
import { useEffect, useRef, useState } from 'react';
import { EMBLEM_H, EMBLEM_W, LOGO } from './logo-megatech-hinh';
import { LogoGradient } from './megatech-mascot';
import './logo-intro.css';

// Các nét vẽ lần lượt: [tên lớp, đoạn thời gian vẽ (giây), màu nét].
const STROKES = [
  { key: 'field', d: LOGO.field, win: [0.25, 1.25], color: '#d9f0b0' },
  { key: 'cow', d: LOGO.cowBody + LOGO.cowHead, win: [0.55, 1.65], color: '#e8f5ec' },
  { key: 'pig', d: LOGO.pig, win: [0.95, 1.85], color: '#ffffff' },
  { key: 'chick', d: LOGO.chickBody + LOGO.chickHead, win: [1.25, 2.0], color: '#c9ec7a' },
  { key: 'tree', d: LOGO.tree1 + LOGO.tree2, win: [1.55, 2.05], color: '#c9ec7a' },
] as const;
const ANCHORS = 22;
/** Các phần màu xanh của logo (lợn là phần trắng, tô riêng). */
const ART = [LOGO.field, LOGO.cowBody, LOGO.cowHead, LOGO.chickBody, LOGO.chickHead, LOGO.tree1, LOGO.tree2];

// Dòng thời gian (giây).
const T = {
  grid: [0, 0.35], liquid: [1.95, 2.7], pig: [2.25, 2.75], guidesOut: [2.6, 3.0], shine: [2.95, 3.5], pop: [2.7, 3.15],
  lift: [3.45, 4.05], word: [3.7, 4.35], tag: [4.15, 4.6], wordOut: [5.35, 5.65], zoom: [5.5, 6.15], fade: [5.85, 6.3], reveal: 5.9, end: 6.35,
} as const;
const WORD = 'MEGATECH';
const SVGNS = 'http://www.w3.org/2000/svg';

const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const span = (t: number, [a, b]: readonly [number, number]) => clamp((t - a) / (b - a));
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeIn = (x: number) => x * x * x;
const backOut = (x: number) => { const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };

type Stage = 'play' | 'reveal' | 'done';

export function LogoIntro({ onReveal, onDone }: { onReveal: () => void; onDone: () => void }) {
  const [stage, setStage] = useState<Stage>('play');
  const root = useRef<HTMLDivElement>(null);
  const cbs = useRef({ onReveal, onDone });
  useEffect(() => { cbs.current = { onReveal, onDone }; });

  useEffect(() => {
    const el = root.current; if (!el) return;
    const $ = <E extends Element>(s: string) => el.querySelector(s) as E;
    const $$ = <E extends Element>(s: string) => Array.from(el.querySelectorAll(s)) as E[];
    // Không thích chuyển động: bỏ qua, vào thẳng trang đăng nhập.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { cbs.current.onReveal(); cbs.current.onDone(); setStage('done'); return; }

    // Mỗi nét: độ dài, ngòi bút, các điểm neo rải đều trên nét (tạo bằng JS vì cần độ dài thật của đường).
    const anchorLayer = $<SVGGElement>('.li-anchors');
    const draws = STROKES.map((s) => {
      const path = $<SVGPathElement>(`.li-o-${s.key}`); const len = path.getTotalLength();
      path.style.strokeDasharray = String(len);
      const dots = Array.from({ length: ANCHORS }, (_, i) => {
        const at = (i + 0.5) / ANCHORS, p = path.getPointAtLength(len * at);
        const r = document.createElementNS(SVGNS, 'rect');
        r.setAttribute('x', String(p.x - 4)); r.setAttribute('y', String(p.y - 4)); r.setAttribute('width', '8'); r.setAttribute('height', '8');
        r.setAttribute('class', 'li-a'); r.style.stroke = s.color; r.style.transformOrigin = `${p.x}px ${p.y}px`;
        anchorLayer.appendChild(r);
        return { r, at };
      });
      return { path, len, win: s.win, pen: $<SVGGElement>(`.li-pen-${s.key}`), dots };
    });
    const grid = $<HTMLDivElement>('.li-grid'), guides = $<SVGGElement>('.li-guides'), outlines = $<SVGGElement>('.li-outlines');
    const liquid = $<SVGGElement>('.li-liquid'), wave = $<SVGPathElement>('.li-wave'), pigFill = $<SVGGElement>('.li-pigfill');
    const shine = $<SVGRectElement>('.li-shine'), glow = $<HTMLDivElement>('.li-glow'), mark = $<HTMLDivElement>('.li-mark'), art = $<SVGGElement>('.li-art');
    const letters = $$<HTMLSpanElement>('.li-word span'), rule = $<HTMLDivElement>('.li-rule'), tag = $<HTMLParagraphElement>('.li-tag'), lockup = $<HTMLDivElement>('.li-lockup');

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
        for (const { r, at } of d.dots) { const k = clamp((p - at) / 0.05); r.style.opacity = String(k); r.style.transform = `scale(${0.3 + 0.7 * backOut(k)})`; }
      }

      // Màu xanh dâng lên như nước (sóng chạy ngang), lợn trắng hiện dần, rồi cả logo nảy nhẹ.
      const lq = easeInOut(span(t, T.liquid));
      liquid.style.opacity = lq > 0 ? '1' : '0';
      wave.setAttribute('transform', `translate(${-700 + ((t * 760) % 700)} ${EMBLEM_H + 60 - (EMBLEM_H + 140) * lq})`);
      pigFill.style.opacity = String(easeOut(span(t, T.pig)));
      const pop = span(t, T.pop);
      art.style.transform = `scale(${1 + 0.05 * Math.sin(Math.PI * pop)})`;
      // Vệt sáng lướt chéo qua logo.
      const sh = easeInOut(span(t, T.shine));
      shine.setAttribute('x', String(-500 + 1400 * sh)); shine.style.opacity = sh > 0 && sh < 1 ? '1' : '0';
      glow.style.opacity = String(0.8 * easeOut(span(t, [T.liquid[1] - 0.3, T.shine[1]])) * (1 - span(t, T.zoom)));

      // Logo thu nhỏ, đi lên; chữ MEGATECH hiện từng chữ từ mờ sang rõ; vạch nhỏ và dòng mô tả theo sau.
      const lift = easeInOut(span(t, T.lift)), zoom = easeIn(span(t, T.zoom));
      mark.style.transform = `translateY(${-30 * lift * (1 - zoom)}px) scale(${(1 - 0.36 * lift) * (1 + 11 * zoom)})`;
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
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', skip); el.removeEventListener('pointerdown', skip); anchorLayer.replaceChildren(); };
  }, []);

  if (stage === 'done') return null;
  return (
    <div ref={root} className={`li-root ${stage === 'reveal' ? 'is-reveal' : ''}`} aria-hidden="true" title="Bấm để bỏ qua">
      <div className="li-grid" />
      <div className="li-stage">
        <div className="li-mark">
          <div className="li-glow" />
          <svg viewBox={`-60 -70 ${EMBLEM_W + 120} ${EMBLEM_H + 140}`} className="li-svg" aria-hidden="true">
            <defs>
              <LogoGradient id="li-g" />
              <linearGradient id="li-shine-g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#fff" stopOpacity=".5" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
              <clipPath id="li-art-clip">{ART.map((d, i) => <path key={i} d={d} clipRule="evenodd" />)}</clipPath>
              <filter id="li-pen-glow" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="14" /></filter>
            </defs>
            {/* Đường dựng hình mờ như bản vẽ: trục canh, vòng tròn, đường mặt đất. */}
            <g className="li-guides">
              {[16, 120, 335, 548, 650].map((x) => <line key={`x${x}`} x1={x} y1={-70} x2={x} y2={EMBLEM_H + 70} />)}
              {[20, 160, 330, 630].map((y) => <line key={`y${y}`} x1={-60} y1={y} x2={EMBLEM_W + 60} y2={y} />)}
              <circle cx="335" cy="330" r="300" /><circle cx="335" cy="330" r="200" /><circle cx="602" cy="92" r="40" />
              <path d="M0 300Q300 360 670 320" />
            </g>
            <g className="li-art">
              {/* Lớp màu (đổ dần như nước dâng). */}
              <g className="li-liquid" clipPath="url(#li-art-clip)">
                <path className="li-wave" d="M0 60Q87.5 0 175 60T350 60T525 60T700 60T875 60T1050 60T1225 60T1400 60V1000H0Z" fill="url(#li-g)" />
                <rect className="li-shine" x="-500" y="-80" width="260" height="820" fill="url(#li-shine-g)" transform="skewX(-22)" />
              </g>
              <g className="li-pigfill"><path d={LOGO.pig + LOGO.pigTail} fill="#f4f9ef" fillRule="evenodd" /></g>
              {/* Nét viền đang vẽ + điểm neo + ngòi bút sáng. */}
              <g className="li-outlines">
                {STROKES.map((s) => <path key={s.key} className={`li-o li-o-${s.key}`} d={s.d} style={{ stroke: s.color }} />)}
                <g className="li-anchors" />
                {STROKES.map((s) => (
                  <g key={s.key} className={`li-pen li-pen-${s.key}`}><circle r="26" filter="url(#li-pen-glow)" style={{ fill: s.color }} /><circle r="8" className="li-pen-core" /></g>
                ))}
              </g>
            </g>
          </svg>
        </div>
        <div className="li-lockup">
          <div className="li-word" aria-hidden="true">{WORD.split('').map((c, i) => <span key={i}>{c}</span>)}</div>
          <div className="li-rule" />
          <p className="li-tag">Nông nghiệp Megatech Việt Nam</p>
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
      <path pathLength={1} d="M38 0L30 46L41 58L22 112L34 122L14 186L27 196L8 300" />
      <path pathLength={1} d="M30 46L12 70M22 112L44 150M14 186L2 214" />
    </svg>
  );
  return <div className="li-bolts">{bolt('is-a')}{bolt('is-b')}</div>;
}
