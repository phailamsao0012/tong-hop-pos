// Danh sách kỳ dùng chung cho toàn web (yêu cầu 30/09/2026): mọi trang có kỳ dùng cùng các lựa chọn này,
// tuần tính từ thứ Hai. Hàm thuần, không phụ thuộc trình duyệt nên dùng được cả ở máy chủ và kiểm thử.
import { COMPANY_START, addDays } from '@/lib/report-time';

export const PRESETS = {
  today: 'Hôm nay', yesterday: 'Hôm qua', thisWeek: 'Tuần này', lastWeek: 'Tuần trước', week: '7 ngày qua',
  month: 'Tháng này', lastMonth: 'Tháng trước', quarter: '90 ngày qua', year: 'Năm nay', all: 'Từ đầu (03/2025)', custom: 'Tùy chọn',
};
export type PresetKey = keyof typeof PRESETS;
// Nhãn ngắn cho bộ chọn phân đoạn trên màn hình rộng (nhãn đầy đủ nằm trong title).
export const PRESET_SHORT: Record<PresetKey, string> = {
  today: 'Hôm nay', yesterday: 'Hôm qua', thisWeek: 'Tuần này', lastWeek: 'Tuần trước', week: '7 ngày',
  month: 'Tháng này', lastMonth: 'Tháng trước', quarter: '90 ngày', year: 'Năm nay', all: 'Từ đầu', custom: 'Tùy chọn',
};
export const isPreset = (v: string): v is PresetKey => v in PRESETS;

const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
/** Thứ Hai của tuần chứa ngày d. */
export const weekStart = (d: string) => addDays(d, -((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7));

/** Khoảng ngày [start, end] của một kỳ có sẵn, tính theo ngày hôm nay (giờ Việt Nam); "custom" trả null. */
export function presetRange(value: string, today: string): { start: string; end: string } | null {
  if (value === 'today') return { start: today, end: today };
  if (value === 'yesterday') return { start: addDays(today, -1), end: addDays(today, -1) };
  if (value === 'thisWeek') return { start: weekStart(today), end: today };
  if (value === 'lastWeek') { const s = addDays(weekStart(today), -7); return { start: s, end: addDays(s, 6) }; }
  if (value === 'week') return { start: addDays(today, -6), end: today };
  if (value === 'month') return { start: monthStart(today), end: today };
  if (value === 'lastMonth') { const e = addDays(monthStart(today), -1); return { start: monthStart(e), end: e }; }
  if (value === 'quarter') return { start: addDays(today, -89), end: today };
  if (value === 'year') return { start: `${today.slice(0, 4)}-01-01`, end: today };
  if (value === 'all') return { start: COMPANY_START, end: today };
  return null;
}

const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
/** Nhãn kỳ so sánh, kèm mốc giờ khi ngày cuối chỉ tính tới cùng giờ hiện tại: "29/09 0h–16:21", "01/08–30/08 (ngày cuối tới 16:21)". */
export function compareText(range: { start: string; end: string; cutoff?: string | null }) {
  const base = range.start === range.end ? dm(range.start) : `${dm(range.start)}–${dm(range.end)}`;
  if (!range.cutoff) return base;
  return range.start === range.end ? `${base} 0h–${range.cutoff}` : `${base} (ngày cuối tới ${range.cutoff})`;
}
