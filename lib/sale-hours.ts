// Giờ vàng 24 khung giờ (05/10/2026): số theo từng ngày × từng giờ (giờ Việt Nam), mỗi khung 1 tiếng, 0h–23h.
// Dùng chung cho máy chủ (gom số) và trang Phân tích Sale (gộp theo thứ, cộng cả kỳ). Không đọc DB.
import { VN_OFFSET_HOURS, addDays } from '@/lib/report-time';

/** a = số được chia trong khung giờ đó, c = trong số đó đã chốt (theo giờ chia số);
 * o = đơn chốt, net = doanh thu (theo giờ xác nhận lần đầu, trừ đơn hủy sau chốt). */
export type DayHours = { day: string; a: number[]; c: number[]; o: number[]; net: number[] };
export const HOUR_KEYS = ['a', 'c', 'o', 'net'] as const;
export type HourKey = (typeof HOUR_KEYS)[number];
export const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'] as const;

const zeros = () => Array.from({ length: 24 }, () => 0);
export const emptyDay = (day: string): DayHours => ({ day, a: zeros(), c: zeros(), o: zeros(), net: zeros() });

/** Mọi ngày từ start tới end (đóng), mỗi ngày một dòng 24 khung giờ để ngày không có số vẫn hiện. */
export function dayRows(start: string, end: string) {
  const rows: DayHours[] = [];
  for (let d = start; d <= end && rows.length < 400; d = addDays(d, 1)) rows.push(emptyDay(d));
  return rows;
}

/** Thời điểm UTC (ms) → ngày và giờ Việt Nam. */
export function vnDayHour(ms: number) {
  const vn = new Date(ms + VN_OFFSET_HOURS * 3600000);
  return { day: vn.toISOString().slice(0, 10), hour: vn.getUTCHours() };
}

/** Thứ của một ngày (0 = thứ Hai … 6 = Chủ nhật). */
export const weekdayOf = (day: string) => (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;

/** Cộng nhiều dòng thành một (cả kỳ, hoặc mọi thứ Hai…). */
export function sumRows(rows: DayHours[], day: string) {
  const t = emptyDay(day);
  for (const r of rows) for (const k of HOUR_KEYS) for (let h = 0; h < 24; h++) t[k][h] += r[k][h];
  return t;
}

/** Gộp theo thứ: 7 dòng T2…CN, kèm số ngày của từng thứ trong kỳ. */
export function byWeekday(rows: DayHours[]) {
  return WEEKDAYS.map((label, w) => {
    const same = rows.filter((r) => weekdayOf(r.day) === w);
    return { ...sumRows(same, label), days: same.length };
  });
}

/** Tổng cả ngày của một chỉ số. */
export const dayTotal = (r: DayHours, k: HourKey) => r[k].reduce((t, v) => t + v, 0);
