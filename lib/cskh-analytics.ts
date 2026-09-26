// Phân tích CSKH (kế hoạch quản trị, giai đoạn 3a · 26/09/2026): khách của CSKH mua lần thứ mấy, đi từ nhóm sản phẩm nào sang nhóm nào,
// mua bao nhiêu nhóm khác nhau, doanh thu có chia đều giữa các nhân viên không, GTTB CSKH so với Sale.
// Phạm vi: đơn chốt trong kỳ (đã xác nhận trở đi, theo ngày xác nhận lần đầu) của nhân viên CSKH (NV chăm sóc trên đơn, trống thì người bán).
// Lịch sử khách = mọi đơn không hủy / không xóa của cùng SĐT trên cả 6 POS tính tới hết kỳ.
import { env } from 'cloudflare:workers';
import { MAIN_LABELS, groupsOf, itemNames } from '@/lib/product-groups';
import { POS } from '@/lib/report-model';
import { vnRangeUtc } from '@/lib/report-time';
import { CLOSED, NET } from '@/lib/stats';
import { teamFilter } from '@/lib/team';

const STAFF = "COALESCE(NULLIF(o.care_id,''),o.seller_id)";
type PeriodRow = { id: string; phone: string; staff: string | null; created_at: string; net: number; tags_json: string | null };
type HistRow = { id: string; phone: string; created_at: string; tags_json: string | null };

export type CskhAnalytics = Awaited<ReturnType<typeof cskhAnalytics>>;

