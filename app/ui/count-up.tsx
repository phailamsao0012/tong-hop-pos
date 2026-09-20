'use client';

// Số đếm lên 900 ms (ease-out bậc 3) khi vào tầm nhìn, một lần; đổi giá trị sau đó thì đếm từ giá trị cũ sang mới.
// Giá trị cuối được render sẵn (SSR / không JS / giảm chuyển động đều thấy số đúng). Chỉ dùng cho KPI, MiniStat, tâm donut — không dùng trong ô bảng.
import { useCallback, useEffect, useRef, useState } from 'react';
import { motionOK } from './motion';

const vi = new Intl.NumberFormat('vi-VN');
export function CountUp({ value, format = (n) => vi.format(Math.round(n)), duration = 900, className }: {
  value: number; format?: (n: number) => string; duration?: number; className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [text, setText] = useState(() => format(value));
  const fmt = useRef(format); fmt.current = format;
  const cur = useRef<number | null>(null); // số đang hiện (null = chưa từng đếm)
  const raf = useRef(0);
  const animate = useCallback((from: number, to: number) => {
    cancelAnimationFrame(raf.current);
    if (!motionOK() || from === to || !Number.isFinite(from) || !Number.isFinite(to)) { setText(fmt.current(to)); cur.current = to; return; }
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / duration), e = 1 - Math.pow(1 - p, 3);
      cur.current = from + (to - from) * e;
      setText(fmt.current(cur.current));
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  }, [duration]);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (cur.current !== null) { animate(cur.current, value); return; }
    setText(fmt.current(value)); // chưa vào tầm nhìn: vẫn hiện đúng số mới ngay
    if (!('IntersectionObserver' in window)) { animate(0, value); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((en) => en.isIntersecting)) { io.disconnect(); animate(0, value); }
    }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, [value, animate]);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  return <span ref={ref} className={className}>{text}</span>;
}
