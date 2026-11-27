// Hồ sơ nhân sự: số của MỘT người trong một kỳ chọn (anh Vũ 26/11/2026 13h51: "phần hồ sơ này, xem theo khoảng thời gian từng người").
// Cùng nguồn và cùng cách tính với phần theo tháng của hồ sơ (lib/reports/staff-profile.ts), chỉ đổi từ tháng sang kỳ chọn:
// - Sale / CSKH: bảng stats_daily theo người bán: DT chốt = closed_net, đơn chốt = closed_orders theo ngày tạo đơn (27/11/2026);
//   TL chốt = đơn lên trong kỳ đã chốt ÷ đơn lên (như cột tỷ lệ từng tháng); TL hủy = cancelRateOf (lib/reports/metrics.ts, như Tổng quan).
// - MKT: bảng stats_daily_mkt theo marketer (doanh số, đơn theo ngày xác nhận), như phần theo tháng.
// - Sản phẩm: stats_daily_seller_product (số lượng trên đơn chốt, không tính quà tặng), như "Sản phẩm tháng này".
// So với kỳ trước cùng độ dài, ngay trước kỳ chọn. Không quét bảng đơn gốc.
import { addDays } from '@/lib/shared/report-time';
import { cancelRateOf } from '@/lib/reports/metrics';
import { profileBasics, type ProfileDept } from '@/lib/reports/staff-profile';
import { statsDailySource } from '@/lib/pancake/order-segments';

export type PeriodSums = { net: number; closedOrders: number; orders: number; createdClosed: number; cancelled: number; deleted: number };
export type PeriodCard = { key: 'net' | 'closed' | 'rate' | 'cancel' | 'aov' | 'days'; label: string; value: number | null; prev: number | null; kind: 'money' | 'count' | 'pct' };

/** Kỳ trước cùng độ dài, liền trước kỳ chọn. */
export function prevRange(start: string, end: string) {
  const days = Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
  return { start: addDays(start, -days), end: addDays(start, -1), days };
}

const rateOf = (s: PeriodSums) => (s.orders ? Math.min(s.orders, s.createdClosed) / s.orders * 100 : null);
const cancelOf = (s: PeriodSums) => cancelRateOf({ orders: s.orders, closedOrders: s.closedOrders, groups: { cancelled: { orders: s.cancelled, net: 0 } }, deletedOrders: s.deleted } as Parameters<typeof cancelRateOf>[0]);
const aovOf = (s: PeriodSums) => (s.closedOrders ? s.net / s.closedOrders : null);

/** 4 ô số theo bộ phận: Sale có TL chốt; CSKH không tính TL chốt (thay bằng giá trị TB mỗi đơn); MKT theo số MKT (không có hủy theo marketer). */
export function periodCards(dept: ProfileDept, cur: PeriodSums, prev: PeriodSums, activeDays: { cur: number; prev: number }): PeriodCard[] {
  const net: PeriodCard = { key: 'net', label: dept === 'mkt' ? 'Doanh số MKT' : 'DT chốt', value: cur.net, prev: prev.net, kind: 'money' };
  const closed: PeriodCard = { key: 'closed', label: dept === 'mkt' ? 'Đơn xác nhận' : dept === 'cskh' ? 'Đơn CSKH chốt' : 'Đơn chốt', value: cur.closedOrders, prev: prev.closedOrders, kind: 'count' };
  const aov: PeriodCard = { key: 'aov', label: 'Giá trị TB mỗi đơn', value: aovOf(cur), prev: aovOf(prev), kind: 'money' };
  const cancel: PeriodCard = { key: 'cancel', label: 'TL hủy', value: cancelOf(cur), prev: cancelOf(prev), kind: 'pct' };
  if (dept === 'mkt') return [net, closed, aov, { key: 'days', label: 'Ngày có đơn', value: activeDays.cur, prev: activeDays.prev, kind: 'count' }];
  if (dept === 'cskh') return [net, closed, aov, cancel];
  return [net, closed, { key: 'rate', label: 'TL chốt', value: rateOf(cur), prev: rateOf(prev), kind: 'pct' }, cancel];
}

/** Điền đủ mọi ngày của kỳ (ngày không có số = 0) để cột theo ngày không bị hở. */
export function fillDays(start: string, end: string, rows: { day: string; net: number; orders: number }[]) {
  const by = new Map(rows.map((r) => [r.day, r]));
  const out: { day: string; net: number; orders: number }[] = [];
  for (let d = start; d <= end && out.length < 400; d = addDays(d, 1)) out.push({ day: d, net: by.get(d)?.net ?? 0, orders: by.get(d)?.orders ?? 0 });
  return out;
}

const ZERO: PeriodSums = { net: 0, closedOrders: 0, orders: 0, createdClosed: 0, cancelled: 0, deleted: 0 };
const CREATED_CLOSED = 'confirmed_orders+shipping_orders+delivered_orders+returned_orders';

