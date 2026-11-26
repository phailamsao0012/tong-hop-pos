'use client';
// Dòng báo "Kỳ dài, đang tính" khi một API báo cáo chạy nền (lib/ops/long-job.ts, anh Vũ 26/11/2026 14h02).
// app/api-fetch.ts ghi lúc bắt đầu chờ; dòng này đếm thời gian đã chờ. Hết chờ thì tự ẩn.
import { useEffect, useState, useSyncExternalStore } from 'react';

const waits = new Map<string, { at: number; ahead: number }>();
const listeners = new Set<() => void>();
/** Lượt chờ lâu nhất đang còn, và số lượt xếp trước nhiều nhất trong các API đang chờ. */
let snap: { since: number; ahead: number } | null = null;
const emit = () => {
  const all = [...waits.values()];
  snap = all.length ? { since: Math.min(...all.map((w) => w.at)), ahead: Math.max(...all.map((w) => w.ahead)) } : null;
  for (const l of listeners) l();
};

/** Ghi / cập nhật một lượt chờ (ahead = số lượt kỳ dài đang xếp trước, máy chủ báo trong 202). */
export function longWaitStart(id: string, at: number, ahead = 0) {
  const cur = waits.get(id);
  if (cur && cur.ahead === ahead) return;
  waits.set(id, { at: cur?.at ?? at, ahead });
  emit();
}
export function longWaitEnd(id: string) { if (waits.delete(id)) emit(); }

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** Đặt một lần trong khung trang. */
export function LongWaitNote() {
  const wait = useSyncExternalStore(subscribe, () => snap, () => null);
  const since = wait?.since ?? null;
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (since === null) return;
    const tick = () => setNow(Date.now());
    const t = window.setInterval(tick, 1000);
    const first = window.setTimeout(tick, 0);
    return () => { window.clearInterval(t); window.clearTimeout(first); };
  }, [since]);
  if (since === null) return null;
  const s = Math.max(0, Math.round(((now || since) - since) / 1000));
  return (
    <output aria-live="polite" className="long-wait">
      <span className="long-wait-dot" aria-hidden="true" />
      {wait && wait.ahead > 0 ? `Kỳ dài: đang chờ lượt trước, còn ${wait.ahead} lượt` : 'Kỳ dài, đang tính, có thể mất vài phút'} · đã chờ {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
    </output>
  );
}
