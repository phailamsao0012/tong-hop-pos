// Mua lại & Upsell (dùng chung cho web và bot).
import { env } from 'cloudflare:workers';
import { POS } from '@/lib/report-model';
import { SUCCESS } from '@/lib/customer-stats';
import { COMPANY_START, vnRangeUtc } from '@/lib/report-time';
import { teamFilter, type Team } from '@/lib/team';

const VN_MONTH = (col: string) => `substr(date(datetime(${col},'+7 hours')),1,7)`;

type Row = {
  id: string; pos_id: string; phone: string; seller_id: string | null; created_at: string; net: number; tags_json: string;
};
type Hist = { t: string; tags: string[] };

// Thẻ vận hành trên đơn (đối soát, gọi lại, giao hàng…) — không phải dòng sản phẩm nên không tính "mua lại theo thẻ".
const OPERATIONAL_TAG = /đối soát|không nghe|hotline|không liên lạc|xin địa chỉ|đã lấy hàng|hẹn gọi|giao không thành|đang giao|nhắc nhở|không lấy được|nhập hàng|chưa tiếp cận|trùng|hoàn một phần|spam|giá đắt|mua lẻ|dùng thử|kcnc|tk thêm|sai số|nhầm/i;
/** Thẻ dòng sản phẩm của một đơn (bỏ thẻ vận hành, bỏ trùng). */
export function productTags(tagsJson: string | null | undefined): string[] {
  try {
    const arr = JSON.parse(tagsJson || '[]') as { name?: string | null }[];
    return [...new Set(arr.map((t) => (t?.name ?? '').trim()).filter((n) => n && !OPERATIONAL_TAG.test(n)))];
  } catch { return []; }
}

export type RepurchaseOptions = {
  /** Chỉ tính đơn có thẻ này; "mua lại" = khách đã có đơn thành công mang CÙNG thẻ trước đó (đơn thẻ khác không tính). */
  tag?: string;
  /** Chỉ tính đơn của người bán này. */
  sellerId?: string;
};

