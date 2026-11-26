'use client';
// Dòng báo "Kỳ dài, đang tính" khi một API báo cáo chạy nền (lib/ops/long-job.ts, anh Vũ 26/11/2026 14h02).
// app/api-fetch.ts ghi lúc bắt đầu chờ; dòng này đếm thời gian đã chờ. Hết chờ thì tự ẩn.
import { useEffect, useState, useSyncExternalStore } from 'react';

const waits = new Map<string, number>();
const listeners = new Set<() => void>();
let snap: number | null = null;
const emit = () => { snap = waits.size ? Math.min(...waits.values()) : null; for (const l of listeners) l(); };

export function longWaitStart(id: string, at: number) { if (!waits.has(id)) { waits.set(id, at); emit(); } }
export function longWaitEnd(id: string) { if (waits.delete(id)) emit(); }

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** Đặt một lần trong khung trang. */
export function LongWaitNote() {
  const since = useSyncExternalStore(subscribe, () => snap, () => null);
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
      Kỳ dài, đang tính, có thể mất vài phút · đã chờ {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
    </output>
  );
}
