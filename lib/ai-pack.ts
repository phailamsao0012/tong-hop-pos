import { addDays } from './report-time';
export type PackRow = { day: string; dept: string; team: string; staff: string; metrics: Record<string, number | null> };
export type AiPack = { version: 1; date: string; start: string; end: string; scope: string; rows: PackRow[]; unavailable: string[] };
export function validAiDate(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
}
/** Danh sách cho phép cố định: không xuất khách, số điện thoại hay ghi chú. */
export async function buildAiPack(db: D1Database, date: string): Promise<AiPack> {
  if (!validAiDate(date)) throw new Error('Ngày không hợp lệ');
  const start = addDays(date, -60), end = addDays(date, -1);
  const result = await db.prepare(`SELECT day, seller_id AS staff,
    COALESCE((SELECT team FROM hr_pos_team WHERE pos_user_id=seller_id LIMIT 1),'other') AS dept,
    COALESCE((SELECT department_id FROM hr_pos_team WHERE pos_user_id=seller_id LIMIT 1),'') AS team,
    SUM(assigned_orders) AS assigned, SUM(assigned_closed_orders) AS assignedClosed,
    SUM(closed_orders) AS closed, SUM(closed_net) AS net,
    SUM(returned_orders) AS returned
    FROM stats_daily WHERE day>=? AND day<=? GROUP BY day,seller_id`).bind(start, end).all<{ day: string; staff: string; dept: string; team: string; assigned: number; assignedClosed: number; closed: number; net: number; returned: number }>();
  const pack: AiPack = { version: 1, date, start, end, scope: 'Toàn công ty; ngày của stats_daily; nhân sự theo bản chép hiện tại', rows: result.results.map((r) => ({ day: r.day, staff: r.staff, team: r.team, dept: r.dept, metrics: { assigned: r.assigned, assignedClosed: r.assignedClosed, closed: r.closed, net: r.net, returned: r.returned, closeRate: r.assigned ? r.assignedClosed / r.assigned : null, aov: r.closed ? r.net / r.closed : null } })), unavailable: ['MKT theo ngày và marketer', 'DT đóng hàng trở đi', 'Hủy sau chốt', 'Phút xử lý trung vị', 'Khách giữ và quá hạn note', 'Note/ngày', 'CSKH tự upsell và từ MKT', '5 thẻ Vận đơn', 'Lý do và độ phủ', 'Số nhân sự đang làm theo chi nhánh', 'Tên hiển thị nhân viên'] };
  assertPackSize(pack);
  return pack;
}
export function assertPackSize(pack: AiPack) {
  if (new TextEncoder().encode(JSON.stringify(pack)).length > 1000000) throw new Error('Gói vượt 1 MB; không cắt bỏ số liệu');
}
/** Metric là đường dẫn JSON ổn định, không chấp nhận số nằm trong chuỗi văn bản. */
export function packMetrics(pack: AiPack) {
  const metrics: Record<string, number> = {};
  pack.rows.forEach((r, i) => Object.entries(r.metrics).forEach(([key, value]) => { if (typeof value === 'number' && Number.isFinite(value)) metrics[`rows.${i}.metrics.${key}`] = value; }));
  return metrics;
}
