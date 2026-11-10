// Báo ngay qua Zalo khi Sale có tỷ lệ chốt dưới 42% (anh Vũ 07/11/2026: "nếu sale tỉ lệ chốt của ai dưới 42% sẽ báo ngay về zalo",
// "gửi cho các đầu lead và mentor"). Mặc định Claude chọn, anh "ok hợp lý": tỷ lệ của hôm nay, chỉ xét người đã có ≥ 10 số,
// mỗi người báo tối đa 1 lần trong một khung báo cáo, xét mỗi 15 phút. Tỷ lệ = đơn lên hôm nay đã chốt ÷ đơn lên hôm nay
// (cách tính mặc định của web, lib/reports/overview-report.ts). Đọc bảng tổng hợp stats_daily, một câu cho mọi team.
import { RATE_THRESHOLDS } from '@/lib/reports/metrics';

export const LOW_RATE = RATE_THRESHOLDS.good;
export const LOW_RATE_MIN_BASE = 10;
export const LOW_RATE_EVERY_MIN = 15;
export const LOW_RATE_KEY = 'zalo_low_rate_v1';

export type SellerToday = { sellerId: string; name: string; base: number; closed: number };
export type LowRateState = { day?: string; sent?: Record<string, string> };

const CLOSED = 'confirmed_orders+shipping_orders+delivered_orders+returned_orders';

export function todayRatesSql(ids: string[]) {
  return `SELECT s.seller_id AS seller_id, COALESCE((SELECT MAX(name) FROM pos_users p WHERE p.user_id=s.seller_id AND p.name<>''),s.seller_id) AS name,
      SUM(s.orders) AS base, SUM(${CLOSED}) AS closed
    FROM stats_daily s WHERE s.day=? AND s.seller_id IN (${ids.map(() => '?').join(',')}) GROUP BY s.seller_id`;
}

export async function todayRates(db: D1Database, ids: string[], day: string): Promise<SellerToday[]> {
  if (!ids.length) return [];
  const rows = await db.prepare(todayRatesSql(ids)).bind(day, ...ids).all<{ seller_id: string; name: string; base: number; closed: number }>();
  return rows.results.map((r) => ({ sellerId: String(r.seller_id), name: String(r.name), base: Number(r.base), closed: Math.min(Number(r.base), Number(r.closed)) }));
}

/** Người dưới ngưỡng, đủ số, chưa báo trong khung này. Trả danh sách để gửi và state mới (ghi khung đã báo cho từng người). */
export function pickLowRate(rows: SellerToday[], state: LowRateState, day: string, slot: string, team = '') {
  const sent = state.day === day ? { ...state.sent } : {};
  const low = rows
    .filter((r) => r.base >= LOW_RATE_MIN_BASE && r.closed / r.base * 100 < LOW_RATE && sent[`${team}:${r.sellerId}`] !== slot)
    .map((r) => ({ ...r, rate: r.closed / r.base * 100 }))
    .sort((a, b) => a.rate - b.rate);
  for (const r of low) sent[`${team}:${r.sellerId}`] = slot;
  return { low, state: { day, sent } satisfies LowRateState };
}

const pct0 = (n: number) => `${Math.round(n)}%`;
/** Tin Zalo (chữ thường, Zalo không nhận HTML). */
export function lowRateText(team: string, time: string, low: (SellerToday & { rate: number })[]) {
  const lines = low.slice(0, 8).map((r) => `• ${r.name}: ${pct0(r.rate)} (${r.closed}/${r.base} số)`);
  if (low.length > 8) lines.push(`• … và ${low.length - 8} người khác`);
  return [
    `🔴 Tỷ lệ chốt dưới ${LOW_RATE}% · ${team} · hôm nay tới ${time}`,
    ...lines,
    '→ Leader / Mentor xem lại cách chốt và số được chia của các bạn này.',
    `Tỷ lệ = đơn lên hôm nay đã chốt ÷ đơn lên hôm nay; chỉ xét người có từ ${LOW_RATE_MIN_BASE} số.`,
  ].join('\n');
}

/** Khung báo cáo đang chạy: giờ báo cáo kế tiếp trong lịch (vd "12:00"), sau giờ cuối thì "cuối ngày". */
export function currentSlot(times: string[], time: string) {
  return [...times].sort().find((t) => t > time) ?? 'cuoi-ngay';
}
