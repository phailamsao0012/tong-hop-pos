// Chia mục tiêu (KPI nhân viên / team, vốn là của toàn công ty) theo POS đang chọn (quy tắc POS, anh Vũ 12/11/2026, câu 2 chọn A):
// "mục tiêu chia theo tỉ lệ doanh thu tháng trước của từng POS", ghi rõ "mục tiêu đã chia theo POS".
// Tỉ lệ của một người = doanh thu người đó chốt ở các POS đang chọn ÷ doanh thu người đó chốt ở mọi POS, trong THÁNG TRƯỚC tháng của KPI.
// Team = cộng các thành viên. Người tháng trước chưa có doanh thu → dùng tỉ lệ của cả công ty. Phần tính thuần ở goal-share-calc.ts.
import { env } from 'cloudflare:workers';
import { vnRangeUtc } from '@/lib/shared/report-time';
import { revenueDate } from '@/lib/reports/stats';
import { prevMonthOf, type GoalShare, type ShareAmount } from '@/lib/kpi/goal-share-calc';

export { prevMonthOf, shareOf, type GoalShare, type ShareAmount } from '@/lib/kpi/goal-share-calc';

/** { người: { POS: số } } → { người: { sel, all } } theo các POS đang chọn. */
export function parseEmpPos(value: string | undefined, sel: Set<string>): Record<string, ShareAmount> | null {
  if (!value) return null;
  let raw: unknown;
  try { raw = JSON.parse(value); } catch { return null; }
  if (!raw || typeof raw !== 'object') return null;
  const out: Record<string, ShareAmount> = {};
  for (const [id, m] of Object.entries(raw as Record<string, unknown>)) {
    if (!m || typeof m !== 'object') continue;
    const a: ShareAmount = { sel: 0, all: 0 };
    for (const [pos, v] of Object.entries(m as Record<string, unknown>)) { const n = Number(v) || 0; a.all += n; if (sel.has(pos)) a.sel += n; }
    out[id] = a;
  }
  return out;
}
const lastDay = (month: string) => { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };

export async function goalShare(month: string, posIds: string[]): Promise<GoalShare> {
  const prevMonth = prevMonthOf(month);
  const { startUtc, endUtc } = vnRangeUtc(`${prevMonth}-01`, lastDay(prevMonth));
  const net = 'COALESCE(o.net_total,COALESCE(o.current_total,0)-COALESCE(o.total_discount,0))';
  const sel = new Set(posIds);
  const rows = await env.DB.prepare(`SELECT o.seller_id AS s, o.pos_id AS pos, COALESCE(SUM(${net}),0) AS net FROM raw_pos_orders o
    WHERE ${revenueDate('o.')}>=? AND ${revenueDate('o.')}<? AND o.first_closed_at IS NOT NULL AND o.status_code<>7 AND NULLIF(o.seller_id,'') IS NOT NULL GROUP BY 1,2`).bind(startUtc, endUtc).all<{ s: string; pos: string; net: number }>();
  const byUser: Record<string, ShareAmount> = {};
  const company: ShareAmount = { sel: 0, all: 0 };
  for (const r of rows.results) {
    const v = Number(r.net) || 0, a = (byUser[r.s] ??= { sel: 0, all: 0 });
    a.all += v; company.all += v;
    if (sel.has(r.pos)) { a.sel += v; company.sel += v; }
  }
  // KPI đặt theo người × POS (nếu có) cho tháng này.
  const row = await env.DB.prepare('SELECT value FROM app_settings WHERE key=?').bind(`target_emp_pos:${month}`).first<{ value: string }>();
  const empPos = parseEmpPos(row?.value, sel);
  return { month, prevMonth, company, byUser, ...(empPos ? { empPos } : {}) };
}
