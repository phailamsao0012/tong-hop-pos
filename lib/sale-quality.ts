// Chất lượng khách của Sale (yêu cầu 29/09/2026): Sale chốt cho khách nào, sản phẩm (thẻ đơn) gì, và sau đó khách có mua lại
// qua CSKH không — mua gì, bao nhiêu đơn, bao nhiêu tiền, bao lâu thì quay lại. Sale "chốt láo" thường hoàn nhiều và khách gần như
// không quay lại; Sale tốt thì CSKH upsell dễ, khách mua lại đều.
// Nhóm khách: đơn đã chốt (xác nhận trở đi, kể cả hoàn) TẠO trong kỳ đang chọn (bộ lọc ngày chung của web, không giới hạn độ dài),
// người bán thuộc bộ phận Sale. Mỗi SĐT tính cho Sale của đơn đầu tiên trong kỳ (đơn gốc). Mua lại = đơn đã chốt tạo SAU đơn gốc, cùng SĐT, trên cả 6 POS,
// tính tới hôm nay; "qua CSKH" = NV chăm sóc trên đơn (trống thì người bán) thuộc bộ phận CSKH.
// Đọc bằng chỉ mục phủ idx_raw_orders_pos_status_phone_tags (không đọc JSON gốc); chỉ tiền / NV chăm sóc của đơn mua lại
// (và đơn gốc khi xem chi tiết một người) mới đọc theo rowid.
import { env } from 'cloudflare:workers';
import { POS } from '@/lib/report-model';
import { productTags } from '@/lib/product-groups';
import { vnRangeUtc } from '@/lib/report-time';
import { STATUS_GROUPS } from '@/lib/stats';
import { teamOf, teamSubquery } from '@/lib/team';

const CLOSED_CODES = [...STATUS_GROUPS.confirmed, ...STATUS_GROUPS.shipping, ...STATUS_GROUPS.delivered, ...STATUS_GROUPS.returned];
const RETURNED = new Set<number>(STATUS_GROUPS.returned);
const DELIVERED = new Set<number>(STATUS_GROUPS.delivered);
const NET = 'COALESCE(net_total,COALESCE(current_total,0)-COALESCE(total_discount,0))';
const DAY = 86400000;
const toMs = (s: string) => Date.parse(s.endsWith('Z') || s.includes('+') ? s : `${s}Z`);
/** Đủ thời gian theo dõi: đơn gốc cách hôm nay từ 30 ngày. Tỷ lệ mua lại so sánh công bằng trên nhóm này. */
export const MATURE_DAYS = 30;

type Anchor = { rid: number; s: string; p: string; t: string; tags: string | null; st: number; pos: string };
type Follow = { rid: number; p: string; t: string; tags: string | null; s: string | null; st: number; pos: string };

const memo = new Map<string, { at: number; value: unknown }>();

