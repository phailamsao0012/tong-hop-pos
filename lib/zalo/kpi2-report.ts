// Dòng chỉ tiêu KPI mới trong tin Zalo theo khung giờ và báo cáo 8h (anh Vũ 07/11/2026: "Zalo gửi mỗi khung giờ", "làm tiếp").
// Chỉ tiêu tháng của team ở app_settings `target_kpi2:<tháng>` (lib/kpi/kpi2.ts). Số đạt tính từ đầu tháng tới giờ báo cáo,
// cùng cách trang Giao việc → KPI team (app/kpi2-panel.tsx): số nhận = đơn được chia, số chốt = đơn được chia đã chốt,
// số đơn = đơn chốt, số lượng = hộp / chai trên đơn chốt, tỷ lệ tự upsell = lib/reports/cskh-upsell.ts. Logic thuần để test được.
import { KPI2_LINES, type Kpi2 } from '@/lib/kpi/kpi2';
import { LINE_LABEL, type LineKey } from '@/lib/reports/mkt-product-split';

export type Kpi2Actual = { assigned: number; closed: number; orders: number; upsellRate: number | null; products: Partial<Record<LineKey, number>> };
export type Kpi2Row = {
  label: string; done: number | null; goal: number;
  /** Số so chỉ tiêu (%); tỷ lệ thì là số đạt so tỷ lệ đặt. */ percent: number | null;
  /** Đạt tiến độ chưa: số cộng dồn so chỉ tiêu × ngày đã qua ÷ ngày của tháng; tỷ lệ so thẳng chỉ tiêu. */ ahead: boolean | null;
  rate: boolean;
};

const vn = new Intl.NumberFormat('vi-VN');

/** Các dòng chỉ tiêu team đã đặt (Sale: số nhận, số chốt, số đơn; CSKH: tỷ lệ tự upsell; cả hai: số lượng sản phẩm). */
export function kpi2Rows(goal: Kpi2 | undefined, got: Kpi2Actual, dept: 'sale' | 'cskh', elapsed: number, daysInMonth: number): Kpi2Row[] {
  if (!goal) return [];
  const share = daysInMonth > 0 ? Math.min(1, Math.max(0, elapsed / daysInMonth)) : 1;
  const count = (label: string, g: number | undefined, done: number): Kpi2Row[] =>
    g ? [{ label, done, goal: g, percent: done / g * 100, ahead: done >= g * share, rate: false }] : [];
  const rows: Kpi2Row[] = [];
  if (dept === 'sale') {
    rows.push(...count('Số nhận', goal.assigned, got.assigned), ...count('Số chốt', goal.closed, got.closed), ...count('Số đơn', goal.orders, got.orders));
  } else if (goal.upsellRate) {
    const d = got.upsellRate;
    rows.push({ label: 'Tỷ lệ tự upsell', done: d, goal: goal.upsellRate, percent: d, ahead: d === null ? null : d >= goal.upsellRate, rate: true });
  }
  for (const k of KPI2_LINES) rows.push(...count(LINE_LABEL[k], goal.products?.[k], got.products[k] ?? 0));
  return rows;
}

/** "Số nhận 120/900 (13%) ✓" — dấu ✓ đạt tiến độ, ✗ chậm tiến độ. Ảnh không có phông cho dấu nên bỏ dấu, dùng màu. */
export function kpi2RowText(r: Kpi2Row, marks = true) {
  const mark = !marks || r.ahead === null ? '' : r.ahead ? ' ✓' : ' ✗';
  if (r.rate) return `${r.label} ${r.done === null ? '–' : `${Math.round(r.done)}%`}/${Math.round(r.goal)}%${mark}`;
  return `${r.label} ${vn.format(r.done ?? 0)}/${vn.format(r.goal)} (${Math.round(r.percent ?? 0)}%)${mark}`;
}

/** Một dòng tin Zalo; không đặt chỉ tiêu nào thì rỗng (không ghi "chưa đặt" để tin gọn). */
export function kpi2Text(rows: Kpi2Row[]) {
  return rows.length ? `Chỉ tiêu tháng: ${rows.map((r) => kpi2RowText(r)).join(' · ')} (✓ kịp tiến độ, ✗ chậm)` : '';
}
