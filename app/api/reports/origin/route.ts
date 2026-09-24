import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { ORDER_STATUS } from '@/lib/pancake';
import { POS } from '@/lib/report-model';
import { DATE_RE, vnRangeUtc } from '@/lib/report-time';
import { NET } from '@/lib/stats';
import { teamFilter } from '@/lib/team';

// Nguồn đơn của từng nhân viên CSKH: đơn tự ups (cột Marketer trên đơn Pancake trống) và đơn từ MKT (có marketer),
// lọc theo trạng thái hiện tại của đơn (mặc định "Đã xác nhận"), theo ngày tạo hoặc ngày chốt.
// ?sellerId=&origin=self|mkt → trả thêm danh sách đơn cấu thành (tối đa 300) để xem chi tiết.
const STATUS_OPTIONS: Record<string, { label: string; codes: number[] | null }> = {
  confirmed: { label: 'Đã xác nhận', codes: [1] },
  closed: { label: 'Đơn chốt (từ xác nhận trở đi)', codes: [1, 11, 12, 13, 20, 8, 9, 2, 3, 16, 4, 15, 5] },
  processing: { label: 'Chưa xuất kho (XN → chờ chuyển)', codes: [1, 11, 12, 13, 20, 8, 9] },
  waitgoods: { label: 'Chờ hàng', codes: [11] },
  packing: { label: 'Đang đóng hàng', codes: [8] },
  waiting: { label: 'Chờ chuyển hàng', codes: [9] },
  shipping: { label: 'Đã gửi hàng', codes: [2] },
  delivered: { label: 'Đã nhận / đã thu tiền', codes: [3, 16] },
  returned: { label: 'Hoàn', codes: [4, 15, 5] },
  new: { label: 'Mới / chờ xác nhận', codes: [0, 17] },
  cancelled: { label: 'Đã hủy', codes: [6] },
  all: { label: 'Tất cả trạng thái', codes: null },
};

type Row = { seller_id: string | null; marketer_id: string | null; n: number; net: number };

