'use client';

// Số kiểu đồng hồ lăn (anh Vũ 08/10/2026, theo video mẫu Arc UI): mỗi hàng chữ số là một bánh xe 0–9 quay tới đúng số,
// chữ số đi qua mép trên / dưới thì mờ và nhòe dần; số tăng thì bánh quay xuôi, giảm thì quay ngược; hàng bên phải dừng sau một chút.
// Lần đầu quay từ 0 khi vào tầm nhìn; đổi giá trị (đổi kỳ, đổi POS, rê chuột trên biểu đồ) thì quay từ số cũ sang số mới.
// Hàng chữ số giữ theo vị trí tính từ phải (999 → 1.000 vẫn giữ hàng đơn vị). Chữ cuối render sẵn (SSR / không JS / giảm chuyển động đều thấy số đúng),
// trình đọc màn hình đọc cả chuỗi. Chỉ dùng cho KPI, MiniStat, tâm donut, số to của biểu đồ — không dùng trong ô bảng.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const useIso = typeof window === 'undefined' ? useEffect : useLayoutEffect;
import { motionOK } from './motion';

const vi = new Intl.NumberFormat('vi-VN');
const DIGITS = '0123456789';
const isDigit = (c: string) => c >= '0' && c <= '9';

/** Đặt 10 chữ của một bánh theo vị trí `pos` (số thực): lệch bao nhiêu hàng thì dịch bấy nhiêu em, mờ và nhòe theo độ lệch. */
function paint(el: HTMLElement, pos: number) {
  const kids = el.children as HTMLCollectionOf<HTMLElement>;
  for (let g = 0; g < 10; g++) {
    let off = ((g - pos) % 10 + 10) % 10; if (off >= 5) off -= 10; // về [-5, 5)
    const a = Math.abs(off), s = kids[g].style;
    if (a >= 1) { s.visibility = 'hidden'; continue; }
    s.visibility = 'visible';
    s.transform = `translateY(${off}em)`;
    s.opacity = String(1 - a);
    s.filter = a > 0.02 ? `blur(${(a * 2).toFixed(2)}px)` : '';
  }
}

const ease = (p: number) => 1 - Math.pow(1 - p, 4);
/** Một hàng chữ số. `spin` = số vòng (có dấu) cần quay từ `from` tới `d`. */
function Wheel({ d, from, spin, delay, hold }: { d: number; from: number | null; spin: number; delay: number; /** Chờ vào tầm nhìn: đứng ở 0. */ hold: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const pos = useRef(d);
  useIso(() => {
    const el = ref.current; if (!el) return;
    if (hold) { paint(el, 0); return; }
    if (from === null || spin === 0 || !motionOK()) { pos.current = d; paint(el, d); return; }
    const start = from, dur = 620 + Math.min(Math.abs(spin), 10) * 18;
    let raf = 0, t0 = 0;
    paint(el, start);
    const step = (t: number) => {
      if (!t0) t0 = t + delay;
      const p = Math.max(0, Math.min(1, (t - t0) / dur));
      pos.current = start + spin * ease(p);
      paint(el, pos.current);
      if (p < 1) raf = requestAnimationFrame(step); else { pos.current = d; paint(el, d); }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [d, from, spin, delay, hold]);
  return (
    <span className="odo-w" aria-hidden="true">
      <span className="odo-z">0</span>
      <span ref={ref} className="odo-g">{DIGITS.split('').map((c, g) => <span key={c} style={g === d ? undefined : { visibility: 'hidden' }}>{c}</span>)}</span>
    </span>
  );
}

export function CountUp({ value, format = (n) => vi.format(Math.round(n)), className }: {
  value: number; format?: (n: number) => string; /** Giữ cho tương thích; thời gian quay cố định theo số vòng. */ duration?: number; className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const text = format(value);
  // Lần quay đang hiện: chuỗi cũ ('' = từ 0 lúc vừa vào tầm nhìn), hướng (+1 tăng, -1 giảm), số thứ tự để chạy lại.
  const [roll, setRoll] = useState<{ from: string; dir: 1 | -1; n: number } | null>(null);
  const shown = useRef<{ text: string; value: number } | null>(null);
  // Có chuyển động: mới gắn vào trang thì các bánh đứng ở 0 (trước khi trình duyệt vẽ) cho tới lúc vào tầm nhìn, tránh chớp số thật rồi mới về 0.
  const [hold, setHold] = useState(false);
  useIso(() => { if (!shown.current && 'IntersectionObserver' in window && motionOK()) setHold(true); }, []);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (shown.current) {
      if (shown.current.text !== text) setRoll((r) => ({ from: shown.current!.text, dir: value >= shown.current!.value ? 1 : -1, n: (r?.n ?? 0) + 1 }));
      shown.current = { text, value };
      return;
    }
    if (!('IntersectionObserver' in window) || !motionOK()) { shown.current = { text, value }; return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((en) => en.isIntersecting)) { io.disconnect(); shown.current = { text, value }; setHold(false); setRoll({ from: '', dir: 1, n: 1 }); }
    }, { threshold: 0.6 });
    io.observe(el);
    return () => io.disconnect();
  }, [text, value]);
  const chars = text.split('');
  const prev = roll ? roll.from.split('') : null;
  const n = chars.length;
  let order = 0;
  return (
    <span ref={ref} className={`odo ${className ?? ''}`}>
      <span className="sr-only">{text}</span>
      {chars.map((c, i) => {
        const place = n - 1 - i;
        if (!isDigit(c)) return <span key={`s${place}`} className="odo-sep" aria-hidden="true">{c}</span>;
        const d = Number(c);
        const old = prev ? prev[prev.length - 1 - place] : undefined;
        const f = prev ? (old && isDigit(old) ? Number(old) : 0) : null;
        // Quay theo hướng tăng / giảm, đúng quãng tới số mới; lần đầu (từ 0) luôn quay xuôi.
        let spin = 0;
        if (f !== null && roll) { const fwd = ((d - f) % 10 + 10) % 10; spin = roll.dir > 0 ? fwd : fwd ? fwd - 10 : 0; }
        const delay = Math.min(250, order++ * 35);
        return <Wheel key={`d${place}-${roll?.n ?? 0}`} d={d} from={f} spin={spin} delay={delay} hold={hold} />;
      })}
    </span>
  );
}
