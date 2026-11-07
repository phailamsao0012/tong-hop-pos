// Hồ sơ làm việc siêu chi tiết của một nhân sự (anh Vũ 03/11/2026, nhắc lại 07/11: "trang thông tin siêu chi tiết của 1 nhân sự").
// Mốc (ngày vào làm, ngày có tài khoản POS, đơn đầu tiên), số theo từng tháng từ lúc vào, hạng trong bộ phận mỗi tháng (tháng lọt top),
// thành tích tốt nhất, sản phẩm bán nhiều nhất. Chỉ đọc các bảng tính sẵn (stats_daily, stats_daily_mkt, stats_daily_seller_product),
// không quét bảng đơn gốc; giới hạn 24 tháng gần nhất. Số trong kỳ đang chọn vẫn lấy ở lib/reports/staff-detail-report.ts.
import { POS } from '@/lib/shared/report-model';
import { vnRangeUtc } from '@/lib/shared/report-time';
import { teamSubquery } from '@/lib/teams/team';
import { staffTenure, type Tenure } from '@/lib/teams/tenure';
import { badgeBook, type Badge } from '@/lib/reports/staff-badges';

export type ProfileDept = 'sale' | 'cskh' | 'mkt' | null;
export type MonthRow = {
  month: string; net: number; closedOrders: number; orders: number; createdClosed: number; rate: number | null;
  /** Hạng trong bộ phận theo doanh số tháng đó (1 = cao nhất), trên số người có doanh số. */ rank: number | null; of: number;
};
export type StaffProfile = {
  id: string; name: string; dept: ProfileDept; posNames: string[];
  tenure: Tenure | null; posCreated: string | null; firstOrderDay: string | null; lastOrderDay: string | null;
  /** Đơn đầu tiên người này lên (theo ngày tạo): mã, giá trị, trạng thái hiện tại. */ firstOrder: { orderId: string; posName: string; net: number; at: string; status: number } | null;
  months: MonthRow[];
  best: { month: MonthRow | null; day: { day: string; net: number; orders: number } | null; rateMonth: MonthRow | null };
  topMonths: MonthRow[];
  /** Huy hiệu thành tích (lib/reports/staff-badges.ts). */ badges: Badge[];
  products: { name: string; quantity: number; total: number }[];
  productsMonth: string;
  definitions: Record<string, string>;
};

