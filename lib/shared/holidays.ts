// Ngày lễ cố định trong năm (anh Vũ 12/11/2026): chỉ để đánh dấu trên biểu đồ, lịch, báo cáo; KPI vẫn chia đều mọi ngày.
// Lưu app_settings 'holidays' = Holiday[]. Ngày âm lịch đổi sang dương theo từng năm (lib/shared/lunar.ts).
import { lunarToSolar } from '@/lib/shared/lunar';

export type Holiday = { name: string; kind: 'solar' | 'lunar'; month: number; day: number };
export const HOLIDAYS_KEY = 'holidays';

/** Mặc định gợi ý (chủ hệ thống sửa lại trong Cài đặt). */
export const DEFAULT_HOLIDAYS: Holiday[] = [
  { name: 'Tết Dương lịch', kind: 'solar', month: 1, day: 1 },
  { name: 'Giải phóng miền Nam', kind: 'solar', month: 4, day: 30 },
  { name: 'Quốc tế Lao động', kind: 'solar', month: 5, day: 1 },
  { name: 'Quốc khánh', kind: 'solar', month: 9, day: 2 },
  { name: 'Mùng 1 Tết', kind: 'lunar', month: 1, day: 1 },
  { name: 'Giỗ Tổ Hùng Vương', kind: 'lunar', month: 3, day: 10 },
];

export function parseHolidays(value: unknown): Holiday[] {
  let raw: unknown = value;
  if (typeof value === 'string') { try { raw = JSON.parse(value); } catch { return []; } }
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((h): Holiday[] => {
    if (!h || typeof h !== 'object') return [];
    const o = h as Record<string, unknown>;
    const month = Number(o.month), day = Number(o.day), name = (typeof o.name === 'string' ? o.name : '').trim().slice(0, 60);
    if (!name || (o.kind !== 'solar' && o.kind !== 'lunar') || !(month >= 1 && month <= 12) || !(day >= 1 && day <= (o.kind === 'lunar' ? 30 : 31))) return [];
    return [{ name, kind: o.kind, month: Math.round(month), day: Math.round(day) }];
  }).slice(0, 60);
}

/** 'YYYY-MM-DD' dương lịch của ngày lễ trong một năm dương lịch (lễ âm: lấy ngày âm của năm âm bắt đầu trong năm đó). */
export function holidayDate(h: Holiday, year: number): string | null {
  if (h.kind === 'solar') return `${year}-${String(h.month).padStart(2, '0')}-${String(h.day).padStart(2, '0')}`;
  const d = lunarToSolar(h.day, h.month, year);
  // Ngày âm tháng 11–12 có thể rơi sang tháng 1–2 năm dương sau: thử năm âm trước.
  if (d && d.startsWith(String(year))) return d;
  const prev = lunarToSolar(h.day, h.month, year - 1);
  return prev && prev.startsWith(String(year)) ? prev : d;
}

/** Tên ngày lễ trùng ngày 'YYYY-MM-DD', không có thì null. */
export function holidayOn(list: Holiday[], date: string): string | null {
  const year = Number(date.slice(0, 4));
  const hit = list.filter((h) => holidayDate(h, year) === date).map((h) => h.name);
  return hit.length ? hit.join(' · ') : null;
}
