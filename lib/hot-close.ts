// Chốt nóng theo số điện thoại trong một khung giờ (UTC): số nhận = SĐT khác nhau được giao
// cho nhân viên trong khung; số chốt = trong số đó, SĐT có đơn được xác nhận lần đầu trong khung
// bởi chính nhân viên đó. Một số nhiều đơn chỉ tính một số chốt; đơn và giá trị đếm theo đơn.
import { normalizePhone } from '@/lib/customer-stats';

export type HotCloseRow = {
  employeeId: string; received: number; closed: number; rate: number | null;
  hotOrders: number; hotValue: number; activityOrders: number; activityValue: number;
};

export async function hotCloseByEmployee(
  db: D1Database, posIds: string[], startUtc: string, endUtc: string, employeeIds: string[] = [],
) {
  const ph = posIds.map(() => '?').join(',');
  const eh = employeeIds.length ? ` AND seller_id IN (${employeeIds.map(() => '?').join(',')})` : '';
  const ch = employeeIds.length ? ` AND COALESCE(first_confirmed_by,seller_id) IN (${employeeIds.map(() => '?').join(',')})` : '';
  const [assigned, confirmed] = await db.batch([
    db.prepare(`SELECT pos_id,phone,seller_id FROM raw_pos_orders
      WHERE pos_id IN (${ph}) AND phone IS NOT NULL AND phone<>'' AND seller_id IS NOT NULL
        AND seller_assigned_at>=? AND seller_assigned_at<? AND status_code<>7${eh}`).bind(...posIds, startUtc, endUtc, ...employeeIds),
    db.prepare(`SELECT pos_id,phone,COALESCE(first_confirmed_by,seller_id) AS closer_id,
        (COALESCE(current_total,0)-COALESCE(total_discount,0)) AS net FROM raw_pos_orders
      WHERE pos_id IN (${ph}) AND phone IS NOT NULL AND phone<>'' AND COALESCE(first_confirmed_by,seller_id) IS NOT NULL
        AND first_confirmed_at>=? AND first_confirmed_at<? AND status_code<>7${ch}`).bind(...posIds, startUtc, endUtc, ...employeeIds),
  ]);
  type A = { pos_id: string; phone: string; seller_id: string };
  type C = { pos_id: string; phone: string; closer_id: string; net: number };
  const rows = new Map<string, HotCloseRow & { receivedPhones: Set<string>; closedPhones: Set<string> }>();
  const row = (id: string) => {
    if (!rows.has(id)) rows.set(id, { employeeId: id, received: 0, closed: 0, rate: null, hotOrders: 0, hotValue: 0, activityOrders: 0, activityValue: 0, receivedPhones: new Set(), closedPhones: new Set() });
    return rows.get(id)!;
  };
  for (const a of assigned.results as A[]) {
    const phone = normalizePhone(a.phone);
    if (phone) row(a.seller_id).receivedPhones.add(`${a.pos_id}:${phone}`);
  }
  for (const c of confirmed.results as C[]) {
    const phone = normalizePhone(c.phone);
    if (!phone) continue;
    const r = row(c.closer_id);
    r.activityOrders++; r.activityValue += Number(c.net);
    const key = `${c.pos_id}:${phone}`;
    if (r.receivedPhones.has(key)) { r.closedPhones.add(key); r.hotOrders++; r.hotValue += Number(c.net); }
  }
  return [...rows.values()].map((r) => ({
    employeeId: r.employeeId, received: r.receivedPhones.size, closed: r.closedPhones.size,
    rate: r.receivedPhones.size ? r.closedPhones.size / r.receivedPhones.size * 100 : null,
    hotOrders: r.hotOrders, hotValue: r.hotValue, activityOrders: r.activityOrders, activityValue: r.activityValue,
  })).sort((a, b) => b.received - a.received);
}
