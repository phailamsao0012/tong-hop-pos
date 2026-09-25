// Bộ lọc trạng thái đơn dùng chung cho mọi báo cáo (yêu cầu 24/09/2026: mỗi trang tự chọn xem đơn ở trạng thái nào,
// mặc định "Đã xác nhận trở đi" = đúng ô "Đơn chốt" của Pancake). Giá trị trên URL: ?status=<mốc> hoặc ?status=c:0,17,3.
import { ORDER_STATUS } from './pancake';

/** Trạng thái Pancake theo thứ tự vòng đời đơn. */
export const STATUS_ORDER = [0, 17, 1, 11, 20, 12, 13, 8, 9, 2, 3, 16, 4, 15, 5, 6, 7] as const;
export const STATUS_NAMES: Record<number, string> = ORDER_STATUS;

const ALL = STATUS_ORDER.filter((c) => c !== 7);
export const STATUS_PRESETS = {
  closed: { short: 'Đã XN trở đi', label: 'Đã xác nhận trở đi', hint: 'Mặc định · như ô Đơn chốt Pancake', codes: ALL.filter((c) => ![0, 17, 6].includes(c)) },
  created: { short: 'Mọi đơn lên', label: 'Tất cả đơn lên', hint: 'Mọi đơn đã tạo (kể cả mới, hủy, hoàn)', codes: ALL },
  valid: { short: 'Trừ hủy', label: 'Đơn lên trừ hủy', hint: 'Mọi đơn đã tạo, bỏ đơn hủy', codes: ALL.filter((c) => c !== 6) },
  processing: { short: 'Chưa gửi hàng', label: 'Chưa gửi hàng', hint: 'Đã XN → chờ chuyển', codes: [1, 11, 20, 12, 13, 8, 9] },
  shipped: { short: 'Đã đưa ĐVVC', label: 'Đã đưa ĐVVC', hint: 'Đã gửi, đã nhận, hoàn', codes: [2, 3, 16, 4, 15, 5] },
  delivered: { short: 'Giao TC', label: 'Giao thành công', hint: 'Đã nhận, đã thu tiền', codes: [3, 16] },
  returned: { short: 'Hoàn', label: 'Hoàn', hint: 'Đang hoàn, hoàn một phần, đã hoàn', codes: [4, 15, 5] },
  new: { short: 'Mới/chờ XN', label: 'Mới / chờ xác nhận', hint: '', codes: [0, 17] },
  cancelled: { short: 'Đã hủy', label: 'Đã hủy', hint: '', codes: [6] },
} as const satisfies Record<string, { short: string; label: string; hint: string; codes: readonly number[] }>;
export type StatusPreset = keyof typeof STATUS_PRESETS;
export const DEFAULT_STATUS = 'closed';

export type StatusFilter = { value: string; codes: number[]; label: string; short: string; isDefault: boolean; hasUnconfirmed: boolean };

const sameSet = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((c) => b.includes(c));

/** Chuẩn hóa giá trị ?status= (mốc có sẵn hoặc "c:mã,mã"). Sai / trống → mặc định. */
export function parseStatus(raw: string | null | undefined, fallback: StatusPreset = DEFAULT_STATUS): StatusFilter {
  const v = (raw ?? '').trim();
  let codes: number[];
  if (v in STATUS_PRESETS) codes = [...STATUS_PRESETS[v as StatusPreset].codes];
  else if (v.startsWith('c:')) {
    codes = [...new Set(v.slice(2).split(',').map(Number).filter((n) => Number.isInteger(n) && n in ORDER_STATUS))];
    if (!codes.length) codes = [...STATUS_PRESETS[fallback].codes];
  } else codes = [...STATUS_PRESETS[fallback].codes];
  return describeStatus(codes);
}

export function describeStatus(codes: number[]): StatusFilter {
  const preset = (Object.keys(STATUS_PRESETS) as StatusPreset[]).find((k) => sameSet(STATUS_PRESETS[k].codes, codes));
  const sorted = STATUS_ORDER.filter((c) => codes.includes(c));
  const label = preset ? STATUS_PRESETS[preset].label
    : sorted.length <= 3 ? sorted.map((c) => STATUS_NAMES[c]).join(', ') : `${sorted.length} trạng thái`;
  return {
    value: preset ?? `c:${sorted.join(',')}`, codes: sorted, label, short: preset ? STATUS_PRESETS[preset].short : sorted.length <= 2 ? label : `${sorted.length} trạng thái`,
    isDefault: preset === DEFAULT_STATUS,
    // Có trạng thái chưa từng xác nhận (mới / chờ XN) → không thể xếp theo ngày chốt.
    hasUnconfirmed: sorted.some((c) => c === 0 || c === 17),
  };
}

/** Điều kiện SQL `status_code IN (...)` trên cột đã cho. */
export const statusSql = (f: StatusFilter, column = 'status_code') => `${column} IN (${f.codes.join(',') || '-1'})`;
