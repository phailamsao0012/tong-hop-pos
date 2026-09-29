// Bậc thang mua lại (yêu cầu 29/09/2026): T0 = đơn ĐẦU TIÊN khách đã nhận hàng (Đã nhận / Đã thu tiền), T1 = lần mua (đã nhận) thứ 2,
// T2 = lần thứ 3… trên cả 6 POS, ai bán cũng tính. Nhóm của khách = nhóm của đơn T0, chỉ 2 nhóm:
//   Kháng sinh (BIO NANO SHIELD, GENTADOX, OXY + BỔ HUYẾT, thẻ "BIO NANO") · Combo (BIO NANO CLEAN, GODKILL, SK + GK, mua lẻ hay combo);
//   đơn có cả hai → Kháng sinh; đơn chỉ có sản phẩm khác → không tính.
// - CSKH: khách đang được phân công cho một nhân viên (Data cầm, hồ sơ khách Pancake).
// - Sale: khách có T0 do người bán thuộc Sale bán, xếp theo tháng của T0 (khách mới Sale đưa về).
// Đọc lịch sử bằng chỉ mục phủ idx_raw_orders_pos_status_phone_tags (không đọc JSON gốc); chỉ đơn không nhận ra nhóm qua thẻ
// (để xem tên sản phẩm) và đơn mua tiếp (tiền, NV chăm sóc) mới đọc theo rowid.
import { env } from 'cloudflare:workers';
import { POS } from '@/lib/report-model';
import { groupsOf, itemNames } from '@/lib/product-groups';
import { STATUS_GROUPS } from '@/lib/stats';
import { teamSubquery } from '@/lib/team';

export const LADDER_GROUPS = ['Kháng sinh', 'Combo'] as const;
export type LadderGroup = typeof LADDER_GROUPS[number];
export const STEPS = 5; // T1…T5+ (T5+ = từ lần thứ 6 trở lên)
const DELIVERED = STATUS_GROUPS.delivered.join(',');
const NET = 'COALESCE(net_total,COALESCE(current_total,0)-COALESCE(total_discount,0))';
const DAY = 86400000;
const toMs = (s: string) => Date.parse(s.endsWith('Z') || s.includes('+') ? s : `${s}Z`);
const vnMonth = (t: string) => new Date(toMs(t) + 7 * 3600000).toISOString().slice(0, 7);

