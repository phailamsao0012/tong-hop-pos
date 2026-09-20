'use client';

// Chủ đề Sáng / Tối / Hệ thống: lớp .dark trên <html> (đúng @custom-variant dark của ứng dụng), nhớ trong localStorage (thp_theme).
// layout.tsx có đoạn script đặt lớp trước khi vẽ để không nháy; ở đây chỉ đồng bộ khi người dùng đổi và khi hệ thống đổi.
import { useSyncExternalStore } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';
const KEY = 'thp_theme';
const QUERY = '(prefers-color-scheme: dark)';
let mode: ThemeMode = 'light';
if (typeof window !== 'undefined') {
  try { const v = localStorage.getItem(KEY); if (v === 'dark' || v === 'system') mode = v; } catch { /* bỏ qua */ }
}
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

const isDark = (m: ThemeMode) => m === 'dark' || (m === 'system' && window.matchMedia(QUERY).matches);
export function applyTheme(m: ThemeMode = mode) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', isDark(m));
}
export function setTheme(m: ThemeMode) {
  mode = m;
  try { localStorage.setItem(KEY, m); } catch { /* bỏ qua */ }
  applyTheme(m);
  for (const l of listeners) l();
}
export function useTheme(): ThemeMode {
  return useSyncExternalStore(subscribe, () => mode, () => 'light');
}
/** Theo dõi hệ thống đổi sáng/tối khi đang chọn "Hệ thống". Gọi một lần ở gốc ứng dụng. */
export function watchSystemTheme() {
  if (typeof window === 'undefined') return () => undefined;
  const mq = window.matchMedia(QUERY);
  const onChange = () => { if (mode === 'system') applyTheme('system'); };
  mq.addEventListener('change', onChange);
  applyTheme(mode);
  return () => mq.removeEventListener('change', onChange);
}