const TOP = 3, RATE_MIN = 30;
const monthStartOf = (today: string, back: number) => {
  const d = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - back, 1));
  return d.toISOString().slice(0, 10);
};
const CREATED_CLOSED = 'confirmed_orders+shipping_orders+delivered_orders+returned_orders';
const vnDay = (iso: string | null) => (iso ? new Date(Date.parse(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`) + 7 * 3600000).toISOString().slice(0, 10) : null);

/** Hạng của từng người trong từng tháng: số liệu dạng (tháng, người, doanh số). */
export function rankByMonth(rows: { month: string; id: string; net: number }[], id: string) {
  const out = new Map<string, { rank: number | null; of: number }>();
  const months = new Map<string, { id: string; net: number }[]>();
  for (const r of rows) if (r.net > 0) (months.get(r.month) ?? months.set(r.month, []).get(r.month)!).push(r);
  for (const [m, list] of months) {
    list.sort((a, b) => b.net - a.net);
    const at = list.findIndex((r) => r.id === id);
    out.set(m, { rank: at < 0 ? null : at + 1, of: list.length });
  }
  return out;
}

/** Thành tích tốt nhất và các tháng lọt top từ bảng theo tháng. */
export function bestOf(months: MonthRow[]) {
  const withNet = months.filter((m) => m.net > 0);
  const month = withNet.reduce<MonthRow | null>((a, m) => (!a || m.net > a.net ? m : a), null);
  const rateMonth = months.filter((m) => m.rate !== null && m.orders >= RATE_MIN).reduce<MonthRow | null>((a, m) => (!a || (m.rate ?? 0) > (a.rate ?? 0) ? m : a), null);
  const topMonths = months.filter((m) => m.rank !== null && m.rank <= TOP);
  return { month, rateMonth, topMonths };
}

export async function staffProfile(db: D1Database, id: string, today: string): Promise<StaffProfile> {
  const since = monthStartOf(today, 23), posIds = POS.map((p) => p.id), ph = posIds.map(() => '?').join(',');
  const month = today.slice(0, 7);
  const [users, firstLast, mktRows] = await db.batch([
    db.prepare(`SELECT pos_id, MAX(name) AS name, MIN(source_created_at) AS created,
        (CASE WHEN user_id IN ${teamSubquery('sale', false)} THEN 'sale' WHEN user_id IN ${teamSubquery('cskh', false)} THEN 'cskh' END) AS dept
      FROM pos_users WHERE user_id=? GROUP BY pos_id`).bind(id),
    db.prepare(`SELECT MIN(day) AS first, MAX(day) AS last FROM stats_daily WHERE pos_id IN (${ph}) AND seller_id=? AND orders>0`).bind(...posIds, id),
    db.prepare(`SELECT COUNT(*) AS n FROM stats_daily_mkt WHERE pos_id IN (${ph}) AND day>=? AND marketer_id=?`).bind(...posIds, since, id),
  ]);
  const u = users.results as { pos_id: string; name: string | null; created: string | null; dept: 'sale' | 'cskh' | null }[];
  const name = u.map((r) => r.name).find((n) => !!n) ?? 'Nhân sự';
  const fl = firstLast.results[0] as { first: string | null; last: string | null } | undefined;
  const isMkt = Number((mktRows.results[0] as { n: number } | undefined)?.n ?? 0) > 0 || /\bmkt\b/i.test(name);
  const dept: ProfileDept = u.find((r) => r.dept)?.dept ?? (isMkt ? 'mkt' : null);

  // Số theo tháng của người này và của cả bộ phận (để xếp hạng).
  let mine: Omit<MonthRow, 'rank' | 'of' | 'rate'>[] = [];
  let peers: { month: string; id: string; net: number }[] = [];
  if (dept === 'mkt') {
    const [a, b] = await db.batch([
      db.prepare(`SELECT substr(day,1,7) AS month, SUM(net) AS net, SUM(orders) AS orders FROM stats_daily_mkt WHERE pos_id IN (${ph}) AND day>=? AND marketer_id=? GROUP BY 1`).bind(...posIds, since, id),
      db.prepare(`SELECT substr(day,1,7) AS month, marketer_id AS id, SUM(net) AS net FROM stats_daily_mkt WHERE pos_id IN (${ph}) AND day>=? GROUP BY 1,2`).bind(...posIds, since),
    ]);
    mine = (a.results as { month: string; net: number; orders: number }[]).map((r) => ({ month: r.month, net: Number(r.net), closedOrders: Number(r.orders), orders: Number(r.orders), createdClosed: Number(r.orders) }));
    peers = (b.results as { month: string; id: string; net: number }[]).map((r) => ({ month: r.month, id: String(r.id), net: Number(r.net) }));
  } else {
    const [a, b] = await db.batch([
      db.prepare(`SELECT substr(day,1,7) AS month, SUM(closed_net) AS net, SUM(closed_orders) AS closed, SUM(orders) AS orders, SUM(${CREATED_CLOSED}) AS cc
        FROM stats_daily WHERE pos_id IN (${ph}) AND day>=? AND seller_id=? GROUP BY 1`).bind(...posIds, since, id),
      dept ? db.prepare(`SELECT substr(day,1,7) AS month, seller_id AS id, SUM(closed_net) AS net FROM stats_daily
        WHERE pos_id IN (${ph}) AND day>=? AND seller_id IN ${teamSubquery(dept)} GROUP BY 1,2`).bind(...posIds, since)
        : db.prepare('SELECT NULL AS month, NULL AS id, 0 AS net WHERE 0'),
    ]);
    mine = (a.results as { month: string; net: number; closed: number; orders: number; cc: number }[]).map((r) => ({ month: r.month, net: Number(r.net), closedOrders: Number(r.closed), orders: Number(r.orders), createdClosed: Math.min(Number(r.orders), Number(r.cc)) }));
    peers = (b.results as { month: string; id: string; net: number }[]).map((r) => ({ month: r.month, id: String(r.id), net: Number(r.net) }));
  }
  const ranks = rankByMonth(peers, id);
  const months: MonthRow[] = mine.sort((a, b) => a.month.localeCompare(b.month)).map((m) => ({
    ...m, rate: dept === 'mkt' || !m.orders ? null : m.createdClosed / m.orders * 100, rank: ranks.get(m.month)?.rank ?? null, of: ranks.get(m.month)?.of ?? 0,
  }));

  const [bestDay, products, tenure, book] = await Promise.all([
    dept === 'mkt'
      ? db.prepare(`SELECT day, SUM(net) AS net, SUM(orders) AS orders FROM stats_daily_mkt WHERE pos_id IN (${ph}) AND day>=? AND marketer_id=? GROUP BY day ORDER BY net DESC LIMIT 1`).bind(...posIds, since, id).first<{ day: string; net: number; orders: number }>()
      : db.prepare(`SELECT day, SUM(closed_net) AS net, SUM(closed_orders) AS orders FROM stats_daily WHERE pos_id IN (${ph}) AND day>=? AND seller_id=? GROUP BY day ORDER BY net DESC LIMIT 1`).bind(...posIds, since, id).first<{ day: string; net: number; orders: number }>(),
    dept === 'mkt' ? Promise.resolve({ results: [] as { name: string; quantity: number; total: number }[] })
      : db.prepare(`SELECT TRIM(name) AS name, SUM(closed_quantity) AS quantity, SUM(closed_total) AS total FROM stats_daily_seller_product
          WHERE pos_id IN (${ph}) AND day>=? AND seller_id=? AND closed_quantity>0 AND LOWER(TRIM(name)) NOT LIKE 'quà tặng%' GROUP BY 1 ORDER BY quantity DESC LIMIT 8`).bind(...posIds, `${month}-01`, id).all<{ name: string; quantity: number; total: number }>(),
    staffTenure(db, today).then((t) => t[id] ?? null).catch(() => null),
    badgeBook(db, today).catch(() => null),
  ]);
  // Đơn đầu tiên: chỉ đọc đơn của đúng ngày đầu (chỉ mục pos_id + created_at), không quét cả bảng đơn.
  const fd = dept === 'mkt' ? null : fl?.first ?? null;
  const first = fd ? await db.prepare(`SELECT source_order_id, pos_id, created_at, status_code, COALESCE(net_total,COALESCE(current_total,0)-COALESCE(total_discount,0)) AS net
      FROM raw_pos_orders WHERE pos_id IN (${ph}) AND created_at>=? AND created_at<? AND seller_id=? ORDER BY created_at LIMIT 1`)
    .bind(...posIds, vnRangeUtc(fd, fd).startUtc, vnRangeUtc(fd, fd).endUtc, id).first<{ source_order_id: string; pos_id: string; created_at: string; status_code: number; net: number }>().catch(() => null) : null;
  const created = u.map((r) => r.created).filter((c): c is string => !!c).sort()[0] ?? null;
  const best = bestOf(months);
  return {
    id, name, dept, posNames: [...new Set(u.map((r) => POS.find((p) => p.id === r.pos_id)?.name ?? r.pos_id))],
    tenure, posCreated: vnDay(created), firstOrderDay: fl?.first ?? null, lastOrderDay: fl?.last ?? null,
    firstOrder: first ? { orderId: String(first.source_order_id), posName: POS.find((p) => p.id === first.pos_id)?.name ?? first.pos_id, net: Number(first.net), at: first.created_at, status: Number(first.status_code) } : null,
    months, best: { month: best.month, rateMonth: best.rateMonth, day: bestDay && Number(bestDay.net) > 0 ? { day: bestDay.day, net: Number(bestDay.net), orders: Number(bestDay.orders) } : null },
    topMonths: best.topMonths, badges: book?.people[id] ?? [],
    products: products.results.map((p) => ({ name: p.name, quantity: Number(p.quantity), total: Number(p.total) })), productsMonth: month,
    definitions: {
      scope: 'Số 24 tháng gần nhất, cộng mọi POS, đọc từ bảng tính sẵn theo ngày.',
      revenue: dept === 'mkt' ? 'Doanh số MKT = doanh thu đơn xác nhận do marketer này mang về, theo ngày xác nhận.' : 'Doanh số = doanh thu đơn chốt của người bán, theo ngày chốt (cùng cách Tổng quan).',
      rate: 'Tỷ lệ chốt = đơn lên trong tháng đã chốt ÷ đơn lên trong tháng. Tháng tốt nhất về tỷ lệ chỉ xét tháng có từ 30 đơn lên.',
      rank: `Hạng = thứ tự doanh số tháng trong cả bộ phận (mọi POS). Lọt top = hạng 1 tới ${TOP}.`,
      joined: 'Ngày vào làm: sửa tay → web nhân sự → ngày tạo tài khoản Pancake → ngày có đơn đầu tiên.',
      products: 'Sản phẩm tháng này: số lượng trên đơn chốt, không tính quà tặng.',
    },
  };
}
