'use client';

// Đốm sáng theo chuột cho mọi .card / .kpi (CSS trong globals.css): một bộ nghe chung cho cả trang, không gắn vào từng thẻ.
import { useEffect } from 'react';

export function Spotlight() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let current: HTMLElement | null = null;
    let frame = 0;
    let last: PointerEvent | null = null;
    const clear = () => { current?.classList.remove('has-spot'); current = null; };
    const paint = () => {
      frame = 0;
      const e = last; if (!e) return;
      const el = (e.target as Element | null)?.closest?.('.card, .kpi') as HTMLElement | null;
      if (el !== current) { clear(); current = el; el?.classList.add('has-spot'); }
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${e.clientX - r.left}px`);
      el.style.setProperty('--my', `${e.clientY - r.top}px`);
    };
    const move = (e: PointerEvent) => { if (e.pointerType !== 'mouse') return; last = e; if (!frame) frame = requestAnimationFrame(paint); };
    const leave = () => clear();
    document.addEventListener('pointermove', move, { passive: true });
    document.documentElement.addEventListener('pointerleave', leave);
    return () => { document.removeEventListener('pointermove', move); document.documentElement.removeEventListener('pointerleave', leave); cancelAnimationFrame(frame); clear(); };
  }, []);
  return null;
}
