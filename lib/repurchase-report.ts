// Mua lại & Upsell (dùng chung cho web và bot).
import { env } from 'cloudflare:workers';
import { POS } from '@/lib/report-model';
import { vnRangeUtc } from '@/lib/report-time';
import { teamFilter, type Team } from '@/lib/team';

const VN_MONTH = (col: string) => `substr(date(datetime(${col},'+7 hours')),1,7)`;

type Row = {
  id: string; pos_id: string; phone: string; seller_id: string | null; created_at: string; net: number; prior: number;
};

export async function repurchaseReport(posIdsIn: string[], start: string, end: string, team: Team = 'all') {
  const tf = teamFilter('seller_id', team);
  const posIds = posIdsIn.length ? posIdsIn : POS.map((x) => x.id);
  const { startUtc, endUtc } = vnRangeUtc(start, end);
  const db = env.DB;
  // Cohort lấy 12 tháng gần nhất tính từ tháng của ngày kết thúc kỳ.
  const cohortStart = `${end.slice(0, 4)}-${end.slice(5, 7)}-01`;
  const cohortFrom = new Date(Date.UTC(Number(cohortStart.slice(0, 4)), Number(cohortStart.slice(5, 7)) - 12, 1));
  const cohortStartUtc12 = new Date(cohortFrom.getTime() - 7 * 3600000).toISOString().slice(0, 19);
  const [rows, names, funnelRes, cohortRes, sizeRes] = await db.batch([
    // Thứ tự mua của mỗi (POS, SĐT) tính bằng window function trên toàn bộ đơn thành công của các POS đã chọn.
    // (Bản cũ dùng truy vấn con tương quan: mỗi đơn quét lại toàn bộ đơn cũ của POS → D1 quá hạn CPU.)
    db.prepare(`
      SELECT id, pos_id, phone, seller_id, created_at, net, prior FROM (
        SELECT id, pos_id, phone, seller_id, created_at, COALESCE(net_total,COALESCE(current_total,0)-COALESCE(total_discount,0)) AS net,
          ROW_NUMBER() OVER (PARTITION BY pos_id, phone ORDER BY created_at, id) - 1 AS prior
        FROM raw_pos_orders
        WHERE pos_id IN (${posIds.map(() => '?').join(',')}) AND status_code IN (3,16) AND phone IS NOT NULL AND phone<>''${tf}
      ) WHERE created_at>=? AND created_at<?
      ORDER BY created_at DESC LIMIT 20000`).bind(...posIds, startUtc, endUtc),
    db.prepare("SELECT user_id,name FROM pos_users WHERE name<>''"),
    // Phễu trọn đời: khách đã mua ≥1 / ≥2 / ≥3 lần (customer_stats của các POS đã chọn).
    db.prepare(`SELECT SUM(success_orders>=1) AS once, SUM(success_orders>=2) AS twice, SUM(success_orders>=3) AS thrice FROM customer_stats WHERE pos_id IN (${posIds.map(() => '?').join(',')})${tf}`).bind(...posIds),
    // Cohort: tháng mua lần đầu × số tháng kể từ đó → số khách có đơn thành công (12 tháng gần nhất).
    db.prepare(`SELECT ${VN_MONTH('c.first_success_at')} AS cohort,
        (CAST(strftime('%Y', datetime(o.created_at,'+7 hours')) AS INT) - CAST(strftime('%Y', datetime(c.first_success_at,'+7 hours')) AS INT)) * 12
          + (CAST(strftime('%m', datetime(o.created_at,'+7 hours')) AS INT) - CAST(strftime('%m', datetime(c.first_success_at,'+7 hours')) AS INT)) AS diff,
        COUNT(DISTINCT c.id) AS customers
      FROM raw_pos_orders o JOIN customer_stats c ON c.id = o.pos_id||':'||o.phone
      WHERE o.pos_id IN (${posIds.map(() => '?').join(',')}) AND o.status_code IN (3,16) AND o.phone IS NOT NULL AND o.phone<>''
        AND o.created_at>=? AND c.first_success_at>=?${teamFilter('c.seller_id', team)}
      GROUP BY 1,2`).bind(...posIds, cohortStartUtc12, cohortStartUtc12),
    // Cỡ cohort = số khách có lần mua đầu trong tháng đó (từ customer_stats, không phụ thuộc đơn đã đồng bộ).
    db.prepare(`SELECT ${VN_MONTH('first_success_at')} AS cohort, COUNT(*) AS n FROM customer_stats WHERE pos_id IN (${posIds.map(() => '?').join(',')}) AND first_success_at>=?${tf} GROUP BY 1`).bind(...posIds, cohortStartUtc12),
  ]);
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
  for (const r of rows.results as Row[]) {
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
    summary: { levels: pack(levels), repurchase: repurchase(levels), successOrders: rows.results.length },
    funnel: { once: Number(funnelRow?.once ?? 0), twice: Number(funnelRow?.twice ?? 0), thrice: Number(funnelRow?.thrice ?? 0) },
    cohorts,
    byPos: [...byPos.entries()].map(([posId, b]) => ({ posId, posName: POS.find((x) => x.id === posId)?.name ?? posId, levels: pack(b), repurchase: repurchase(b) })),
    byEmployee: [...byEmployee.entries()].map(([sellerId, b]) => ({
      sellerId, name: sellerId ? nameMap.get(sellerId) ?? `NV ${sellerId.slice(0, 8)}` : 'Chưa gán người bán', levels: pack(b), repurchase: repurchase(b),
    })).sort((a, b) => b.repurchase.net - a.repurchase.net),
    recent: (rows.results as Row[]).filter((r) => Number(r.prior) > 0).slice(0, 100).map((r) => ({
      posName: POS.find((x) => x.id === r.pos_id)?.name ?? r.pos_id, posId: r.pos_id, phone: r.phone, createdAt: r.created_at, net: Number(r.net),
      level: levelOf(Number(r.prior)), prior: Number(r.prior), sellerName: r.seller_id ? nameMap.get(r.seller_id) ?? `NV ${r.seller_id.slice(0, 8)}` : '—',
    })),
    definitions: {
      basis: 'Đơn mua thành công (Đã nhận / Đã thu tiền) tạo trong kỳ, tính theo ngày tạo đơn giờ VN.',
      upsell: 'Upsell lần n = đơn mua thành công thứ n+1 của cùng SĐT trong cùng POS, xét toàn bộ lịch sử đã đồng bộ (lịch sử càng đủ thì số càng chính xác).',
      employee: 'Ghi nhận cho người bán đang gán trên đơn mua lại.',
      cohort: 'Cohort: khách gom theo tháng mua thành công lần đầu; mỗi cột = % khách của nhóm có đơn thành công ở tháng thứ n kể từ đó (T0 = tháng mua đầu, luôn 100%).',
      funnel: 'Phễu trọn đời (không theo kỳ): số khách đã mua thành công ≥1, ≥2, ≥3 lần trong các POS đã chọn.',
    },
  };
}
export type RepurchaseReport = Awaited<ReturnType<typeof repurchaseReport>>;