export async function repurchaseReport(posIdsIn: string[], start: string, end: string, team: Team = 'all', options: RepurchaseOptions = {}) {
  const tf = teamFilter('seller_id', team);
  const posIds = posIdsIn.length ? posIdsIn : POS.map((x) => x.id);
  const { startUtc, endUtc } = vnRangeUtc(start, end);
  const db = env.DB;
  const tagPick = (options.tag ?? '').trim();
  const sellerPick = (options.sellerId ?? '').trim();
  // Cohort lấy toàn bộ từ tháng thành lập (03/2025) tới nay.
  const cohortStartUtc12 = new Date(Date.parse(`${COMPANY_START}T00:00:00Z`) - 7 * 3600000).toISOString().slice(0, 19);
  const [rows, names, funnelRes, cohortRes, sizeRes] = await db.batch([
    // Đơn thành công trong kỳ kèm thẻ; thứ tự mua (chung và theo thẻ) tính ở dưới từ lịch sử của đúng các SĐT này.
    db.prepare(`
      SELECT o.id, o.pos_id, o.phone, o.seller_id, o.created_at, COALESCE(o.net_total,COALESCE(o.current_total,0)-COALESCE(o.total_discount,0)) AS net, o.tags_json
      FROM raw_pos_orders o
      WHERE o.pos_id IN (${posIds.map(() => '?').join(',')}) AND o.${SUCCESS} AND o.phone IS NOT NULL AND o.phone<>''${teamFilter('o.seller_id', team)}${sellerPick ? ' AND o.seller_id=?' : ''}
        AND o.created_at>=? AND o.created_at<?
      ORDER BY o.created_at DESC LIMIT 20000`).bind(...posIds, ...(sellerPick ? [sellerPick] : []), startUtc, endUtc),
    db.prepare("SELECT user_id,name FROM pos_users WHERE name<>''"),
    // Phễu trọn đời: khách đã mua ≥1 / ≥2 / ≥3 lần (customer_stats của các POS đã chọn).
    db.prepare(`SELECT SUM(success_orders>=1) AS once, SUM(success_orders>=2) AS twice, SUM(success_orders>=3) AS thrice FROM customer_stats WHERE pos_id IN (${posIds.map(() => '?').join(',')})${tf}`).bind(...posIds),
    // Cohort: tháng mua lần đầu × số tháng kể từ đó → số khách có đơn thành công (từ tháng thành lập).
    db.prepare(`SELECT ${VN_MONTH('c.first_success_at')} AS cohort,
        (CAST(strftime('%Y', datetime(o.created_at,'+7 hours')) AS INT) - CAST(strftime('%Y', datetime(c.first_success_at,'+7 hours')) AS INT)) * 12
          + (CAST(strftime('%m', datetime(o.created_at,'+7 hours')) AS INT) - CAST(strftime('%m', datetime(c.first_success_at,'+7 hours')) AS INT)) AS diff,
        COUNT(DISTINCT c.id) AS customers
      FROM raw_pos_orders o JOIN customer_stats c ON c.id = o.pos_id||':'||o.phone
      WHERE o.pos_id IN (${posIds.map(() => '?').join(',')}) AND o.${SUCCESS} AND o.phone IS NOT NULL AND o.phone<>''
        AND o.created_at>=? AND c.first_success_at>=?${teamFilter('c.seller_id', team)}
      GROUP BY 1,2`).bind(...posIds, cohortStartUtc12, cohortStartUtc12),
    // Cỡ cohort = số khách có lần mua đầu trong tháng đó (từ customer_stats, không phụ thuộc đơn đã đồng bộ).
    db.prepare(`SELECT ${VN_MONTH('first_success_at')} AS cohort, COUNT(*) AS n FROM customer_stats WHERE pos_id IN (${posIds.map(() => '?').join(',')}) AND first_success_at>=?${tf} GROUP BY 1`).bind(...posIds, cohortStartUtc12),
  ]);
  // Lịch sử đơn thành công (trước cuối kỳ) của đúng các SĐT trong kỳ, tra theo chỉ mục (pos_id, phone), 90 SĐT một câu.
  const allRows = rows.results as Row[];
  const phonesByPos = new Map<string, Set<string>>();
  for (const r of allRows) { if (!phonesByPos.has(r.pos_id)) phonesByPos.set(r.pos_id, new Set()); phonesByPos.get(r.pos_id)!.add(r.phone); }
  const histStatements: D1PreparedStatement[] = [];
  const histPos: string[] = []; // POS của từng câu (cùng thứ tự với histStatements)
  for (const [posId, phones] of phonesByPos) {
    const list = [...phones];
    for (let i = 0; i < list.length; i += 90) {
      const chunk = list.slice(i, i + 90);
      histStatements.push(db.prepare(`SELECT phone, created_at, tags_json FROM raw_pos_orders WHERE pos_id=? AND phone IN (${chunk.map(() => '?').join(',')}) AND ${SUCCESS} AND created_at<?`).bind(posId, ...chunk, endUtc));
      histPos.push(posId);
    }
  }
  const history = new Map<string, Hist[]>();
  for (let i = 0; i < histStatements.length; i += 100) {
    const results = await db.batch(histStatements.slice(i, i + 100));
    results.forEach((res, j) => {
      const posId = histPos[i + j];
      for (const h of res.results as { phone: string; created_at: string; tags_json: string }[]) {
        const key = `${posId}:${h.phone}`;
        if (!history.has(key)) history.set(key, []);
        history.get(key)!.push({ t: h.created_at, tags: productTags(h.tags_json) });
      }
    });
  }
  const priorOf = (r: Row, tag?: string) => (history.get(`${r.pos_id}:${r.phone}`) ?? []).filter((h) => h.t < r.created_at && (!tag || h.tags.includes(tag))).length;
  // Theo thẻ (không áp bộ lọc thẻ, để bảng "Theo thẻ" và danh sách thẻ luôn đủ): đơn đầu / mua lại của từng dòng sản phẩm.
  const tagAgg = new Map<string, { orders: number; resaleOrders: number; customers: Set<string>; resaleCustomers: Set<string>; net: number; resaleNet: number }>();
  for (const r of allRows) {
    for (const tag of productTags(r.tags_json)) {
      if (!tagAgg.has(tag)) tagAgg.set(tag, { orders: 0, resaleOrders: 0, customers: new Set(), resaleCustomers: new Set(), net: 0, resaleNet: 0 });
      const a = tagAgg.get(tag)!; const key = `${r.pos_id}:${r.phone}`;
      a.orders++; a.customers.add(key); a.net += Number(r.net);
      if (priorOf(r, tag) > 0) { a.resaleOrders++; a.resaleCustomers.add(key); a.resaleNet += Number(r.net); }
    }
  }
  const byTag = [...tagAgg.entries()].map(([tag, a]) => ({
    tag, orders: a.orders, customers: a.customers.size, net: a.net, resaleOrders: a.resaleOrders, resaleCustomers: a.resaleCustomers.size, resaleNet: a.resaleNet,
    resaleRate: a.orders ? Math.round(a.resaleOrders / a.orders * 1000) / 10 : null,
  })).sort((a, b) => b.orders - a.orders);
  // Khi lọc theo thẻ: chỉ đơn mang thẻ đó; "lần mua" đếm trên đơn cùng thẻ.
  const scopedRows = tagPick ? allRows.filter((r) => productTags(r.tags_json).includes(tagPick)) : allRows;
  const rowsWithPrior = scopedRows.map((r) => ({ ...r, prior: priorOf(r, tagPick || undefined) }));
  const cohortSize = new Map((sizeRes.results as { cohort: string; n: number }[]).map((r) => [r.cohort, Number(r.n)]));
  const funnelRow = funnelRes.results[0] as { once: number | null; twice: number | null; thrice: number | null };
  const cohortMap = new Map<string, Map<number, number>>();
  for (const r of cohortRes.results as { cohort: string; diff: number; customers: number }[]) {
    if (!cohortMap.has(r.cohort)) cohortMap.set(r.cohort, new Map());
    cohortMap.get(r.cohort)!.set(Number(r.diff), Number(r.customers));
  }
  const cohorts = [...cohortSize.entries()].filter(([, n]) => n > 0).sort(([a], [b]) => a.localeCompare(b)).map(([month, size]) => {
    const m = cohortMap.get(month) ?? new Map<number, number>();
    const maxDiff = Math.max(0, ...m.keys());
    return { month, size, retention: Array.from({ length: maxDiff + 1 }, (_, d) => d === 0 ? 100 : Math.min(100, Math.round((m.get(d) ?? 0) / size * 1000) / 10)) };
  });
  const nameMap = new Map((names.results as { user_id: string; name: string }[]).map((r) => [r.user_id, r.name]));
  const levelOf = (prior: number) => prior === 0 ? 0 : prior === 1 ? 1 : prior === 2 ? 2 : 3; // 3 = Upsell lần 3 trở lên
  const empty = () => ({ customers: new Set<string>(), orders: 0, net: 0 });
  const levels = [empty(), empty(), empty(), empty()];
  const byPos = new Map<string, ReturnType<typeof empty>[]>();
  const byEmployee = new Map<string, ReturnType<typeof empty>[]>();
  const ensure = (map: Map<string, ReturnType<typeof empty>[]>, key: string) => {
    if (!map.has(key)) map.set(key, [empty(), empty(), empty(), empty()]);
    return map.get(key)!;
  };
  for (const r of rowsWithPrior) {
    const lvl = levelOf(Number(r.prior));
    const key = `${r.pos_id}:${r.phone}`;
    for (const bucket of [levels[lvl], ensure(byPos, r.pos_id)[lvl], ensure(byEmployee, r.seller_id ?? '')[lvl]]) {
      bucket.customers.add(key); bucket.orders++; bucket.net += Number(r.net);
    }
  }
  const pack = (b: ReturnType<typeof empty>[]) => b.map((x, i) => ({
    level: i, label: ['Mua lần đầu', 'Upsell lần 1', 'Upsell lần 2', 'Upsell lần 3+'][i], customers: x.customers.size, orders: x.orders, net: x.net,
  }));
  const repurchase = (b: ReturnType<typeof empty>[]) => ({
    customers: new Set([...b[1].customers, ...b[2].customers, ...b[3].customers]).size,
    orders: b[1].orders + b[2].orders + b[3].orders, net: b[1].net + b[2].net + b[3].net,
  });
  return {

    period: { start, end },
    filters: { tag: tagPick || null, sellerId: sellerPick || null },
    summary: { levels: pack(levels), repurchase: repurchase(levels), successOrders: rowsWithPrior.length },
    byTag,
    funnel: { once: Number(funnelRow?.once ?? 0), twice: Number(funnelRow?.twice ?? 0), thrice: Number(funnelRow?.thrice ?? 0) },
    cohorts,
    byPos: [...byPos.entries()].map(([posId, b]) => ({ posId, posName: POS.find((x) => x.id === posId)?.name ?? posId, levels: pack(b), repurchase: repurchase(b) })),
    byEmployee: [...byEmployee.entries()].map(([sellerId, b]) => ({
      sellerId, name: sellerId ? nameMap.get(sellerId) ?? `NV ${sellerId.slice(0, 8)}` : 'Chưa gán người bán', levels: pack(b), repurchase: repurchase(b),
    })).sort((a, b) => b.repurchase.net - a.repurchase.net),
    recent: rowsWithPrior.filter((r) => Number(r.prior) > 0).slice(0, 400).map((r) => ({
      posName: POS.find((x) => x.id === r.pos_id)?.name ?? r.pos_id, posId: r.pos_id, phone: r.phone, createdAt: r.created_at, net: Number(r.net),
      level: levelOf(Number(r.prior)), prior: Number(r.prior), sellerName: r.seller_id ? nameMap.get(r.seller_id) ?? `NV ${r.seller_id.slice(0, 8)}` : '—', tags: productTags(r.tags_json),
    })),
    definitions: {
      basis: 'Đơn mua thành công (Đã nhận / Đã thu tiền) tạo trong kỳ, tính theo ngày tạo đơn giờ VN.',
      upsell: tagPick
        ? `Đang lọc thẻ "${tagPick}": chỉ tính đơn mang thẻ này; Upsell lần n = đơn thành công thứ n+1 CÙNG THẺ của cùng SĐT trong cùng POS. Đơn thẻ khác (ví dụ sát khuẩn khi đang xem kháng sinh) không tính là mua lại.`
        : 'Upsell lần n = đơn mua thành công thứ n+1 của cùng SĐT trong cùng POS, xét toàn bộ lịch sử đã đồng bộ (lịch sử càng đủ thì số càng chính xác).',
      tag: 'Theo thẻ: mỗi đơn xét theo thẻ dòng sản phẩm gắn trên đơn (bỏ thẻ vận hành như Chưa đối soát, Không nghe máy…). Mua lại theo thẻ = khách đã có đơn thành công mang cùng thẻ trước đó. Tỷ lệ mua lại = đơn mua lại ÷ đơn có thẻ trong kỳ.',
      employee: 'Ghi nhận cho người bán đang gán trên đơn mua lại.',
      cohort: 'Cohort: khách gom theo tháng mua thành công lần đầu; mỗi cột = % khách của nhóm có đơn thành công ở tháng thứ n kể từ đó (T0 = tháng mua đầu, luôn 100%).',
      funnel: 'Phễu trọn đời (không theo kỳ): số khách đã mua thành công ≥1, ≥2, ≥3 lần trong các POS đã chọn.',
    },
  };
}
export type RepurchaseReport = Awaited<ReturnType<typeof repurchaseReport>>;
