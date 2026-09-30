'use client';

// Kỳ đang chọn, dùng chung cho mọi trang và nhớ qua lần mở sau (yêu cầu 30/09/2026: toàn web chỉ một bộ lọc ngày).
// Chọn kỳ có sẵn (Hôm nay, Tuần trước…) thì lưu tên kỳ và tính lại ngày theo hôm nay mỗi lần mở; "Tùy chọn" thì giữ đúng ngày đã chọn.
import { useSyncExternalStore } from 'react';
import { DATE_RE, todayVn } from '@/lib/report-time';
import { isPreset, presetRange } from '@/lib/periods';

export type PeriodState = { preset: string; start: string; end: string };
const KEY = 'thp.period';
const DEFAULT = 'month';
let current: PeriodState | null = null;
let loadedDay = '';
const listeners = new Set<() => void>();

function fromPreset(preset: string, today: string): PeriodState {
  const r = presetRange(preset, today) ?? presetRange(DEFAULT, today)!;
  return { preset: isPreset(preset) && preset !== 'custom' ? preset : DEFAULT, ...r };
}
function read(): PeriodState {
  const today = todayVn();
  // Qua ngày mới thì tính lại kỳ có sẵn (Hôm nay hôm qua mở máy vẫn là hôm nay).
  if (current && loadedDay === today) return current;
  loadedDay = today;
  let next = fromPreset(current?.preset ?? DEFAULT, today);
  if (current?.preset === 'custom') next = current;
  else if (!current && typeof window !== 'undefined') {
    try {
      const saved = JSON.parse(window.localStorage.getItem(KEY) ?? 'null') as Partial<PeriodState> | null;
      if (saved?.preset === 'custom' && DATE_RE.test(saved.start ?? '') && DATE_RE.test(saved.end ?? '') && saved.start! <= saved.end!)
        next = { preset: 'custom', start: saved.start!, end: saved.end! > today ? today : saved.end! };
      else if (saved?.preset && isPreset(saved.preset)) next = fromPreset(saved.preset, today);
    } catch { /* trình duyệt chặn lưu trữ: dùng mặc định */ }
  }
  current = next;
  return current;
}
function write(next: PeriodState) {
  current = next;
  loadedDay = todayVn();
  try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* bỏ qua */ }
  for (const l of listeners) l();
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function setPeriodPreset(preset: string) {
  const r = presetRange(preset, todayVn());
  write(r ? { preset, ...r } : { ...read(), preset: 'custom' });
}
export function setPeriodStart(start: string) { if (DATE_RE.test(start)) { const p = read(); write({ preset: 'custom', start, end: p.end < start ? start : p.end }); } }
export function setPeriodEnd(end: string) { if (DATE_RE.test(end)) { const p = read(); write({ preset: 'custom', start: p.start > end ? end : p.start, end }); } }
export function setPeriodRange(start: string, end: string, preset = 'custom') { if (DATE_RE.test(start) && DATE_RE.test(end)) write({ preset, start, end }); }

const SERVER: PeriodState = fromPreset(DEFAULT, todayVn());
/** Kỳ đang chọn + các hàm đổi kỳ — thay cho useState preset/start/end riêng của từng trang. */
export function usePeriod() {
  const p = useSyncExternalStore(subscribe, read, () => SERVER);
  return { ...p, setPreset: setPeriodPreset, setStart: setPeriodStart, setEnd: setPeriodEnd, setRange: setPeriodRange };
}