export async function staffProfilePeriod(db: D1Database, id: string, start: string, end: string, today: string, pick: string[] = []) {
  const { dept, ph, posIds, posSel, name } = await profileBasics(db, id, today, pick);
  const prev = prevRange(start, end);
  const sums = async (s: string, e: string): Promise<PeriodSums> => {
    if (dept === 'mkt') {
      const r = await db.prepare(`SELECT COALESCE(SUM(net),0) AS net, COALESCE(SUM(orders),0) AS orders FROM stats_daily_mkt WHERE pos_id IN (${ph}) AND day>=? AND day<=? AND marketer_id=?`)
        .bind(...posIds, s, e, id).first<{ net: number; orders: number }>();
      return { ...ZERO, net: Number(r?.net ?? 0), closedOrders: Number(r?.orders ?? 0), orders: Number(r?.orders ?? 0), createdClosed: Number(r?.orders ?? 0) };
    }
    const src = await statsDailySource(db, posIds, s, e); // bảng đang dựng lại theo ngày tạo: đọc đơn gốc
    const r = await db.prepare(`${src.sql}SELECT COALESCE(SUM(closed_net),0) AS net, COALESCE(SUM(closed_orders),0) AS closed, COALESCE(SUM(orders),0) AS orders,
        COALESCE(SUM(${CREATED_CLOSED}),0) AS cc, COALESCE(SUM(cancelled_orders),0) AS cancelled, COALESCE(SUM(deleted_orders),0) AS deleted
      FROM stats_daily WHERE pos_id IN (${ph}) AND day>=? AND day<=? AND seller_id=?`).bind(...src.binds, ...posIds, s, e, id)
      .first<{ net: number; closed: number; orders: number; cc: number; cancelled: number; deleted: number }>();
    return { net: Number(r?.net ?? 0), closedOrders: Number(r?.closed ?? 0), orders: Number(r?.orders ?? 0), createdClosed: Number(r?.cc ?? 0), cancelled: Number(r?.cancelled ?? 0), deleted: Number(r?.deleted ?? 0) };
  };
  const daily = async (s: string, e: string) => {
    const rows = dept === 'mkt'
      ? await db.prepare(`SELECT day, SUM(net) AS net, SUM(orders) AS orders FROM stats_daily_mkt WHERE pos_id IN (${ph}) AND day>=? AND day<=? AND marketer_id=? GROUP BY day`).bind(...posIds, s, e, id).all<{ day: string; net: number; orders: number }>()
      : await db.prepare(`SELECT day, SUM(closed_net) AS net, SUM(closed_orders) AS orders FROM stats_daily WHERE pos_id IN (${ph}) AND day>=? AND day<=? AND seller_id=? GROUP BY day`).bind(...posIds, s, e, id).all<{ day: string; net: number; orders: number }>();
    return rows.results.map((r) => ({ day: r.day, net: Number(r.net), orders: Number(r.orders) }));
  };
  const [cur, before, days, prevDays, products] = await Promise.all([
    sums(start, end), sums(prev.start, prev.end), daily(start, end), daily(prev.start, prev.end),
    dept === 'mkt' ? Promise.resolve([] as { name: string; quantity: number; total: number }[])
      : db.prepare(`SELECT TRIM(name) AS name, SUM(closed_quantity) AS quantity, SUM(closed_total) AS total FROM stats_daily_seller_product
          WHERE pos_id IN (${ph}) AND day>=? AND day<=? AND seller_id=? AND closed_quantity>0 AND LOWER(TRIM(name)) NOT LIKE 'quà tặng%' GROUP BY 1 ORDER BY quantity DESC LIMIT 8`)
        .bind(...posIds, start, end, id).all<{ name: string; quantity: number; total: number }>().then((r) => r.results.map((p) => ({ name: p.name, quantity: Number(p.quantity), total: Number(p.total) }))),
  ]);
  const active = (rows: { net: number; orders: number }[]) => rows.filter((r) => r.orders > 0 || r.net > 0).length;
  return {
    id, name, dept, posSel, period: { start, end }, previous: { start: prev.start, end: prev.end },
    cards: periodCards(dept, cur, before, { cur: active(days), prev: active(prevDays) }),
    days: fillDays(start, end, days),
    products,
    definitions: {
      scope: `Số của đúng người này, ${posSel.length ? 'các POS đang chọn' : 'mọi POS có tài khoản'}, từ bảng tính sẵn theo ngày (cùng nguồn phần theo tháng bên dưới). So với ${prev.days} ngày liền trước.`,
      rate: 'TL chốt = đơn lên trong kỳ đã chốt ÷ đơn lên trong kỳ. Dưới 40% tô đỏ.',
      cancel: 'TL hủy = đơn lên trong kỳ đã hủy ÷ đơn lên trong kỳ (như Tổng quan). Từ 5% tô đỏ.',
      products: 'Sản phẩm: số lượng trên đơn chốt trong kỳ, không tính quà tặng.',
    },
  };
}
export type StaffProfilePeriod = Awaited<ReturnType<typeof staffProfilePeriod>>;
