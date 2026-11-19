// Chi tiết một marketer (anh Vũ 12/11/2026): số của marketer + từng Sale chốt cho marketer đó (theo người bấm xác nhận), kèm POS của từng tài khoản.
// - Số về (SĐT), đơn tạo: đơn MKT TẠO trong kỳ; với từng Sale: theo Sale được gán.
// - Đơn chốt, doanh thu, đi / hủy / hoàn: đơn XÁC NHẬN lần đầu trong kỳ, đã chốt là chốt (trừ xoá); theo người bấm xác nhận.
// - Doanh thu New / CSKH: theo bộ phận của người chốt. Chi phí: ad_costs của marketer (chưa tách được theo POS, xem plan POS mục A).
import { env } from 'cloudflare:workers';
import { adCostSource } from '@/lib/ops/cost-allocation';
import { comparePeriod, vnRangeUtc } from '@/lib/shared/report-time';
import { teamSubquery } from '@/lib/teams/team';
import { NET } from '@/lib/reports/stats';
import { AFTER_PACK_CANCELLED_SQL, AFTER_PACK_RETURNED_SQL, PACKED_SQL } from '@/lib/reports/van-don';
import { CLOSER_SQL } from '@/lib/teams/sale-team-filter';

export type MdAgg = { phones: number; created: number; closed: number; newClosed: number; net: number; newNet: number; cskhNet: number; packed: number; cancelled: number; returned: number };
export type MdSale = MdAgg & { posId: string; sellerId: string };
export type MarketerDetail = {
  marketerId: string; name: string; period: { start: string; end: string }; previous: { start: string; end: string };
  current: MdAgg & { cost: number }; prev: MdAgg & { cost: number };
  bySale: MdSale[]; byDay: { day: string; phones: number; closed: number; newClosed: number; net: number }[]; names: Record<string, string>;
};

/** Số cột nhóm = số chữ ' AS ' trong phần nhóm (biểu thức có thể chứa dấu phẩy). */
const groupCols = (group: string) => Array.from({ length: (group.match(/ AS /g) ?? []).length }, (_, i) => i + 1).join(',');
const zero = (): MdAgg => ({ phones: 0, created: 0, closed: 0, newClosed: 0, net: 0, newNet: 0, cskhNet: 0, packed: 0, cancelled: 0, returned: 0 });

