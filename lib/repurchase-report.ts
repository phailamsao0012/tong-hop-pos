// Mua lại & Upsell (dùng chung cho web và bot).
import { env } from 'cloudflare:workers';
import { POS } from '@/lib/report-model';
import { vnRangeUtc } from '@/lib/report-time';

type Row = {
  id: string; pos_id: string; phone: string; seller_id: string | null; created_at: string; net: number; prior: number;
};

export async function repurchaseReport(posIdsIn: string[], start: string, end: string) {
  const posIds = posIdsIn.length ? posIdsIn : POS.map((x) => x.id);
  const { startUtc, endUtc } = vnRangeUtc(start, end);
  const db = env.DB;
  const [rows, names] = await db.batch([
    db.prepare(`
      SELECT o.id, o.pos_id, o.phone, o.seller_id, o.created_at, COALESCE(o.net_total,COALESCE(o.current_total,0)-COALESCE(o.total_discount,0)) AS net,
        (SELECT COUNT(*) FROM raw_pos_orders q WHERE q.pos_id=o.pos_id AND q.phone=o.phone AND q.status_code IN (3,16) AND q.created_at<o.created_at) AS prior
      FROM raw_pos_orders o
      WHERE o.pos_id IN (${posIds.map(() => '?').join(',')}) AND o.created_at>=? AND o.created_at<? AND o.status_code IN (3,16)
        AND o.phone IS NOT NULL AND o.phone<>''
      ORDER BY o.created_at DESC LIMIT 20000`).bind(...posIds, startUtc, endUtc),
    db.prepare("SELECT user_id,name FROM pos_users WHERE name<>''"),
  ]);
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
    },
  };
}
export type RepurchaseReport = Awaited<ReturnType<typeof repurchaseReport>>;
