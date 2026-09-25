import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { parseStatus, statusSql } from '@/lib/order-status';
import { GROUP_BASES, GROUP_DIMS, groupsOf, itemNames, parseGroupOptions, sortGroups } from '@/lib/product-groups';
import { POS } from '@/lib/report-model';
import { DATE_RE, vnRangeUtc } from '@/lib/report-time';
import { CLOSED } from '@/lib/stats';
import { teamFilter } from '@/lib/team';

// Khách của CSKH bắt nguồn từ đâu (yêu cầu 25/09/2026): với các khách mà mỗi nhân viên CSKH có đơn trong kỳ,
// xem đơn ĐẦU TIÊN của khách đó (cùng SĐT, trên cả 6 POS, không tính đơn hủy / xóa) thuộc nhóm sản phẩm nào.
// ?dim / ?basis: cách chia nhóm (lib/product-groups). ?staffId=&group= → danh sách khách của ô đó.
// Nhân viên = NV chăm sóc trên đơn (trống thì người bán), như trang Tự ups & từ MKT.
type Own = { staff: string | null; pos_id: string; phone: string; customer_name: string | null; n: number };
type Hist = { id: string; pos_id: string; phone: string; created_at: string; tags_json: string | null; customer_name: string | null; source_order_id: string };

export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized();
  const p = new URL(request.url).searchParams;
  const start = p.get('start') ?? '', end = p.get('end') ?? '';
  if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end) return Response.json({ error: 'Khoảng ngày không hợp lệ.' }, { status: 400 });
  const valid = new Set<string>(POS.map((x) => x.id));
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !valid.has(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  const posIds = requested.length ? requested : POS.map((x) => x.id);
  const { dim, basis } = parseGroupOptions(p);
  const status = parseStatus(p.get('status'));
  const { startUtc, endUtc } = vnRangeUtc(start, end);
  const staffCol = "COALESCE(NULLIF(care_id,''),seller_id)";
  const cdate = status.isDefault ? 'first_confirmed_at' : 'COALESCE(first_confirmed_at,created_at)';
  const cwhere = status.isDefault ? CLOSED : statusSql(status);
  const db = env.DB;
  const [own, names] = await db.batch([
    db.prepare(`SELECT ${staffCol} AS staff, pos_id, phone, MAX(customer_name) AS customer_name, COUNT(*) AS n FROM raw_pos_orders
      WHERE pos_id IN (${posIds.map(() => '?').join(',')}) AND ${cdate}>=? AND ${cdate}<? AND ${cwhere} AND phone IS NOT NULL AND phone<>''${teamFilter(staffCol, 'cskh')}
      GROUP BY 1,2,3`).bind(...posIds, startUtc, endUtc),
    db.prepare("SELECT user_id, MAX(name) AS name, MAX(department) AS department FROM pos_users WHERE name<>'' GROUP BY user_id"),
  ]);
  const rows = own.results as Own[];
  // Đơn đầu tiên của từng SĐT trên cả 6 POS (chỉ mục pos_id+phone), 90 SĐT một câu.
  const phones = [...new Set(rows.map((r) => r.phone))];
  const all = POS.map((x) => x.id);
  const statements: D1PreparedStatement[] = [];
  for (let i = 0; i < phones.length; i += 90) {
    const chunk = phones.slice(i, i + 90);
    statements.push(db.prepare(`SELECT id, pos_id, phone, created_at, tags_json, customer_name, source_order_id FROM raw_pos_orders
      WHERE pos_id IN (${all.map(() => '?').join(',')}) AND phone IN (${chunk.map(() => '?').join(',')}) AND status_code NOT IN (6,7)`).bind(...all, ...chunk));
  }
  const first = new Map<string, Hist>();
  for (let i = 0; i < statements.length; i += 100) {
    for (const res of await db.batch(statements.slice(i, i + 100))) {
      for (const h of res.results as Hist[]) { const f = first.get(h.phone); if (!f || h.created_at < f.created_at) first.set(h.phone, h); }
    }
  }
  const items = await itemNames(db, [...first.values()].map((h) => h.id));
  const groupOfPhone = new Map([...first.entries()].map(([phone, h]) => [phone, groupsOf(h.tags_json, items.get(h.id) ?? [], dim, basis)]));

  const nameMap = new Map((names.results as { user_id: string; name: string; department: string | null }[]).map((r) => [r.user_id, r]));
  const staff = new Map<string, { customers: Set<string>; byGroup: Map<string, Set<string>> }>();
  const totals = new Map<string, Set<string>>();
  for (const r of rows) {
    const sid = r.staff ?? '';
    if (!staff.has(sid)) staff.set(sid, { customers: new Set(), byGroup: new Map() });
    const s = staff.get(sid)!;
    s.customers.add(r.phone);
    for (const g of groupOfPhone.get(r.phone) ?? ['Không tìm thấy đơn đầu']) {
      if (!s.byGroup.has(g)) s.byGroup.set(g, new Set());
      s.byGroup.get(g)!.add(r.phone);
      if (!totals.has(g)) totals.set(g, new Set());
      totals.get(g)!.add(r.phone);
    }
  }
  const order = sortGroups(dim, new Map([...totals.entries()].map(([g, set]) => [g, set.size])));
  const allCustomers = new Set(rows.map((r) => r.phone));

  // Danh sách khách của một ô (nhân viên × nhóm).
  let customers = null;
  const pickStaff = p.get('staffId'), pickGroup = p.get('group');
  if (pickStaff !== null) {
    const mine = rows.filter((r) => (r.staff ?? '') === pickStaff);
    const seen = new Set<string>();
    customers = mine.filter((r) => !pickGroup || (groupOfPhone.get(r.phone) ?? ['Không tìm thấy đơn đầu']).includes(pickGroup))
      .filter((r) => (seen.has(r.phone) ? false : (seen.add(r.phone), true))).slice(0, 500).map((r) => {
        const f = first.get(r.phone);
        return { phone: r.phone, name: r.customer_name ?? f?.customer_name ?? null, posId: r.pos_id, posName: POS.find((x) => x.id === r.pos_id)?.name ?? r.pos_id, ordersInPeriod: Number(r.n),
          firstAt: f?.created_at ?? null, firstPosName: f ? POS.find((x) => x.id === f.pos_id)?.name ?? f.pos_id : null, firstOrderId: f?.source_order_id ?? null,
          firstGroups: groupOfPhone.get(r.phone) ?? [], firstProducts: f ? items.get(f.id) ?? [] : [] };
      }).sort((a, b) => String(a.firstAt).localeCompare(String(b.firstAt)));
  }
  return Response.json({
    period: { start, end }, dim, basis, dims: GROUP_DIMS, bases: GROUP_BASES, statusLabel: status.label,
    groups: order.slice(0, dim === 'main' ? 10 : 30).map((g) => ({ label: g, customers: totals.get(g)!.size })),
    totalCustomers: allCustomers.size,
    staff: [...staff.entries()].filter(([id]) => id).map(([id, s]) => ({
      staffId: id, name: nameMap.get(id)?.name ?? `NV ${id.slice(0, 8)}`, department: nameMap.get(id)?.department ?? null, customers: s.customers.size,
      byGroup: Object.fromEntries([...s.byGroup.entries()].map(([g, set]) => [g, set.size])),
    })).sort((a, b) => b.customers - a.customers),
    customers,
    definitions: {
      scope: 'Khách = số điện thoại có đơn của nhân viên CSKH trong kỳ (theo bộ lọc trạng thái chung; nhân viên = NV chăm sóc trên đơn, trống thì người bán).',
      first: 'Bắt nguồn = đơn đầu tiên của số điện thoại đó trên cả 6 POS (tính từ khi có dữ liệu, không tính đơn hủy / xóa). Một đơn đầu có nhiều nhóm thì khách nằm ở mỗi nhóm đó.',
      groups: 'Kháng sinh = BIO NANO SHIELD, GENTADOX, OXY + BỔ HUYẾT; SK + GK = nhãn SK + GK. Chọn nhận diện theo nhãn đơn, tên sản phẩm hoặc cả hai; hoặc xem theo từng nhãn / từng sản phẩm.',
    },
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
