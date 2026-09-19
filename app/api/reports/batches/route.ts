import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { POS } from '@/lib/report-model';
import { DATE_RE, vnRangeUtc } from '@/lib/report-time';
import { parseTeam, teamFilter } from '@/lib/team';
import { SUCCESS } from '@/lib/customer-stats';

// Data được cấp: mỗi đợt = (POS, tháng giao người bán lần đầu, người bán). Số nhận = SĐT khác nhau trong đợt;
// kết quả = đơn mua thành công của các SĐT ấy.

export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized();
  const p = new URL(request.url).searchParams;
  const start = p.get('start') ?? '', end = p.get('end') ?? '';
  if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end) return Response.json({ error: 'Khoảng ngày không hợp lệ.' }, { status: 400 });
  const validPos = new Set<string>(POS.map((x) => x.id));
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !validPos.has(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  const posIds = requested.length ? requested : POS.map((x) => x.id);
  const { startUtc, endUtc } = vnRangeUtc(start, end);
  const team = parseTeam(p.get('team'));
  const db = env.DB;
  const ph = posIds.map(() => '?').join(',');
  // Đợt = (POS, tháng giao người bán lần đầu, người bán) lấy từ customer_stats (mỗi dòng = một SĐT trong một POS).
  // Kết quả theo tháng = đơn thành công của các SĐT ấy tạo từ lúc giao trở đi (đơn nguồn nối customer_stats theo khóa chính).
  // Không nối bảng đơn với chính nó: planner D1 chọn sai chỉ mục và vượt hạn CPU.
  const NET = 'COALESCE(o.net_total,COALESCE(o.current_total,0)-COALESCE(o.total_discount,0))';
  const monthExpr = (col: string) => `substr(date(datetime(${col},'+7 hours')),1,7)`;
  const [summary, byMonth, names] = await db.batch([
    db.prepare(`SELECT pos_id, ${monthExpr('first_assigned_at')} AS month, COALESCE(seller_id,'') AS seller_id,
        COUNT(*) AS received, SUM(success_orders>0) AS buyers, SUM(success_orders>=2) AS repeat_buyers, SUM(success_orders) AS orders, SUM(success_net) AS net
      FROM customer_stats WHERE pos_id IN (${ph}) AND first_assigned_at>=? AND first_assigned_at<?${teamFilter('seller_id', team)}
      GROUP BY 1,2,3`).bind(...posIds, startUtc, endUtc),
    db.prepare(`SELECT c.pos_id, ${monthExpr('c.first_assigned_at')} AS month, COALESCE(c.seller_id,'') AS seller_id, ${monthExpr('o.created_at')} AS m,
        COUNT(*) AS orders, SUM(${NET}) AS net
      FROM raw_pos_orders o JOIN customer_stats c ON c.id = o.pos_id||':'||o.phone
      WHERE o.pos_id IN (${ph}) AND o.${SUCCESS} AND o.created_at>=? AND c.first_assigned_at>=? AND c.first_assigned_at<? AND o.created_at>=c.first_assigned_at${teamFilter('c.seller_id', team)}
      GROUP BY 1,2,3,4`).bind(...posIds, startUtc, startUtc, endUtc),
    db.prepare("SELECT user_id,name FROM pos_users WHERE name<>''"),
  ]);
  type SummaryRow = { pos_id: string; month: string; seller_id: string; received: number; buyers: number; repeat_buyers: number; orders: number; net: number };
  type MonthRow = { pos_id: string; month: string; seller_id: string; m: string; orders: number; net: number };
  const monthsByKey = new Map<string, { month: string; orders: number; net: number }[]>();
  for (const r of byMonth.results as MonthRow[]) {
    const key = `${r.pos_id}|${r.month}|${r.seller_id}`;
    monthsByKey.set(key, [...(monthsByKey.get(key) ?? []), { month: r.m, orders: Number(r.orders), net: Number(r.net) }]);
  }
  const batches = (summary.results as SummaryRow[]).map((r) => ({
    posId: r.pos_id, month: r.month, sellerId: r.seller_id, received: Number(r.received), buyers: Number(r.buyers), repeat: Number(r.repeat_buyers),
    orders: Number(r.orders), net: Number(r.net), months: (monthsByKey.get(`${r.pos_id}|${r.month}|${r.seller_id}`) ?? []).sort((a, b) => a.month.localeCompare(b.month)),
  }));
  const nameMap = new Map((names.results as { user_id: string; name: string }[]).map((r) => [r.user_id, r.name]));
  return Response.json({
    period: { start, end },
    batches: batches.sort((a, b) => b.month.localeCompare(a.month) || b.received - a.received).map((b) => ({
      posId: b.posId, posName: POS.find((x) => x.id === b.posId)?.name ?? b.posId, month: b.month, sellerId: b.sellerId,
      sellerName: b.sellerId ? nameMap.get(b.sellerId) ?? `NV ${b.sellerId.slice(0, 8)}` : 'Chưa gán',
      received: b.received, buyers: b.buyers, repeatBuyers: b.repeat,
      buyRate: b.received ? b.buyers / b.received * 100 : null,
      orders: b.orders, net: b.net, months: b.months,
    })),
    definitions: {
      batch: 'Đợt = các SĐT được giao người bán lần đầu trong một tháng (theo thời điểm giao người bán còn lưu trên đơn Pancake); người bán = người đang phụ trách SĐT đó.',
      outcome: 'Đã mua / mua lại = SĐT có 1 / từ 2 đơn thành công trở lên; cột từng tháng = đơn thành công tạo từ lúc giao trở đi.',
      limit: 'Pancake chỉ giữ người bán hiện tại của đơn; số chuyển người sau này sẽ tính cho người mới. Nhập file đợt cấp nếu cần chính xác hơn.',
    },
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