type H = { rid: number; p: string; t: string; tags: string | null; s: string | null; pos: string };
const memo = new Map<string, { at: number; value: unknown }>();
async function remember<T>(key: string, ttl: number, fn: () => Promise<T>) {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value as T;
  const value = await fn();
  memo.set(key, { at: Date.now(), value });
  if (memo.size > 100) memo.delete(memo.keys().next().value!);
  return value;
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

/** Mọi đơn đã nhận hàng của các SĐT (cả 6 POS), xếp theo thời điểm tạo. */
async function deliveredHistory(phones: string[]) {
  const all = POS.map((x) => x.id);
  const st: D1PreparedStatement[] = [];
  for (let i = 0; i < phones.length; i += 90) {
    const c = phones.slice(i, i + 90);
    st.push(env.DB.prepare(`SELECT o.rowid AS rid, o.phone AS p, o.created_at AS t, o.tags_json AS tags, o.seller_id AS s, o.pos_id AS pos
      FROM raw_pos_orders o INDEXED BY idx_raw_orders_pos_status_phone_tags
      WHERE o.pos_id IN (${all.map(() => '?').join(',')}) AND o.status_code IN (${DELIVERED}) AND o.phone IN (${c.map(() => '?').join(',')})`).bind(...all, ...c));
  }
  const map = new Map<string, H[]>();
  for (const h of await batched<H>(st)) { const a = map.get(h.p) ?? []; a.push(h); map.set(h.p, a); }
  for (const a of map.values()) a.sort((x, y) => x.t.localeCompare(y.t));
  return map;
}

/** Nhóm của các đơn: thử theo thẻ trước; đơn chưa nhận ra thì đọc tên sản phẩm (theo rowid → id → dòng sản phẩm). */
/** Quá nhiều đơn chưa nhận ra qua thẻ thì chỉ xét theo thẻ (tránh đọc hàng nghìn đơn gốc làm D1 quá tải); `approx` báo cho giao diện. */
const MAX_PRODUCT_LOOKUP = 3000;
async function groupsFor(orders: H[]) {
  const out = new Map<number, Set<LadderGroup>>() as Map<number, Set<LadderGroup>> & { approx?: number };
  const need: H[] = [];
  for (const o of orders) {
    const g = groupsOf(o.tags, [], 'main', 'tag').filter((x): x is LadderGroup => (LADDER_GROUPS as readonly string[]).includes(x));
    if (g.length) out.set(o.rid, new Set(g)); else need.push(o);
  }
  if (need.length > MAX_PRODUCT_LOOKUP) { out.approx = need.length; return out; }
  if (need.length) {
    const ids = await byRowid<{ rid: number; id: string }>((q) => `SELECT rowid AS rid, id FROM raw_pos_orders WHERE rowid IN (${q})`, need.map((o) => o.rid));
    const items = await itemNames(env.DB, ids.map((r) => r.id));
    const idOf = new Map(ids.map((r) => [r.rid, r.id]));
    for (const o of need) {
      const g = groupsOf(o.tags, items.get(idOf.get(o.rid) ?? '') ?? [], 'main', 'both').filter((x): x is LadderGroup => (LADDER_GROUPS as readonly string[]).includes(x));
      out.set(o.rid, new Set(g));
    }
  }
  return out;
}
/** Đơn có cả hai nhóm → Kháng sinh; không thuộc nhóm nào → null. */
const primary = (g: Set<LadderGroup> | undefined): LadderGroup | null => !g?.size ? null : g.has('Kháng sinh') ? 'Kháng sinh' : 'Combo';

// gaps[k] = số ngày giữa lần mua k và k+1 (T0→T1, T1→T2…) của từng khách tới được bậc đó.
type Line = { t0: number; ladder: number[]; cross: number; ownCustomers: number; ownOrders: number; laterOrders: number; laterNet: number; days: number[]; gaps: number[][] };
const blank = (): Line => ({ t0: 0, ladder: Array(STEPS).fill(0), cross: 0, ownCustomers: 0, ownOrders: 0, laterOrders: 0, laterNet: 0, days: [], gaps: Array.from({ length: STEPS }, () => []) });
const quant = (sorted: number[], q: number) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1) + 0.5))] : null;
const gapStats = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return { n: s.length, avg: s.length ? s.reduce((x, y) => x + y, 0) / s.length : null, median: quant(s, 0.5), p25: quant(s, 0.25), p75: quant(s, 0.75) }; };
const packLine = (l: Line) => ({
  t0: l.t0, ladder: l.ladder.map((n, i) => ({ n, gap: gapStats(l.gaps[i]), rate: l.t0 ? n / l.t0 * 100 : null, step: (i ? l.ladder[i - 1] : l.t0) ? n / (i ? l.ladder[i - 1] : l.t0) * 100 : null })),
  cross: l.cross, crossRate: l.t0 ? l.cross / l.t0 * 100 : null, ownCustomers: l.ownCustomers, ownOrders: l.ownOrders,
  laterOrders: l.laterOrders, laterNet: l.laterNet, avgDaysToT1: l.days.length ? l.days.reduce((a, b) => a + b, 0) / l.days.length : null,
});
const addTo = (l: Line, hist: H[], g: LadderGroup, groups: Map<number, Set<LadderGroup>>) => {
  l.t0++;
  for (let k = 1; k <= STEPS; k++) if (hist.length > k) l.ladder[k - 1]++;
  const other: LadderGroup = g === 'Kháng sinh' ? 'Combo' : 'Kháng sinh';
  if (hist.slice(1).some((o) => groups.get(o.rid)?.has(other))) l.cross++;
  l.laterOrders += hist.length - 1;
  if (hist.length > 1) l.days.push((toMs(hist[1].t) - toMs(hist[0].t)) / DAY);
  // T5+ gộp: khoảng cách từ lần 5 tới lần 6 (bậc cuối chỉ tính lần đầu tới được bậc đó).
  for (let k = 1; k <= STEPS && k < hist.length; k++) l.gaps[k - 1].push((toMs(hist[k].t) - toMs(hist[k - 1].t)) / DAY);
};

