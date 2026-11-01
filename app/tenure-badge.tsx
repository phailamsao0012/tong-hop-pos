'use client';

// Nhãn thâm niên T0, T1… cạnh tên nhân viên (anh Vũ 31/10/2026). Tải một lần cho cả web, giữ trong bộ nhớ.
import { useEffect, useState } from 'react';
import { JOIN_SOURCE_LABELS } from '@/lib/reports/growth-calc';
import type { Tenure } from '@/lib/teams/tenure';
import { dmy } from './ui-kit';

type Data = { today: string; people: Record<string, Tenure> };
let cache: Promise<Data | null> | null = null;
const load = () => (cache ??= fetch('/api/staff-tenure').then((r) => (r.ok ? (r.json() as Promise<Data>) : null)).catch(() => { cache = null; return null; }));

export function useTenure() {
  const [data, setData] = useState<Data | null>(null);
  useEffect(() => { let live = true; void load().then((d) => { if (live) setData(d); }); return () => { live = false; }; }, []);
  return data;
}

/** "T3" nhỏ cạnh tên; rê chuột xem ngày vào và lấy từ đâu. Chưa biết ngày vào thì không hiện gì. */
export function TenureBadge({ id }: { id: string | null | undefined }) {
  const data = useTenure();
  const t = id ? data?.people[id] : undefined;
  if (!t) return null;
  return (
    <span className="ml-1.5 inline-flex shrink-0 items-center rounded-md bg-surface-2 px-1.5 py-px align-middle text-[10.5px] font-semibold text-ink-2 num"
      title={`Thâm niên tháng thứ ${t.t + 1} · vào ${dmy(t.joined)}/${t.joined.slice(0, 4)} (theo ${JOIN_SOURCE_LABELS[t.source]})`}>
      T{t.t}
    </span>
  );
}
