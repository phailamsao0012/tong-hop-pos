// Chia chi phí QC (ad_costs) và số marketer ghi trên sheet (sheet_mkt_stats) theo POS (quy tắc POS mục A1 + B, anh Vũ 12/11/2026).
// Hai bảng này chỉ ghi theo marketer + ngày, không có POS. Khi chọn ít hơn mọi POS, mỗi dòng nhân với tỉ lệ:
//   số điện thoại khác nhau trên đơn marketer đó TẠO ở các POS đang chọn ÷ trên mọi POS, trong CÙNG NGÀY;
//   ngày đó marketer không có số nào → tỉ lệ của cả khoảng 60 ngày quanh kỳ; vẫn không có → 0 (chưa rõ POS, chỉ hiện khi xem đủ POS).
// Marketer chỉ chạy một POS thì chi phí về đúng POS đó. Tổng các POS cộng lại = tổng gốc (khi mỗi ngày có số).
// Chọn đủ mọi POS: trả nguyên tên bảng, số không đổi.
import { POS } from '@/lib/shared/report-model';
import { addDays } from '@/lib/shared/report-time';

const SAFE_ID = /^[a-z0-9-]{1,40}$/;
const allSelected = (posIds: string[]) => !posIds.length || POS.every((p) => posIds.includes(p.id));

/** Biểu thức tỉ lệ theo (marketer, ngày) và theo cả khoảng, dùng chung cho hai bảng. */
function shareJoins(posIds: string[], fromDay: string, toDay: string, alias: string) {
  safeDay(fromDay); safeDay(toDay);
  const ids = posIds.filter((id) => SAFE_ID.test(id)).map((id) => `'${id}'`).join(',') || "''";
  const lo = addDays(fromDay, -60), hi = addDays(toDay, 1);
  // Giờ VN: ngày tạo đơn = date(created_at,'+7 hours'); giới hạn created_at theo UTC rộng hơn một ngày cho chắc.
  const lead = `SELECT NULLIF(TRIM(o.marketer_id),'') AS mid, date(o.created_at,'+7 hours') AS d, o.pos_id AS pos, COUNT(DISTINCT NULLIF(TRIM(o.phone),'')) AS n
    FROM raw_pos_orders o WHERE o.created_at>='${lo}' AND o.created_at<'${hi}T23:59:59' AND o.status_code<>7 AND NULLIF(TRIM(o.marketer_id),'') IS NOT NULL GROUP BY 1,2,3`;
  return `LEFT JOIN (SELECT mid, d, SUM(CASE WHEN pos IN (${ids}) THEN n ELSE 0 END)*1.0/SUM(n) AS share FROM (${lead}) GROUP BY mid, d HAVING SUM(n)>0) sd ON sd.mid=${alias}.marketer_id AND sd.d=${alias}.day
    LEFT JOIN (SELECT mid, SUM(CASE WHEN pos IN (${ids}) THEN n ELSE 0 END)*1.0/SUM(n) AS share FROM (${lead}) GROUP BY mid HAVING SUM(n)>0) sw ON sw.mid=${alias}.marketer_id`;
}

/** Thay cho `ad_costs` trong câu FROM: chi phí đã chia theo POS đang chọn. */
export function adCostSource(posIds: string[], fromDay: string, toDay: string): string {
  if (allSelected(posIds)) return 'ad_costs';
  safeDay(fromDay); safeDay(toDay);
  // Không đặt tên tắt cho ad_costs: lớp lọc team MKT (lib/shared/scope-filter.ts lensSql) viết lại "FROM ad_costs" thành bảng con "AS ad_costs".
  return `(SELECT ad_costs.id, ad_costs.day, ad_costs.marketer_id, ad_costs.campaign, ad_costs.note, ad_costs.created_at, ad_costs.amount * COALESCE(sd.share, sw.share, 0) AS amount
    FROM ad_costs ${shareJoins(posIds, fromDay, toDay, 'ad_costs')} WHERE ad_costs.day>='${fromDay}' AND ad_costs.day<='${toDay}')`;
}

/** Thay cho `sheet_mkt_stats`: số SĐT / đơn / DT marketer ghi trên sheet, đã chia theo POS đang chọn. */
export function sheetStatsSource(posIds: string[], fromDay: string, toDay: string): string {
  if (allSelected(posIds)) return 'sheet_mkt_stats';
  safeDay(fromDay); safeDay(toDay);
  return `(SELECT s.marketer_id, s.day, s.phones * COALESCE(sd.share, sw.share, 0) AS phones, s.orders * COALESCE(sd.share, sw.share, 0) AS orders, s.revenue * COALESCE(sd.share, sw.share, 0) AS revenue
    FROM sheet_mkt_stats s ${shareJoins(posIds, fromDay, toDay, 's')} WHERE s.day>='${fromDay}' AND s.day<='${toDay}')`;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** Kiểm ngày trước khi ghép vào câu SQL (ngày đã qua DATE_RE ở route, kiểm lại cho chắc). */
export const safeDay = (d: string) => { if (!DAY.test(d)) throw new Error('Ngày không hợp lệ.'); return d; };