export const LADDER_DEFINITIONS = {
  t: 'T0 = đơn đầu tiên khách đã nhận hàng (Đã nhận / Đã thu tiền); T1 = lần mua đã nhận thứ 2, T2 = lần thứ 3… (T5+ = từ lần thứ 6), trên cả 6 POS, ai bán cũng tính. % = số khách tới bậc đó ÷ số khách T0; "so bậc trước" = ÷ số khách ở bậc liền trước.',
  groups: 'Nhóm của khách = nhóm của đơn T0: Kháng sinh = BIO NANO SHIELD, GENTADOX, OXY + BỔ HUYẾT, thẻ "BIO NANO"; Combo = BIO NANO CLEAN, GODKILL, SK + GK (mua lẻ hay combo đều tính). Đơn có cả hai → Kháng sinh; đơn chỉ có sản phẩm khác → không tính.',
  cross: 'Up sang nhóm kia = khách T0 Kháng sinh sau đó có mua Combo (hoặc ngược lại) ở một lần mua tiếp.',
  gap: 'Khoảng cách giữa các lần mua (tính theo ngày tạo đơn): trong ô ghi TRUNG VỊ — một nửa số khách quay lại nhanh hơn số này (không bị vài khách rất lâu mới mua kéo lệch như trung bình); rê chuột xem trung bình và khoảng của 25% nhanh nhất / 25% chậm nhất.',
  own: 'Do chính NV = lần mua tiếp có NV chăm sóc (trống thì người bán) là chính nhân viên đang cầm khách.',
};

/** CSKH: bậc thang mua lại của khách đang được phân công cho một nhân viên. */
export function cskhLadder(opts: { staffId: string; posIds: string[] }) {
  return remember(`cskh|${opts.staffId}|${opts.posIds.join(',')}`, 15 * 60000, async () => {
    const custs = (await env.DB.prepare(`SELECT DISTINCT TRIM(phone) AS phone FROM pos_customers WHERE pos_id IN (${opts.posIds.map(() => '?').join(',')}) AND assigned_user_id=? AND phone IS NOT NULL AND TRIM(phone)<>''`)
      .bind(...opts.posIds, opts.staffId).all<{ phone: string }>()).results.map((r) => r.phone);
    const hist = await deliveredHistory(custs);
    const t0s = [...hist.values()].map((h) => h[0]);
    const later = [...hist.values()].flatMap((h) => h.slice(1));
    const groups = await groupsFor([...t0s, ...later]);
    const extra = new Map((await byRowid<{ rid: number; care: string | null; net: number }>((q) => `SELECT rowid AS rid, NULLIF(care_id,'') AS care, ${NET} AS net FROM raw_pos_orders WHERE rowid IN (${q})`, later.map((o) => o.rid))).map((r) => [r.rid, r]));
    const lines = new Map<LadderGroup, Line>(LADDER_GROUPS.map((g) => [g, blank()]));
    let other = 0;
    for (const h of hist.values()) {
      const g = primary(groups.get(h[0].rid));
      if (!g) { other++; continue; }
      const l = lines.get(g)!;
      addTo(l, h, g, groups);
      let own = 0;
      for (const o of h.slice(1)) { const x = extra.get(o.rid); l.laterNet += Number(x?.net ?? 0); if ((x?.care ?? o.s) === opts.staffId) own++; }
      if (own) { l.ownCustomers++; l.ownOrders += own; }
    }
    const total = blank();
    for (const l of lines.values()) {
      total.t0 += l.t0; total.cross += l.cross; total.ownCustomers += l.ownCustomers; total.ownOrders += l.ownOrders; total.laterOrders += l.laterOrders; total.laterNet += l.laterNet; total.days.push(...l.days);
      l.ladder.forEach((n, i) => { total.ladder[i] += n; total.gaps[i].push(...l.gaps[i]); });
    }
    return {
      staffId: opts.staffId, data: custs.length, noDelivered: custs.length - hist.size, other, approx: (groups as { approx?: number }).approx ?? 0,
      groups: LADDER_GROUPS.map((g) => ({ label: g, ...packLine(lines.get(g)!) })), total: packLine(total), steps: STEPS, definitions: LADDER_DEFINITIONS,
    };
  });
}