export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized();
  const p = new URL(request.url).searchParams;
  const start = p.get('start') ?? '', end = p.get('end') ?? '';
  if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end) return Response.json({ error: 'Khoảng ngày không hợp lệ.' }, { status: 400 });
  const valid = new Set<string>(POS.map((x) => x.id));
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !valid.has(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  const posIds = requested.length ? requested : POS.map((x) => x.id);
  const statusKey = p.get('status') && p.get('status')! in STATUS_OPTIONS ? p.get('status')! : 'confirmed';
  const codes = STATUS_OPTIONS[statusKey].codes;
  const basis = p.get('basis') === 'confirmed' ? 'first_confirmed_at' : 'created_at';
  const { startUtc, endUtc } = vnRangeUtc(start, end);
  const ph = posIds.map(() => '?').join(',');
  const statusSql = codes ? ` AND status_code IN (${codes.join(',')})` : ' AND status_code<>7';
  // Trang chỉ dành cho CSKH (như Khách theo nhân viên): luôn lọc người bán thuộc đội CSKH.
  const where = `pos_id IN (${ph}) AND ${basis}>=? AND ${basis}<?${statusSql}${teamFilter('seller_id', 'cskh')}`;
  const binds = [...posIds, startUtc, endUtc];
  const mk = `NULLIF(TRIM(marketer_id),'')`;
  const [groups, names] = await env.DB.batch([
    env.DB.prepare(`SELECT seller_id, ${mk} AS marketer_id, COUNT(*) AS n, COALESCE(SUM(${NET}),0) AS net FROM raw_pos_orders WHERE ${where} GROUP BY 1,2`).bind(...binds),
    env.DB.prepare("SELECT user_id, MAX(name) AS name, MAX(department) AS department FROM pos_users WHERE name<>'' GROUP BY user_id"),
  ]);
  const nameMap = new Map((names.results as { user_id: string; name: string; department: string | null }[]).map((r) => [r.user_id, r]));
  const who = (id: string | null) => id ? nameMap.get(id)?.name ?? `NV ${id.slice(0, 8)}` : 'Chưa gán';
  const staff = new Map<string, { sellerId: string; name: string; department: string | null; self: number; selfNet: number; mkt: number; mktNet: number; byMarketer: Map<string, { n: number; net: number }> }>();
  for (const r of groups.results as Row[]) {
    const id = r.seller_id ?? '';
    if (!staff.has(id)) staff.set(id, { sellerId: id, name: who(r.seller_id), department: id ? nameMap.get(id)?.department ?? null : null, self: 0, selfNet: 0, mkt: 0, mktNet: 0, byMarketer: new Map() });
    const s = staff.get(id)!;
    if (r.marketer_id) { s.mkt += Number(r.n); s.mktNet += Number(r.net); const m = s.byMarketer.get(r.marketer_id) ?? { n: 0, net: 0 }; m.n += Number(r.n); m.net += Number(r.net); s.byMarketer.set(r.marketer_id, m); }
    else { s.self += Number(r.n); s.selfNet += Number(r.net); }
  }
  const rows = [...staff.values()].map((s) => ({
    sellerId: s.sellerId, name: s.name, department: s.department, self: s.self, selfNet: s.selfNet, mkt: s.mkt, mktNet: s.mktNet, total: s.self + s.mkt,
    selfShare: s.self + s.mkt ? s.self / (s.self + s.mkt) * 100 : null,
    marketers: [...s.byMarketer.entries()].map(([id, m]) => ({ marketerId: id, marketerName: who(id), orders: m.n, net: m.net })).sort((a, b) => b.orders - a.orders),
  })).sort((a, b) => b.total - a.total);

  // Danh sách đơn của một người / một nguồn.
  let orders = null;
  const sellerId = p.get('sellerId'); const origin = p.get('origin');
  if (sellerId !== null && (origin === 'self' || origin === 'mkt' || origin === 'all')) {
    const originSql = origin === 'self' ? ` AND ${mk} IS NULL` : origin === 'mkt' ? ` AND ${mk} IS NOT NULL` : '';
    const list = await env.DB.prepare(`SELECT id, source_order_id, pos_id, phone, customer_name, created_at, first_confirmed_at, status_code, ${mk} AS marketer_id, ${NET} AS net
      FROM raw_pos_orders WHERE ${where} AND ${sellerId ? 'seller_id=?' : 'seller_id IS NULL'}${originSql} ORDER BY ${basis} DESC LIMIT 300`).bind(...binds, ...(sellerId ? [sellerId] : []))
      .all<{ id: string; source_order_id: string; pos_id: string; phone: string | null; customer_name: string | null; created_at: string; first_confirmed_at: string | null; status_code: number; marketer_id: string | null; net: number }>();
    orders = list.results.map((o) => ({ id: o.id, orderId: o.source_order_id, posId: o.pos_id, posName: POS.find((x) => x.id === o.pos_id)?.name ?? o.pos_id, phone: o.phone, customer: o.customer_name,
      createdAt: o.created_at, confirmedAt: o.first_confirmed_at, statusName: ORDER_STATUS[Number(o.status_code)] ?? String(o.status_code), statusCode: o.status_code, origin: o.marketer_id ? 'mkt' : 'self', marketerName: o.marketer_id ? who(o.marketer_id) : null, net: Number(o.net) }));
  }
  const total = rows.reduce((a, r) => ({ self: a.self + r.self, selfNet: a.selfNet + r.selfNet, mkt: a.mkt + r.mkt, mktNet: a.mktNet + r.mktNet }), { self: 0, selfNet: 0, mkt: 0, mktNet: 0 });
  return Response.json({
    period: { start, end }, status: statusKey, basis: basis === 'created_at' ? 'created' : 'confirmed',
    statuses: Object.fromEntries(Object.entries(STATUS_OPTIONS).map(([k, v]) => [k, v.label])),
    total, staff: rows, orders,
    definitions: {
      origin: 'Tự ups = đơn có cột Marketer trống trên Pancake (CSKH tự lên đơn). Từ MKT = đơn có marketer phụ trách (số do Marketing đưa về).',
      status: 'Trạng thái là trạng thái hiện tại của đơn lúc đồng bộ. Mặc định "Đã xác nhận" để khớp tab Đã xác nhận trên Pancake.',
      basis: 'Theo ngày tạo: đơn tạo trong kỳ (như danh sách đơn Pancake). Theo ngày chốt: đơn xác nhận lần đầu trong kỳ.',
      staff: 'Chỉ nhân viên thuộc đội CSKH, tính theo người bán (nhân viên phụ trách) trên đơn.',
    },
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
