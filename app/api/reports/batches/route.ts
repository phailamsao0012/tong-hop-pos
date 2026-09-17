import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { POS } from '@/lib/report-model';
import { DATE_RE, vnRangeUtc } from '@/lib/report-time';

// Data được cấp: mỗi đợt = (POS, tháng giao người bán, người bán). Số nhận = SĐT khác nhau được giao
// trong tháng đó; kết quả = đơn mua thành công của các SĐT ấy tạo từ lúc được giao trở đi.
type Batch = { pos_id: string; month: string; seller_id: string; phone: string; assigned_at: string };
type Outcome = { pos_id: string; phone: string; created_at: string; net: number };

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
  const db = env.DB;
  const ph = posIds.map(() => '?').join(',');
  const [assigned, names] = await db.batch([
    db.prepare(`
      SELECT pos_id, substr(date(datetime(seller_assigned_at,'+7 hours')),1,7) AS month, COALESCE(seller_id,'') AS seller_id, phone, MIN(seller_assigned_at) AS assigned_at
      FROM raw_pos_orders WHERE pos_id IN (${ph}) AND seller_assigned_at>=? AND seller_assigned_at<? AND seller_id IS NOT NULL
        AND phone IS NOT NULL AND phone<>'' AND status_code<>7
      GROUP BY 1,2,3,4 LIMIT 50000`).bind(...posIds, startUtc, endUtc),
    db.prepare("SELECT user_id,name FROM pos_users WHERE name<>''"),
  ]);
  const rows = assigned.results as Batch[];
  // Kết quả mua thành công của các SĐT trong các đợt (từ lúc giao trở đi), lấy theo lô SĐT.
  const phonesByPos = new Map<string, Set<string>>();
  for (const r of rows) { if (!phonesByPos.has(r.pos_id)) phonesByPos.set(r.pos_id, new Set()); phonesByPos.get(r.pos_id)!.add(r.phone); }
  const outcomes: Outcome[] = [];
  for (const [posId, phones] of phonesByPos) {
    const list = [...phones];
    for (let i = 0; i < list.length; i += 80) {
      const chunk = list.slice(i, i + 80);
      const r = await db.prepare(`SELECT pos_id, phone, created_at, COALESCE(net_total,COALESCE(current_total,0)-COALESCE(total_discount,0)) AS net
        FROM raw_pos_orders WHERE pos_id=? AND phone IN (${chunk.map(() => '?').join(',')}) AND status_code IN (3,16) AND created_at>=?`)
        .bind(posId, ...chunk, startUtc).all<Outcome>();
      outcomes.push(...r.results);
    }
  }
  const byPhone = new Map<string, Outcome[]>();
  for (const o of outcomes) { const k = `${o.pos_id}:${o.phone}`; byPhone.set(k, [...(byPhone.get(k) ?? []), o]); }
  type Agg = { posId: string; month: string; sellerId: string; phones: Set<string>; buyers: Set<string>; repeat: Set<string>; orders: number; net: number; months: Map<string, { orders: number; net: number }> };
  const batches = new Map<string, Agg>();
  for (const r of rows) {
    const key = `${r.pos_id}|${r.month}|${r.seller_id}`;
    if (!batches.has(key)) batches.set(key, { posId: r.pos_id, month: r.month, sellerId: r.seller_id, phones: new Set(), buyers: new Set(), repeat: new Set(), orders: 0, net: 0, months: new Map() });
    const b = batches.get(key)!;
    b.phones.add(r.phone);
    const bought = (byPhone.get(`${r.pos_id}:${r.phone}`) ?? []).filter((o) => o.created_at >= r.assigned_at);
    if (bought.length) b.buyers.add(r.phone);
    if (bought.length >= 2) b.repeat.add(r.phone);
    for (const o of bought) {
      b.orders++; b.net += Number(o.net);
      const m = new Date(Date.parse(`${o.created_at}Z`) + 7 * 3600000).toISOString().slice(0, 7);
      const mm = b.months.get(m) ?? { orders: 0, net: 0 };
      mm.orders++; mm.net += Number(o.net); b.months.set(m, mm);
    }
  }
  const nameMap = new Map((names.results as { user_id: string; name: string }[]).map((r) => [r.user_id, r.name]));
  return Response.json({
    period: { start, end },
    batches: [...batches.values()].sort((a, b) => b.month.localeCompare(a.month) || b.phones.size - a.phones.size).map((b) => ({
      posId: b.posId, posName: POS.find((x) => x.id === b.posId)?.name ?? b.posId, month: b.month, sellerId: b.sellerId,
      sellerName: b.sellerId ? nameMap.get(b.sellerId) ?? `NV ${b.sellerId.slice(0, 8)}` : 'Chưa gán',
      received: b.phones.size, buyers: b.buyers.size, repeatBuyers: b.repeat.size,
      buyRate: b.phones.size ? b.buyers.size / b.phones.size * 100 : null,
      orders: b.orders, net: b.net,
      months: [...b.months.entries()].sort(([a], [c]) => a.localeCompare(c)).map(([month, v]) => ({ month, ...v })),
    })),
    definitions: {
      batch: 'Đợt = các SĐT được giao cho một người bán trong một tháng (theo thời điểm giao người bán còn lưu trên đơn Pancake).',
      outcome: 'Kết quả = đơn mua thành công của các SĐT đó tạo từ lúc được giao trở đi; "mua lại" = từ 2 đơn thành công trở lên sau khi giao.',
      limit: 'Pancake chỉ giữ người bán hiện tại của đơn; số chuyển người sau này sẽ tính cho người mới. Nhập file đợt cấp nếu cần chính xác hơn.',
    },
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