/** Sale: khách mới Sale đưa về (T0 do người bán thuộc Sale), theo tháng của T0, 6 tháng gần nhất. */
export function saleLadder(opts: { posIds: string[]; staffId?: string | null; group?: LadderGroup | null; today: string }) {
  return remember(`sale|${opts.posIds.join(',')}|${opts.staffId ?? ''}|${opts.group ?? ''}|${opts.today}`, 30 * 60000, async () => {
    const [y, m] = opts.today.split('-').map(Number);
    const months = Array.from({ length: 6 }, (_, i) => new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7)).reverse();
    const startUtc = new Date(Date.parse(`${months[0]}-01T00:00:00Z`) - 7 * 3600000).toISOString().slice(0, 19);
    const ph = opts.posIds.map(() => '?').join(',');
    const anchors = (await env.DB.prepare(`SELECT DISTINCT o.phone AS p FROM raw_pos_orders o INDEXED BY idx_raw_orders_pos_status_phone_tags
      WHERE o.pos_id IN (${ph}) AND o.status_code IN (${DELIVERED}) AND o.created_at>=? AND o.phone IS NOT NULL AND o.phone<>''
        AND o.seller_id IN ${teamSubquery('sale')}${opts.staffId ? ' AND o.seller_id=?' : ''}`).bind(...opts.posIds, startUtc, ...(opts.staffId ? [opts.staffId] : [])).all<{ p: string }>()).results.map((r) => r.p);
    const hist = await deliveredHistory(anchors);
    const saleIds = new Set((await env.DB.prepare(teamSubquery('sale')!.slice(1, -1)).all<{ user_id: string }>()).results.map((r) => r.user_id));
    // Khách mới Sale đưa về: T0 (đơn đã nhận đầu tiên, cả 6 POS) trong 6 tháng, ở POS đang chọn, do người bán thuộc Sale (hoặc đúng Sale đang lọc).
    const cohort = [...hist.values()].filter((h) => h[0].t >= startUtc && opts.posIds.includes(h[0].pos) && (opts.staffId ? h[0].s === opts.staffId : saleIds.size ? saleIds.has(h[0].s ?? '') : true));
    // Chỉ cần nhóm của đơn T0 (lọc theo nhóm); không đọc thêm đơn mua tiếp.
    const groups = opts.group ? await groupsFor(cohort.map((h) => h[0])) : new Map<number, Set<LadderGroup>>();
    const byMonth = new Map<string, Line>(months.map((mo) => [mo, blank()]));
    for (const h of cohort) {
      if (opts.group && primary(groups.get(h[0].rid)) !== opts.group) continue;
      const l = byMonth.get(vnMonth(h[0].t)); if (!l) continue;
      addTo(l, h, opts.group ?? 'Kháng sinh', groups);
    }
    const total = blank();
    for (const l of byMonth.values()) { total.t0 += l.t0; total.laterOrders += l.laterOrders; total.days.push(...l.days); total.cross += l.cross; l.ladder.forEach((n, i) => { total.ladder[i] += n; total.gaps[i].push(...l.gaps[i]); }); }
    const now = Date.parse(`${opts.today}T12:00:00Z`);
    return {
      months: months.map((mo) => ({ month: mo, followDays: Math.max(0, Math.round((now - Date.parse(`${mo}-01T00:00:00Z`)) / DAY)), ...packLine(byMonth.get(mo)!) })),
      total: packLine(total), steps: STEPS, group: opts.group ?? null, staffId: opts.staffId ?? null,
      approx: (groups as { approx?: number }).approx ?? 0,
      definitions: { ...LADDER_DEFINITIONS, cohort: 'Khách mới Sale đưa về = khách có đơn đã nhận ĐẦU TIÊN (trên cả 6 POS) do người bán thuộc bộ phận Sale, xếp theo tháng tạo đơn đó. Tháng gần đây mới theo dõi ít ngày nên các bậc sau còn thấp.' },
    };
  });
}
