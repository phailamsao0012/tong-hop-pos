'use client';

// Danh sách ngày lễ (GET /api/holidays), tải một lần cho cả trang. Dùng để đánh dấu ngày lễ trên KPI, biểu đồ, báo cáo.
import { useEffect, useState } from 'react';
import { holidayOn, type Holiday } from '@/lib/shared/holidays';
import { apiJson } from './api-fetch';

let cache: Holiday[] | null = null;
let pending: Promise<Holiday[]> | null = null;
const listeners = new Set<(h: Holiday[]) => void>();

function load() {
  pending ??= apiJson<{ holidays: Holiday[] }>('/api/holidays').then((b) => b.holidays).catch(() => []);
  return pending;
}
/** Gọi sau khi lưu ở Cài đặt để mọi chỗ cập nhật ngay. */
export function setHolidays(list: Holiday[]) { cache = list; pending = Promise.resolve(list); for (const l of listeners) l(list); }

export function useHolidays(): Holiday[] {
  const [list, setList] = useState<Holiday[]>(cache ?? []);
  useEffect(() => {
    listeners.add(setList);
    if (!cache) void load().then((h) => { cache = h; for (const l of listeners) l(h); });
    return () => { listeners.delete(setList); };
  }, []);
  return list;
}

export const holidayLabel = (list: Holiday[], date: string) => { const n = holidayOn(list, date); return n ? `Lễ: ${n}` : null; };