export async function cskhAnalytics(opts: { posIds: string[]; start: string; end: string; staffIds: string[] }) {
  const db = env.DB;
  const { startUtc, endUtc } = vnRangeUtc(opts.start, opts.end);
  const ph = opts.posIds.map(() => '?').join(',');
  const inRange = `o.pos_id IN (${ph}) AND o.first_confirmed_at>=? AND o.first_confirmed_at<? AND o.${CLOSED} AND o.phone IS NOT NULL AND o.phone<>''`;
  const net = NET.replace(/net_total|current_total|total_discount/g, (c) => `o.${c}`);
  const [period, saleAgg, names] = await db.batch([
    db.prepare(`SELECT o.id, o.phone, ${STAFF} AS staff, o.created_at, ${net} AS net, o.tags_json FROM raw_pos_orders o WHERE ${inRange}${teamFilter(STAFF, 'cskh')}`).bind(...opts.posIds, startUtc, endUtc),
    db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(${net}),0) AS net FROM raw_pos_orders o WHERE ${inRange}${teamFilter('o.seller_id', 'sale')}`).bind(...opts.posIds, startUtc, endUtc),
    db.prepare("SELECT user_id, MAX(name) AS name, MAX(department) AS department FROM pos_users WHERE name<>'' GROUP BY user_id"),
  ]);
  const everyone = period.results as PeriodRow[];
  const rows = opts.staffIds.length ? everyone.filter((r) => opts.staffIds.includes(r.staff ?? '')) : everyone;
  const nameMap = new Map((names.results as { user_id: string; name: string; department: string | null }[]).map((r) => [r.user_id, r]));

  // Lịch sử từng SĐT trên cả 6 POS (chỉ mục pos_id + phone), 90 SĐT một câu.
  const phones = [...new Set(rows.map((r) => r.phone))];
  const all = POS.map((x) => x.id);
  const statements: D1PreparedStatement[] = [];
  for (let i = 0; i < phones.length; i += 90) {
    const chunk = phones.slice(i, i + 90);
    statements.push(db.prepare(`SELECT id, phone, created_at, tags_json FROM raw_pos_orders WHERE pos_id IN (${all.map(() => '?').join(',')}) AND phone IN (${chunk.map(() => '?').join(',')}) AND status_code NOT IN (6,7) AND created_at<?`).bind(...all, ...chunk, endUtc));
  }
  const history = new Map<string, HistRow[]>();
  for (let i = 0; i < statements.length; i += 100) {
    for (const res of await db.batch(statements.slice(i, i + 100))) {
      for (const h of res.results as HistRow[]) { const a = history.get(h.phone) ?? []; a.push(h); history.set(h.phone, a); }
    }
  }
  for (const a of history.values()) a.sort((x, y) => x.created_at.localeCompare(y.created_at));
  const allIds = [...new Set([...rows.map((r) => r.id), ...[...history.values()].flat().map((h) => h.id)])];
  const items = await itemNames(db, allIds);
  const groupCache = new Map<string, string[]>();
  const groupOf = (id: string, tags: string | null) => {
    let g = groupCache.get(id);
    if (!g) { g = groupsOf(tags, items.get(id) ?? [], 'main', 'both'); groupCache.set(id, g); }
    return g;
  };

  type Staff = { staffId: string; orders: number; net: number; customers: Set<string>; repeat: number; groupsSum: number; flows: Map<string, number> };
  const staff = new Map<string, Staff>();
  const seqDist = { 1: 0, 2: 0, 3: 0, 4: 0 } as Record<1 | 2 | 3 | 4, number>;
  const flows = new Map<string, number>(); // "từ|sang"
  const customerGroups = new Map<string, Set<string>>();
  let totalNet = 0, repeatOrders = 0;
  for (const r of rows) {
    const h = history.get(r.phone) ?? [];
    const idx = h.findIndex((x) => x.id === r.id);
    const seq = idx >= 0 ? idx + 1 : h.filter((x) => x.created_at < r.created_at).length + 1;
    seqDist[Math.min(4, seq) as 1 | 2 | 3 | 4]++;
    const cur = groupOf(r.id, r.tags_json);
    const sid = r.staff ?? '';
    const s = staff.get(sid) ?? { staffId: sid, orders: 0, net: 0, customers: new Set<string>(), repeat: 0, groupsSum: 0, flows: new Map() };
    s.orders++; s.net += Number(r.net); s.customers.add(r.phone);
    totalNet += Number(r.net);
    if (seq >= 2) {
      repeatOrders++; s.repeat++;
      const prev = idx > 0 ? h[idx - 1] : [...h].reverse().find((x) => x.created_at < r.created_at);
      if (prev) for (const from of groupOf(prev.id, prev.tags_json)) for (const to of cur) {
        const k = `${from}|${to}`; flows.set(k, (flows.get(k) ?? 0) + 1); s.flows.set(k, (s.flows.get(k) ?? 0) + 1);
      }
    }
    staff.set(sid, s);
    if (!customerGroups.has(r.phone)) {
      const set = new Set<string>();
      for (const x of h) for (const g of groupOf(x.id, x.tags_json)) set.add(g);
      if (!set.size) for (const g of cur) set.add(g);
      customerGroups.set(r.phone, set);
    }
  }
  const diversity = { 1: 0, 2: 0, 3: 0 } as Record<1 | 2 | 3, number>;
  for (const set of customerGroups.values()) diversity[Math.min(3, Math.max(1, set.size)) as 1 | 2 | 3]++;
  const staffList = [...staff.values()].filter((s) => s.staffId).map((s) => {
    const top = [...s.flows.entries()].sort((a, b) => b[1] - a[1])[0];
    const groups = [...s.customers].reduce((t, p) => t + (customerGroups.get(p)?.size ?? 1), 0);
    return {
      staffId: s.staffId, name: nameMap.get(s.staffId)?.name ?? `NV ${s.staffId.slice(0, 8)}`, department: nameMap.get(s.staffId)?.department ?? null,
      customers: s.customers.size, orders: s.orders, net: s.net, aov: s.orders ? s.net / s.orders : null,
      ordersPerCustomer: s.customers.size ? s.orders / s.customers.size : null, repeatShare: s.orders ? s.repeat / s.orders * 100 : null,
      avgGroups: s.customers.size ? groups / s.customers.size : null, topFlow: top ? { from: top[0].split('|')[0], to: top[0].split('|')[1], n: top[1] } : null,
    };
  }).sort((a, b) => b.net - a.net);
  // Độ đều: đường cong Lorenz trên doanh thu từng người (ít → nhiều) và chỉ số đều = 100 × (1 − Gini).
  const nets = staffList.map((s) => Math.max(0, s.net)).sort((a, b) => a - b);
  const sum = nets.reduce((a, b) => a + b, 0);
  let acc = 0;
  const lorenz = [{ people: 0, share: 0 }, ...nets.map((v, i) => { acc += v; return { people: (i + 1) / nets.length * 100, share: sum ? acc / sum * 100 : 0 }; })];
  let area = 0;
  for (let i = 1; i < lorenz.length; i++) area += (lorenz[i].people - lorenz[i - 1].people) / 100 * (lorenz[i].share + lorenz[i - 1].share) / 200;
  const gini = nets.length > 1 && sum ? Math.max(0, 1 - 2 * area) : null;
  const top20 = nets.length ? [...nets].reverse().slice(0, Math.max(1, Math.round(nets.length * 0.2))).reduce((a, b) => a + b, 0) : 0;
  const sale = saleAgg.results[0] as { n: number; net: number } | undefined;
  const customers = new Set(rows.map((r) => r.phone)).size;
  return {
    period: { start: opts.start, end: opts.end },
    groups: MAIN_LABELS,
    total: { orders: rows.length, customers, net: totalNet, aov: rows.length ? totalNet / rows.length : null, ordersPerCustomer: customers ? rows.length / customers : null, repeatShare: rows.length ? repeatOrders / rows.length * 100 : null },
    sale: { orders: Number(sale?.n ?? 0), net: Number(sale?.net ?? 0), aov: sale?.n ? Number(sale.net) / Number(sale.n) : null },
    seqDist, diversity,
    flows: [...flows.entries()].map(([k, n]) => ({ from: k.split('|')[0], to: k.split('|')[1], n })).sort((a, b) => b.n - a.n),
    evenness: { gini, index: gini === null ? null : (1 - gini) * 100, top20Share: sum ? top20 / sum * 100 : null, lorenz, people: nets.length },
    staff: staffList,
    allStaff: [...new Set(everyone.map((r) => r.staff ?? '').filter(Boolean))].map((id) => ({ staffId: id, name: nameMap.get(id)?.name ?? `NV ${id.slice(0, 8)}`, department: nameMap.get(id)?.department ?? null }))
      .sort((a, b) => a.name.localeCompare(b.name, 'vi')),
    definitions: {
      scope: 'Đơn chốt trong kỳ (đã xác nhận trở đi, theo ngày xác nhận lần đầu) của nhân viên CSKH; nhân viên = NV chăm sóc trên đơn, trống thì người bán.',
      seq: 'Lần mua thứ mấy = thứ tự của đơn trong mọi đơn không hủy / không xóa của cùng SĐT trên cả 6 POS.',
      flows: 'Đường đi sản phẩm = nhóm sản phẩm của đơn liền trước → nhóm của đơn này (chỉ đơn mua lần 2 trở đi). Đơn có cả hai nhóm tính cả hai đường.',
      diversity: 'Độ đa dạng = số nhóm sản phẩm (Kháng sinh, SK + GK, Khác) khách đã từng mua tính tới hết kỳ.',
      evenness: 'Chỉ số đều = 100 × (1 − Gini) trên doanh thu từng nhân viên: 100 = mọi người bằng nhau, càng thấp càng dồn vào ít người.',
      aov: 'GTTB = doanh thu ÷ đơn chốt. GTTB Sale tính trên đơn chốt cùng kỳ của người bán thuộc bộ phận Sale.',
    },
  };
}
