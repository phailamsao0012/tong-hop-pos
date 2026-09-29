'use client';

// POS đang chọn, dùng chung cho mọi trang và nhớ qua lần mở sau (yêu cầu 29/09/2026: chọn POS nào thì sang trang khác vẫn giữ,
// khỏi phải bỏ chọn lại từng trang). Lưu trong trình duyệt (localStorage); máy chủ vẫn lọc theo phạm vi POS của tài khoản.
import { useSyncExternalStore } from 'react';
import { POS } from '@/lib/report-model';

const KEY = 'thp.posIds';
const ALL: string[] = POS.map((p) => p.id);
const valid = new Set(ALL);
let current: string[] = ALL;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === 'undefined') return;
  loaded = true;
  try {
    const saved = JSON.parse(window.localStorage.getItem(KEY) ?? 'null') as unknown;
    if (Array.isArray(saved)) { const ids = saved.filter((x): x is string => typeof x === 'string' && valid.has(x)); if (ids.length) current = ids; }
  } catch { /* trình duyệt chặn lưu trữ: dùng mặc định */ }
}
const subscribe = (l: () => void) => { load(); listeners.add(l); return () => { listeners.delete(l); }; };

export function setPosIds(ids: string[]) {
  const next = ids.filter((x) => valid.has(x));
  current = next.length ? ALL.filter((x) => next.includes(x)) : ALL;
  try { window.localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* bỏ qua */ }
  for (const l of listeners) l();
}
/** [POS đang chọn, đổi POS] — thay cho useState riêng của từng trang. */
export function usePosIds(): [string[], (ids: string[]) => void] {
  const ids = useSyncExternalStore(subscribe, () => { load(); return current; }, () => ALL);
  return [ids, setPosIds];
}
