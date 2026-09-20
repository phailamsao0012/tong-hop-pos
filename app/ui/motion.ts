'use client';

// Tôn trọng "Giảm chuyển động" của hệ điều hành: mọi hiệu ứng JS (đếm số, cuộn mượt, hoạt ảnh biểu đồ, trễ tooltip) đều hỏi motionOK().
import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/** true khi người dùng KHÔNG tắt hiệu ứng (phía máy chủ luôn true). */
export const motionOK = () => typeof window === 'undefined' || !window.matchMedia?.(QUERY).matches;

const subscribe = (cb: () => void) => {
  const mq = window.matchMedia?.(QUERY);
  if (!mq) return () => undefined;
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};
/** Hook phản ứng khi người dùng đổi thiết lập giảm chuyển động. */
export function useMotionOK() {
  return useSyncExternalStore(subscribe, motionOK, () => true);
}

/** Cuộn tới phần tử: mượt khi được phép, tức thì khi giảm chuyển động. Dùng chung cho các trang thay vì scrollIntoView({ behavior: 'smooth' }). */
export function scrollToEl(el: Element | null | undefined, options: ScrollIntoViewOptions = {}) {
  if (!el) return;
  el.scrollIntoView({ block: 'start', ...options, behavior: motionOK() ? (options.behavior ?? 'smooth') : 'auto' });
}
/** Cuộn cửa sổ lên đầu trang theo cùng quy tắc. */
export function scrollTop() {
  window.scrollTo({ top: 0, behavior: motionOK() ? 'smooth' : 'auto' });
}