/** Khoảng ngày của một tháng "YYYY-MM" (tham số cũ ?month= vẫn dùng được). */
export function monthRange(month: string) {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, '0')}` };
}

async function batched<T>(statements: D1PreparedStatement[]) {
  const out: T[] = [];
  for (let i = 0; i < statements.length; i += 100) for (const r of await env.DB.batch(statements.slice(i, i + 100))) out.push(...(r.results as T[]));
  return out;
}
const byRowid = <T>(sql: (ph: string) => string, rids: number[]) => {
  const st: D1PreparedStatement[] = [];
  for (let i = 0; i < rids.length; i += 90) { const c = rids.slice(i, i + 90); st.push(env.DB.prepare(sql(c.map(() => '?').join(','))).bind(...c)); }
  return batched<T>(st);
};
const top = (m: Map<string, number>, n = 4) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([tag, count]) => ({ tag, count }));
const bump = (m: Map<string, number>, tags: string | null) => { const ts = productTags(tags); for (const g of ts.length ? ts : ['Chưa gắn thẻ']) m.set(g, (m.get(g) ?? 0) + 1); };

export type SaleQuality = Awaited<ReturnType<typeof computeSaleQuality>>;

type Opts = { posIds: string[]; start: string; end: string; staffId?: string | null };
export async function saleQuality(opts: Opts) {
  const key = `${opts.posIds.join(',')}|${opts.start}|${opts.end}|${opts.staffId ?? ''}`;
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < 10 * 60000) return hit.value as SaleQuality;
  const value = await computeSaleQuality(opts);
  memo.set(key, { at: Date.now(), value });
  if (memo.size > 100) memo.delete(memo.keys().next().value!);
  return value;
}

async function computeSaleQuality(opts: Opts) {
  const db = env.DB;
  const { start, end } = opts;
  const { startUtc, endUtc } = vnRangeUtc(start, end);
  const ph = opts.posIds.map(() => '?').join(','), codes = CLOSED_CODES.join(',');
  const [cohortRes, namesRes] = await db.batch([
    db.prepare(`SELECT o.rowid AS rid, o.seller_id AS s, o.phone AS p, o.created_at AS t, o.tags_json AS tags, o.status_code AS st, o.pos_id AS pos
      FROM raw_pos_orders o INDEXED BY idx_raw_orders_pos_status_phone_tags
      WHERE o.pos_id IN (${ph}) AND o.status_code IN (${codes}) AND o.created_at>=? AND o.created_at<? AND o.phone IS NOT NULL AND o.phone<>''
        AND o.seller_id IN ${teamSubquery('sale')}`).bind(...opts.posIds, startUtc, endUtc),
    db.prepare("SELECT user_id, MAX(name) AS name, MAX(department) AS department FROM pos_users WHERE name<>'' GROUP BY user_id"),
  ]);
  const people = new Map((namesRes.results as { user_id: string; name: string; department: string | null }[]).map((r) => [r.user_id, r]));
  const nameOf = (id: string) => people.get(id)?.name ?? `NV ${id.slice(0, 8)}`;
  const cohort = cohortRes.results as Anchor[];
  // Đơn gốc của mỗi SĐT = đơn tạo sớm nhất trong kỳ; khách tính cho Sale của đơn đó.
  const anchors = new Map<string, Anchor>();
  for (const o of cohort) { const a = anchors.get(o.p); if (!a || o.t < a.t) anchors.set(o.p, o); }

  // Đơn đã chốt của cùng SĐT tạo sau đầu kỳ (cả 6 POS), lọc "sau đơn gốc" trong code.
  const phones = [...anchors.keys()];
  const all = POS.map((x) => x.id);
  const st: D1PreparedStatement[] = [];
  for (let i = 0; i < phones.length; i += 90) {
    const c = phones.slice(i, i + 90);
    st.push(db.prepare(`SELECT o.rowid AS rid, o.phone AS p, o.created_at AS t, o.tags_json AS tags, o.seller_id AS s, o.status_code AS st, o.pos_id AS pos
      FROM raw_pos_orders o INDEXED BY idx_raw_orders_pos_status_phone_tags
      WHERE o.pos_id IN (${all.map(() => '?').join(',')}) AND o.status_code IN (${codes}) AND o.phone IN (${c.map(() => '?').join(',')}) AND o.created_at>?`).bind(...all, ...c, startUtc));
  }
  const later = (await batched<Follow>(st)).filter((f) => { const a = anchors.get(f.p); return a && f.t > a.t && f.rid !== a.rid; });
  // Tiền + NV chăm sóc của đơn mua lại (đọc theo rowid, chỉ những đơn này).
  const detail = new Map((await byRowid<{ rid: number; care: string | null; net: number }>((q) => `SELECT rowid AS rid, NULLIF(care_id,'') AS care, ${NET} AS net FROM raw_pos_orders WHERE rowid IN (${q})`, later.map((f) => f.rid))).map((r) => [r.rid, r]));

  type Cust = { anchor: Anchor; cskh: Follow[]; sale: Follow[]; cskhNet: number; cskhStaff: Set<string> };
  const customers = new Map<string, Cust>();
  for (const [p, a] of anchors) customers.set(p, { anchor: a, cskh: [], sale: [], cskhNet: 0, cskhStaff: new Set() });
  for (const f of later.sort((x, y) => x.t.localeCompare(y.t))) {
    const c = customers.get(f.p)!; const d = detail.get(f.rid);
    const staff = d?.care ?? f.s ?? '';
    const team = teamOf(people.get(staff)?.department ?? null);
    if (team === 'cskh') { c.cskh.push(f); c.cskhNet += Number(d?.net ?? 0); c.cskhStaff.add(staff); }
    else c.sale.push(f);
  }

  const now = Date.now();
  type Agg = { staffId: string; customers: number; mature: number; saleOrders: number; returned: number; delivered: number; saleTags: Map<string, number>;
    repeat: number; repeatMature: number; cskhOrders: number; cskhNet: number; days: number[]; repeatTags: Map<string, number>; saleAgain: number };
  const per = new Map<string, Agg>();
  const agg = (id: string) => { let a = per.get(id); if (!a) { a = { staffId: id, customers: 0, mature: 0, saleOrders: 0, returned: 0, delivered: 0, saleTags: new Map(), repeat: 0, repeatMature: 0, cskhOrders: 0, cskhNet: 0, days: [], repeatTags: new Map(), saleAgain: 0 }; per.set(id, a); } return a; };
  for (const o of cohort) { const a = agg(o.s); a.saleOrders++; if (RETURNED.has(Number(o.st))) a.returned++; if (DELIVERED.has(Number(o.st))) a.delivered++; bump(a.saleTags, o.tags); }
  for (const c of customers.values()) {
    const a = agg(c.anchor.s);
    const mature = now - toMs(c.anchor.t) >= MATURE_DAYS * DAY;
    a.customers++; if (mature) a.mature++;
    if (c.sale.length) a.saleAgain++;
    if (!c.cskh.length) continue;
    a.repeat++; if (mature) a.repeatMature++;
    a.cskhOrders += c.cskh.length; a.cskhNet += c.cskhNet;
    a.days.push((toMs(c.cskh[0].t) - toMs(c.anchor.t)) / DAY);
    for (const f of c.cskh) bump(a.repeatTags, f.tags);
  }
  const pack = (a: Agg) => ({
    staffId: a.staffId, name: a.staffId === '__all' ? 'Tổng' : nameOf(a.staffId),
    customers: a.customers, mature: a.mature, saleOrders: a.saleOrders,
    returnRate: a.saleOrders ? a.returned / a.saleOrders * 100 : null, deliveredRate: a.saleOrders ? a.delivered / a.saleOrders * 100 : null, returned: a.returned,
    repeat: a.repeat, repeatRate: a.customers ? a.repeat / a.customers * 100 : null,
    repeatMature: a.repeatMature, repeatRateMature: a.mature ? a.repeatMature / a.mature * 100 : null,
    cskhOrders: a.cskhOrders, cskhNet: a.cskhNet, cskhNetPerCustomer: a.customers ? a.cskhNet / a.customers : null,
    ordersPerRepeater: a.repeat ? a.cskhOrders / a.repeat : null,
    avgDaysToRepeat: a.days.length ? a.days.reduce((x, y) => x + y, 0) / a.days.length : null,
    saleAgain: a.saleAgain, saleTags: top(a.saleTags), repeatTags: top(a.repeatTags),
  });
  const staff = [...per.values()].filter((a) => a.customers || a.saleOrders);
  const total: Agg = staff.reduce((t, a) => {
    t.customers += a.customers; t.mature += a.mature; t.saleOrders += a.saleOrders; t.returned += a.returned; t.delivered += a.delivered;
    t.repeat += a.repeat; t.repeatMature += a.repeatMature; t.cskhOrders += a.cskhOrders; t.cskhNet += a.cskhNet; t.days.push(...a.days); t.saleAgain += a.saleAgain;
    for (const [k, v] of a.saleTags) t.saleTags.set(k, (t.saleTags.get(k) ?? 0) + v);
    for (const [k, v] of a.repeatTags) t.repeatTags.set(k, (t.repeatTags.get(k) ?? 0) + v);
    return t;
  }, { staffId: '__all', customers: 0, mature: 0, saleOrders: 0, returned: 0, delivered: 0, saleTags: new Map(), repeat: 0, repeatMature: 0, cskhOrders: 0, cskhNet: 0, days: [], repeatTags: new Map(), saleAgain: 0 } as Agg);

  // Chi tiết một Sale: từng khách, đơn gốc (tiền, thẻ, trạng thái) và các lần mua lại.
  let list = null;
  if (opts.staffId) {
    const mine = [...customers.values()].filter((c) => c.anchor.s === opts.staffId);
    const base = new Map((await byRowid<{ rid: number; net: number; name: string | null; code: string | null }>((q) => `SELECT rowid AS rid, ${NET} AS net, customer_name AS name, source_order_id AS code FROM raw_pos_orders WHERE rowid IN (${q})`, mine.map((c) => c.anchor.rid))).map((r) => [r.rid, r]));
    list = mine.sort((x, y) => y.cskhNet - x.cskhNet || y.anchor.t.localeCompare(x.anchor.t)).slice(0, 1000).map((c) => {
      const b = base.get(c.anchor.rid);
      return {
        phone: c.anchor.p, name: b?.name ?? null, posName: POS.find((x) => x.id === c.anchor.pos)?.name ?? c.anchor.pos, code: b?.code ?? null,
        at: c.anchor.t, net: Number(b?.net ?? 0), tags: productTags(c.anchor.tags), status: Number(c.anchor.st),
        returned: RETURNED.has(Number(c.anchor.st)), delivered: DELIVERED.has(Number(c.anchor.st)),
        cskhOrders: c.cskh.length, cskhNet: c.cskhNet, cskhFirst: c.cskh[0]?.t ?? null, cskhLast: c.cskh.at(-1)?.t ?? null,
        cskhTags: [...new Set(c.cskh.flatMap((f) => productTags(f.tags)))], cskhStaff: [...c.cskhStaff].map(nameOf), saleAgain: c.sale.length,
        daysToRepeat: c.cskh[0] ? (toMs(c.cskh[0].t) - toMs(c.anchor.t)) / DAY : null,
      };
    });
  }
  return {
    period: { start, end }, matureDays: MATURE_DAYS,
    followDays: Math.max(0, Math.floor((now - toMs(startUtc)) / DAY)),
    total: pack(total), staff: staff.map(pack).sort((a, b) => b.customers - a.customers), list,
    definitions: {
      cohort: 'Khách = SĐT có đơn đã chốt (xác nhận trở đi, kể cả hoàn) tạo trong kỳ đang chọn, người bán thuộc bộ phận Sale; mỗi SĐT tính cho Sale của đơn đầu tiên trong kỳ (đơn gốc).',
      repeat: 'Mua lại qua CSKH = đơn đã chốt tạo SAU đơn gốc, cùng SĐT, trên cả 6 POS, tính tới hôm nay, có NV chăm sóc (trống thì người bán) thuộc bộ phận CSKH.',
      mature: `Đủ ${MATURE_DAYS} ngày = đơn gốc cách hôm nay từ ${MATURE_DAYS} ngày; so tỷ lệ mua lại giữa các Sale nên dùng nhóm này để công bằng (khách mới chốt chưa kịp quay lại).`,
      returnRate: 'Hoàn = đơn gốc của Sale đang ở trạng thái hoàn / đang hoàn; tỷ lệ = đơn hoàn ÷ đơn Sale chốt trong kỳ.',
      saleAgain: 'Quay lại qua Sale = khách có đơn sau đó nhưng người bán / chăm sóc không thuộc CSKH.',
    },
  };
}
