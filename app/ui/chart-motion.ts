'use client';

// Chuyển động cho biểu đồ SVG tự vẽ (anh Vũ 08/10/2026, theo video mẫu Arc UI):
// - useInView: biết khung đã vào tầm nhìn (một lần) để vẽ dần đường / mọc cột lúc người xem thấy.
// - useTween: số liệu đổi (đổi kỳ, đổi bộ phận, đổi chỉ số) thì đường và cột "biến hình" từ hình cũ sang hình mới.
// - useGlide: con trỏ dọc và hộp gợi ý trượt mượt theo chuột (lò xo), không nhảy cóc.
// Giảm chuyển động (prefers-reduced-motion): mọi thứ về ngay giá trị cuối.
import { useEffect, useRef, useState, type RefObject } from 'react';
import { motionOK } from './motion';

export function useInView(ref: RefObject<Element | null>, threshold = 0.2) {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el || seen) return;
    if (!('IntersectionObserver' in window) || !motionOK()) { const r = requestAnimationFrame(() => setSeen(true)); return () => cancelAnimationFrame(r); }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); setSeen(true); } }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, seen, threshold]);
  return seen;
}

const ease = (p: number) => 1 - Math.pow(1 - p, 4); // ease-out bậc 4, gần với lò xo không nảy
/** Lấy mẫu lại mảng cũ theo độ dài mới để biến hình khi số điểm khác nhau. */
function resample(a: number[], n: number) {
  if (a.length === n) return a;
  if (!a.length) return Array(n).fill(0);
  return Array.from({ length: n }, (_, i) => { const t = n === 1 ? 0 : i * (a.length - 1) / (n - 1); const lo = Math.floor(t), hi = Math.min(a.length - 1, lo + 1); return a[lo] + (a[hi] - a[lo]) * (t - lo); });
}

/**
 * Mảng số "biến hình" tới `target`. Chưa vào tầm nhìn (`active` = false) thì giữ 0 (cột nằm ở đáy, đường nằm sát trục);
 * vào tầm nhìn thì mọc lên; đổi số sau đó thì chạy từ hình đang hiện. null (không có số) giữ nguyên là null.
 */
export function useTween(target: (number | null)[], { active = true, duration = 750, grow = true }: { active?: boolean; duration?: number; /** false: lần đầu hiện thẳng hình thật (đường thì vẽ dần bằng drawIn). */ grow?: boolean } = {}) {
  const sig = target.map((v) => v === null ? 'n' : v.toFixed(3)).join(',');
  const [cur, setCur] = useState<number[]>(() => !grow || (active && !motionOK()) ? target.map((v) => v ?? 0) : target.map(() => 0));
  const shown = useRef(cur);
  useEffect(() => { shown.current = cur; }, [cur]);
  const raf = useRef(0);
  useEffect(() => {
    if (!active) return;
    // Đọc đích từ chuỗi khóa (cùng nội dung với target) để effect chỉ chạy khi số thật sự đổi.
    const to = sig ? sig.split(',').map((v) => v === 'n' ? 0 : Number(v)) : [];
    cancelAnimationFrame(raf.current);
    const from = resample(shown.current, to.length);
    const t0 = performance.now();
    const step = (t: number) => {
      const p = motionOK() ? Math.min(1, (t - t0) / duration) : 1, e = ease(p);
      setCur(to.map((v, i) => from[i] + (v - from[i]) * e));
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [sig, active, duration]);
  // Trả mảng đúng độ dài target, giữ chỗ null.
  const out = resample(cur, target.length);
  return target.map((v, i) => v === null ? null : out[i]);
}

/** Số trượt mượt theo đích (lò xo tới hạn). null = ẩn; lần đầu hiện thì đặt thẳng tại đích. */
export function useGlide(target: number | null, speed = 0.28) {
  const [v, setV] = useState<number | null>(target);
  const cur = useRef<number | null>(target);
  const raf = useRef(0);
  useEffect(() => {
    cancelAnimationFrame(raf.current);
    if (target === null || cur.current === null || !motionOK()) { cur.current = target; setV(target); return; }
    const step = () => {
      const c = cur.current!, d = target - c;
      if (Math.abs(d) < 0.4) { cur.current = target; setV(target); return; }
      cur.current = c + d * speed; setV(cur.current);
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [target, speed]);
  return v;
}

/** Thuộc tính cho <path> vẽ dần từ trái sang phải một lần khi vào tầm nhìn (dùng keyframes `draw` trong globals.css). */
export const drawIn = (seen: boolean, delay = 0, duration = 1100) => ({
  pathLength: 1,
  className: seen ? 'chart-draw' : 'chart-undrawn',
  style: { animationDelay: `${delay}ms`, animationDuration: `${duration}ms` },
});
