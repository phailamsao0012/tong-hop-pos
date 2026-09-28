import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { groupsOf, itemNames, parseGroupOptions, sortGroups } from '@/lib/product-groups';
import { POS } from '@/lib/report-model';
import { NET } from '@/lib/stats';

// Data đang cầm bắt nguồn từ đâu (yêu cầu 28/09/2026, trang Khách theo nhân viên): với từng khách được phân công cho một
// nhân viên CSKH (hồ sơ khách Pancake, cùng số "Data cầm"), lấy ĐƠN NGUỒN = đơn đầu tiên của SĐT đó trên cả 6 POS
// (không tính hủy / xóa) và xếp theo nhóm sản phẩm của đơn nguồn. Kèm số khách đã mua lại (≥ 2 đơn) và doanh thu trọn đời.
type Cust = { pos_id: string; phone: string | null };
type First = { id: string; phone: string; tags_json: string | null; n: number; net: number };
type Result = { total: number; noPhone: number; noOrder: number; groups: { label: string; customers: number; repeat: number; orders: number; net: number }[] };

const memo = new Map<string, { at: number; value: Result }>();

export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized();
  const p = new URL(request.url).searchParams;
  const assigned = (p.get('assigned') ?? '').trim().slice(0, 100);
  if (!assigned || assigned === 'all' || assigned === '__none') return Response.json({ error: 'Chọn một nhân viên.' }, { status: 400 });
  const valid = new Set<string>(POS.map((x) => x.id));
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !valid.has(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  const posIds = requested.length ? requested : POS.map((x) => x.id);
  const { dim, basis } = parseGroupOptions(p);
  const key = `${assigned}|${posIds.join(',')}|${dim}|${basis}`;
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < 10 * 60000) return Response.json(hit.value);

  const db = env.DB;
  const custs = (await db.prepare(`SELECT pos_id, phone FROM pos_customers WHERE pos_id IN (${posIds.map(() => '?').join(',')}) AND assigned_user_id=?`)
    .bind(...posIds, assigned).all<Cust>()).results;
  const phones = [...new Set(custs.map((c) => (c.phone ?? '').trim()).filter(Boolean))];
  const all = POS.map((x) => x.id);
  const net = NET.replace(/net_total|current_total|total_discount/g, (c) => `o.${c}`);
  const statements: D1PreparedStatement[] = [];
  for (let i = 0; i < phones.length; i += 90) {
    const chunk = phones.slice(i, i + 90);
    // Chỉ trả về đơn đầu tiên của mỗi SĐT (kèm số đơn và doanh thu trọn đời) thay vì toàn bộ lịch sử.
    statements.push(db.prepare(`SELECT id, phone, tags_json, n, net FROM (
        SELECT o.id, o.phone, o.tags_json, ROW_NUMBER() OVER (PARTITION BY o.phone ORDER BY o.created_at) AS rn, COUNT(*) OVER (PARTITION BY o.phone) AS n, SUM(${net}) OVER (PARTITION BY o.phone) AS net
        FROM raw_pos_orders o WHERE o.pos_id IN (${all.map(() => '?').join(',')}) AND o.phone IN (${chunk.map(() => '?').join(',')}) AND o.status_code NOT IN (6,7))
      WHERE rn=1`).bind(...all, ...chunk));
  }
  const first = new Map<string, First>();
  for (let i = 0; i < statements.length; i += 100) {
    for (const res of await db.batch(statements.slice(i, i + 100))) for (const f of res.results as First[]) first.set(f.phone, f);
  }
  const items = await itemNames(db, [...first.values()].map((f) => f.id));
  const agg = new Map<string, { customers: number; repeat: number; orders: number; net: number; seen: Set<string> }>();
  let noPhone = 0, noOrder = 0;
  for (const c of custs) {
    const phone = (c.phone ?? '').trim();
    if (!phone) { noPhone++; continue; }
    const f = first.get(phone);
    if (!f) { noOrder++; continue; }
    for (const g of groupsOf(f.tags_json, items.get(f.id) ?? [], dim, basis)) {
      const a = agg.get(g) ?? { customers: 0, repeat: 0, orders: 0, net: 0, seen: new Set<string>() };
      a.customers++; if (Number(f.n) >= 2) a.repeat++;
      // Một SĐT được phân công ở 2 POS vẫn chỉ cộng đơn / doanh thu một lần.
      if (!a.seen.has(phone)) { a.seen.add(phone); a.orders += Number(f.n); a.net += Number(f.net); }
      agg.set(g, a);
    }
  }
  const order = sortGroups(dim, new Map([...agg.entries()].map(([k, v]) => [k, v.customers])));
  const value: Result = { total: custs.length, noPhone, noOrder, groups: order.slice(0, 30).map((label) => { const { seen: _seen, ...a } = agg.get(label)!; return { label, ...a }; }) };
  memo.set(key, { at: Date.now(), value });
  return Response.json(value);
}
