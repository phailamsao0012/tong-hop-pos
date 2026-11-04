'use client';

// Chủ hệ thống bấm F5 vẫn đứng nguyên chỗ cũ (anh Vũ 04/11/2026: "chỉ riêng admin thôi, đang ở tab nào, khi f5 thì sẽ đứng nguyên
// đúng chỗ đó, không thay đổi, để sửa xem lại cho dễ"): nhớ trang (?view= trên địa chỉ), mục Cài đặt đang mở và vị trí cuộn của tab
// trình duyệt này (sessionStorage, đóng tab là quên). Bộ lọc POS / kỳ vốn đã được nhớ ở pos-store, period-store.
import { useEffect, useRef } from 'react';

const KEY = 'thp_stay';
type Saved = { view: string; cfg: string | null; scroll: number };

function read(): Saved | null {
  try { return JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as Saved | null; } catch { return null; }
}
function write(s: Saved) {
  try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch { /* bỏ qua */ }
}

/** Mục Cài đặt đã mở trước khi tải lại (chỉ khi vẫn ở đúng trang Cài đặt). */
export function savedSettingsSection(view: string): string | null {
  const s = read();
  return s && s.view === view ? s.cfg : null;
}

export function useStayOnReload(enabled: boolean, view: string, cfg: string | null) {
  const restored = useRef(false);
  // Ghi trang lên địa chỉ để F5 mở lại đúng trang (máy chủ cũng vẽ thẳng trang đó), và nhớ mục Cài đặt.
  useEffect(() => {
    if (!enabled) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('view') !== view) {
      url.searchParams.set('view', view);
      window.history.replaceState(window.history.state, '', url);
    }
    const prev = read();
    write({ view, cfg, scroll: prev && prev.view === view && prev.cfg === cfg ? prev.scroll : 0 });
  }, [enabled, view, cfg]);
  // Nhớ vị trí cuộn (gom lại 300 ms một lần).
  useEffect(() => {
    if (!enabled) return;
    let timer = 0;
    const onScroll = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { const s = read(); if (s) write({ ...s, scroll: Math.round(window.scrollY) }); }, 300);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); window.clearTimeout(timer); };
  }, [enabled]);
  // Tải lại: cuộn về chỗ cũ khi trang đã đủ dài (số liệu tải dần), thử tối đa 8 giây, người dùng tự cuộn thì thôi.
  useEffect(() => {
    if (!enabled || restored.current) return;
    restored.current = true;
    const s = read();
    if (!s || s.view !== view || s.scroll < 50) return;
    window.history.scrollRestoration = 'manual';
    let stop = false;
    const quit = () => { stop = true; };
    window.addEventListener('wheel', quit, { once: true, passive: true });
    window.addEventListener('touchstart', quit, { once: true, passive: true });
    const started = Date.now();
    const tick = () => {
      if (stop) return;
      if (document.documentElement.scrollHeight - window.innerHeight >= s.scroll) { window.scrollTo({ top: s.scroll }); return; }
      if (Date.now() - started < 8000) window.setTimeout(tick, 250);
      else window.scrollTo({ top: s.scroll });
    };
    tick();
    return () => { stop = true; window.removeEventListener('wheel', quit); window.removeEventListener('touchstart', quit); };
  }, [enabled, view]);
}