export async function marketerDetail(marketerId: string, posIds: string[], start: string, end: string): Promise<MarketerDetail> {
  const prev = comparePeriod(start, end, 'previous');
  const ph = posIds.map(() => '?').join(',');
  const net = NET.replaceAll(/\b(net_total|current_total|total_discount)\b/g, 'o.$1');
  const sale = teamSubquery('sale')!, cskh = teamSubquery('cskh')!;
  const base = `o.pos_id IN (${ph}) AND NULLIF(TRIM(o.marketer_id),'')=?`;
  const closedCols = `COUNT(*) AS closed, SUM(CASE WHEN ${CLOSER_SQL} IN ${sale} THEN 1 ELSE 0 END) AS new_closed, COALESCE(SUM(${net}),0) AS net,
    COALESCE(SUM(CASE WHEN ${CLOSER_SQL} IN ${sale} THEN ${net} ELSE 0 END),0) AS new_net,
    COALESCE(SUM(CASE WHEN ${CLOSER_SQL} IN ${cskh} THEN ${net} ELSE 0 END),0) AS cskh_net,
    SUM(CASE WHEN ${PACKED_SQL('o')} THEN 1 ELSE 0 END) AS packed,
    SUM(CASE WHEN ${AFTER_PACK_CANCELLED_SQL('o')} THEN 1 ELSE 0 END) AS cancelled,
    SUM(CASE WHEN ${PACKED_SQL('o')} AND ${AFTER_PACK_RETURNED_SQL('o')} THEN 1 ELSE 0 END) AS returned`;
  const leadQ = (s: string, e: string, group: string) => {
    const r = vnRangeUtc(s, e);
    return env.DB.prepare(`SELECT ${group ? `${group},` : ''} COUNT(DISTINCT NULLIF(TRIM(o.phone),'')) AS phones, COUNT(*) AS created FROM raw_pos_orders o
      WHERE ${base} AND o.created_at>=? AND o.created_at<? AND o.status_code<>7 AND o.seller_id IN ${sale}${group ? ` GROUP BY ${groupCols(group)}` : ''}`).bind(...posIds, marketerId, r.startUtc, r.endUtc);
  };
  const closedQ = (s: string, e: string, group: string) => {
    const r = vnRangeUtc(s, e);
    return env.DB.prepare(`SELECT ${group ? `${group},` : ''} ${closedCols} FROM raw_pos_orders o
      WHERE ${base} AND o.first_confirmed_at>=? AND o.first_confirmed_at<? AND o.status_code NOT IN (0,17,7)${group ? ` GROUP BY ${groupCols(group)}` : ''}`).bind(...posIds, marketerId, r.startUtc, r.endUtc);
  };
  const costQ = (s: string, e: string) => env.DB.prepare(`SELECT COALESCE(SUM(amount),0) AS cost FROM ${adCostSource(posIds, s, e)} WHERE marketer_id=? AND day>=? AND day<=?`).bind(marketerId, s, e);
  const dayLead = "date(o.created_at,'+7 hours') AS day";
  const dayClosed = "date(o.first_confirmed_at,'+7 hours') AS day";
  const [lc, cc, lp, cp, costC, costP, lSale, cSale, lDay, cDay, names] = await env.DB.batch([
    leadQ(start, end, ''), closedQ(start, end, ''), leadQ(prev.start, prev.end, ''), closedQ(prev.start, prev.end, ''), costQ(start, end), costQ(prev.start, prev.end),
    leadQ(start, end, "o.pos_id AS pos, COALESCE(o.seller_id,'') AS sid"), closedQ(start, end, `o.pos_id AS pos, COALESCE(${CLOSER_SQL},'') AS sid`),
    leadQ(start, end, dayLead), closedQ(start, end, dayClosed),
    env.DB.prepare("SELECT user_id, MAX(name) AS name FROM pos_users WHERE name<>'' GROUP BY user_id"),
  ]);
  type Row = Record<string, string | number | null>;
  const n = (v: unknown) => Number(v ?? 0) || 0;
  const fill = (a: MdAgg, l?: Row, c?: Row) => {
    if (l) { a.phones += n(l.phones); a.created += n(l.created); }
    if (c) { a.closed += n(c.closed); a.newClosed += n(c.new_closed); a.net += n(c.net); a.newNet += n(c.new_net); a.cskhNet += n(c.cskh_net); a.packed += n(c.packed); a.cancelled += n(c.cancelled); a.returned += n(c.returned); }
    return a;
  };
  const current = { ...fill(zero(), (lc.results as Row[])[0], (cc.results as Row[])[0]), cost: n((costC.results as Row[])[0]?.cost) };
  const previous = { ...fill(zero(), (lp.results as Row[])[0], (cp.results as Row[])[0]), cost: n((costP.results as Row[])[0]?.cost) };
  const sales = new Map<string, MdSale>();
  const saleOf = (pos: string, sid: string) => { const k = `${pos}|${sid}`; let s = sales.get(k); if (!s) { s = { ...zero(), posId: pos, sellerId: sid }; sales.set(k, s); } return s; };
  for (const r of lSale.results as Row[]) fill(saleOf(String(r.pos), String(r.sid)), r);
  for (const r of cSale.results as Row[]) fill(saleOf(String(r.pos), String(r.sid)), undefined, r);
  const days = new Map<string, { day: string; phones: number; closed: number; newClosed: number; net: number }>();
  const dayOf = (d: string) => { let x = days.get(d); if (!x) { x = { day: d, phones: 0, closed: 0, newClosed: 0, net: 0 }; days.set(d, x); } return x; };
  for (const r of lDay.results as Row[]) dayOf(String(r.day)).phones += n(r.phones);
  for (const r of cDay.results as Row[]) { const x = dayOf(String(r.day)); x.closed += n(r.closed); x.newClosed += n(r.new_closed); x.net += n(r.net); }
  const used = new Set([marketerId, ...[...sales.values()].map((s) => s.sellerId)]);
  const nameMap = Object.fromEntries((names.results as { user_id: string; name: string }[]).filter((r) => used.has(String(r.user_id))).map((r) => [String(r.user_id), r.name]));
  return {
    marketerId, name: nameMap[marketerId] ?? `MKT ${marketerId.slice(0, 8)}`, period: { start, end }, previous: { start: prev.start, end: prev.end },
    current, prev: previous,
    bySale: [...sales.values()].sort((a, b) => b.net - a.net || b.phones - a.phones),
    byDay: [...days.values()].sort((a, b) => a.day.localeCompare(b.day)),
    names: nameMap,
  };
}
