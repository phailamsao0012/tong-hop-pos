import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { ORDER_STATUS } from '@/lib/pancake';
import { POS } from '@/lib/report-model';
import { DATE_RE, vnRangeUtc } from '@/lib/report-time';
import { NET } from '@/lib/stats';
import { parseStatus, statusSql } from '@/lib/order-status';
import { teamFilter } from '@/lib/team';
import { MAIN_GROUPS, MAIN_LABELS, mainGroupSql, productTags } from '@/lib/product-groups';

// Nguồn đơn của từng nhân viên CSKH: đơn tự ups (cột Marketer trên đơn Pancake trống) và đơn từ MKT (có marketer).
// Nhân viên = NV chăm sóc trên đơn (trống thì người bán) — như bộ lọc "NV chăm sóc" trên Pancake.
// Mặc định đếm MỌI đơn lên (yêu cầu 24/09/2026: "lọc theo lên đơn luôn, hoàn hủy tính sau"), chọn được trạng thái bất kỳ.
// ?sellerId=&origin=self|mkt|all[&group=Kháng sinh|Combo|Khác] → trả thêm danh sách đơn cấu thành (tối đa 300), kèm sản phẩm từng đơn
// và bảng gộp sản phẩm của danh sách đó. Mỗi nhân viên có thêm số đơn theo nhóm sản phẩm chính (nhận diện theo nhãn hoặc tên sản phẩm).
const BASIS = {
  created: { col: 'created_at', label: 'Theo ngày lên đơn' },
  confirmed: { col: 'first_closed_at', label: 'Theo ngày chốt (từ Chờ xác nhận)' },
  care: { col: 'COALESCE(care_assigned_at,created_at)', label: 'Theo ngày gán NV chăm sóc' },
  updated: { col: 'updated_at', label: 'Theo ngày cập nhật đơn' },
} as const;
const BY = {
  care: { col: "COALESCE(NULLIF(care_id,''),seller_id)", label: 'NV chăm sóc (trống thì người bán)' },
  seller: { col: 'seller_id', label: 'Người bán (NV xử lý)' },
} as const;

type Row = { staff_id: string | null; marketer_id: string | null; n: number; net: number };

export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized();
  const p = new URL(request.url).searchParams;
  const start = p.get('start') ?? '', end = p.get('end') ?? '';
  if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end) return Response.json({ error: 'Khoảng ngày không hợp lệ.' }, { status: 400 });
  const valid = new Set<string>(POS.map((x) => x.id));
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !valid.has(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  const posIds = requested.length ? requested : POS.map((x) => x.id);
  const status = parseStatus(p.get('status'), 'created');
  const basisKey = (p.get('basis') ?? '') in BASIS ? p.get('basis') as keyof typeof BASIS : 'created';
  const byKey = (p.get('by') ?? '') in BY ? p.get('by') as keyof typeof BY : 'care';
  const basis = BASIS[basisKey].col, staffCol = BY[byKey].col;
  const { startUtc, endUtc } = vnRangeUtc(start, end);
  const ph = posIds.map(() => '?').join(',');
  // Trang chỉ dành cho CSKH (như Khách theo nhân viên): luôn lọc nhân viên thuộc đội CSKH.
  const where = `pos_id IN (${ph}) AND ${basis}>=? AND ${basis}<? AND ${statusSql(status)}${teamFilter(staffCol, 'cskh')}`;
  const binds = [...posIds, startUtc, endUtc];
  const mk = `NULLIF(TRIM(marketer_id),'')`;
  // Nhóm sản phẩm chính của đơn (cùng quy tắc với Tổng quan CSKH / Sale, nhận diện theo nhãn hoặc sản phẩm).
  const flags = MAIN_GROUPS.map((g) => mainGroupSql(g, 'both'));
  const groupSql = (label: string) => {
    const i = MAIN_GROUPS.findIndex((g) => g.label === label);
    if (i >= 0) return flags[i];
    return { sql: `NOT (${flags.map((f) => f.sql).join(' OR ')})`, binds: flags.flatMap((f) => f.binds) };
  };
  const [groups, names, ...byGroup] = await env.DB.batch([
    env.DB.prepare(`SELECT ${staffCol} AS staff_id, ${mk} AS marketer_id, COUNT(*) AS n, COALESCE(SUM(${NET}),0) AS net FROM raw_pos_orders WHERE ${where} GROUP BY 1,2`).bind(...binds),
    env.DB.prepare("SELECT user_id, MAX(name) AS name, MAX(department) AS department FROM pos_users WHERE name<>'' GROUP BY user_id"),
    ...MAIN_LABELS.map((label) => { const g = groupSql(label); return env.DB.prepare(`SELECT ${staffCol} AS staff_id, COUNT(*) AS n, COALESCE(SUM(${NET}),0) AS net FROM raw_pos_orders o WHERE ${g.sql} AND ${where} GROUP BY 1`).bind(...g.binds, ...binds); }),
  ]);
  const groupOf = new Map<string, Record<string, { n: number; net: number }>>();
  byGroup.forEach((res, i) => { for (const r of res.results as { staff_id: string | null; n: number; net: number }[]) {
    const id = r.staff_id ?? ''; const m = groupOf.get(id) ?? {}; m[MAIN_LABELS[i]] = { n: Number(r.n), net: Number(r.net) }; groupOf.set(id, m);
  } });
  const nameMap = new Map((names.results as { user_id: string; name: string; department: string | null }[]).map((r) => [r.user_id, r]));
  const who = (id: string | null) => id ? nameMap.get(id)?.name ?? `NV ${id.slice(0, 8)}` : 'Chưa gán';
  const staff = new Map<string, { sellerId: string; name: string; department: string | null; self: number; selfNet: number; mkt: number; mktNet: number; byMarketer: Map<string, { n: number; net: number }> }>();
  for (const r of groups.results as Row[]) {
    const id = r.staff_id ?? '';
    if (!staff.has(id)) staff.set(id, { sellerId: id, name: who(r.staff_id), department: id ? nameMap.get(id)?.department ?? null : null, self: 0, selfNet: 0, mkt: 0, mktNet: 0, byMarketer: new Map() });
    const s = staff.get(id)!;
    if (r.marketer_id) { s.mkt += Number(r.n); s.mktNet += Number(r.net); const m = s.byMarketer.get(r.marketer_id) ?? { n: 0, net: 0 }; m.n += Number(r.n); m.net += Number(r.net); s.byMarketer.set(r.marketer_id, m); }
    else { s.self += Number(r.n); s.selfNet += Number(r.net); }
  }
  const rows = [...staff.values()].map((s) => ({
    sellerId: s.sellerId, name: s.name, department: s.department, self: s.self, selfNet: s.selfNet, mkt: s.mkt, mktNet: s.mktNet, total: s.self + s.mkt,
    selfShare: s.self + s.mkt ? s.self / (s.self + s.mkt) * 100 : null,
    groups: groupOf.get(s.sellerId) ?? {},
    marketers: [...s.byMarketer.entries()].map(([id, m]) => ({ marketerId: id, marketerName: who(id), orders: m.n, net: m.net })).sort((a, b) => b.orders - a.orders),
  })).sort((a, b) => b.total - a.total);

  // Danh sách đơn của một người / một nguồn.
  let orders = null;
  let products: { name: string; orders: number; qty: number }[] | null = null;
  const sellerId = p.get('sellerId'); const origin = p.get('origin');
  if (sellerId !== null && (origin === 'self' || origin === 'mkt' || origin === 'all')) {
    const originSql = origin === 'self' ? ` AND ${mk} IS NULL` : origin === 'mkt' ? ` AND ${mk} IS NOT NULL` : '';
    const pickGroup = MAIN_LABELS.includes(p.get('group') ?? '') ? p.get('group')! : null;
    const gf = pickGroup ? groupSql(pickGroup) : { sql: '1=1', binds: [] as string[] };
    const list = await env.DB.prepare(`SELECT id, source_order_id, pos_id, phone, customer_name, created_at, first_closed_at AS first_confirmed_at, care_assigned_at, updated_at, status_code, ${mk} AS marketer_id, seller_id, NULLIF(care_id,'') AS care_id, tags_json, ${NET} AS net
      FROM raw_pos_orders o WHERE ${gf.sql} AND ${where} AND ${sellerId ? `${staffCol}=?` : `${staffCol} IS NULL`}${originSql} ORDER BY ${basis} DESC LIMIT 300`).bind(...gf.binds, ...binds, ...(sellerId ? [sellerId] : []))
      .all<{ id: string; source_order_id: string; pos_id: string; phone: string | null; customer_name: string | null; created_at: string; first_confirmed_at: string | null; care_assigned_at: string | null; updated_at: string | null; status_code: number; marketer_id: string | null; seller_id: string | null; care_id: string | null; tags_json: string | null; net: number }>();
    // Sản phẩm từng đơn (kể cả quà tặng, đánh dấu riêng).
    const lines = new Map<string, { name: string; qty: number; gift: boolean }[]>();
    const ids = list.results.map((o) => o.id);
    for (let i = 0; i < ids.length; i += 90) {
      const chunk = ids.slice(i, i + 90);
      const res = await env.DB.prepare(`SELECT order_id, name, quantity, is_bonus FROM raw_pos_order_items WHERE order_id IN (${chunk.map(() => '?').join(',')}) AND quantity>0`).bind(...chunk).all<{ order_id: string; name: string | null; quantity: number; is_bonus: number }>();
      for (const r of res.results) { const a = lines.get(r.order_id) ?? []; a.push({ name: (r.name ?? '').trim() || 'Sản phẩm', qty: Number(r.quantity), gift: !!r.is_bonus }); lines.set(r.order_id, a); }
    }
    const summary = new Map<string, { name: string; orders: number; qty: number }>();
    for (const [, a] of lines) for (const name of new Set(a.filter((x) => !x.gift).map((x) => x.name))) {
      const row = summary.get(name) ?? { name, orders: 0, qty: 0 }; row.orders += 1; row.qty += a.filter((x) => !x.gift && x.name === name).reduce((t, x) => t + x.qty, 0); summary.set(name, row);
    }
    products = [...summary.values()].sort((a, b) => b.orders - a.orders || b.qty - a.qty);
    orders = list.results.map((o) => ({ id: o.id, orderId: o.source_order_id, posId: o.pos_id, posName: POS.find((x) => x.id === o.pos_id)?.name ?? o.pos_id, phone: o.phone, customer: o.customer_name,
      createdAt: o.created_at, confirmedAt: o.first_confirmed_at, careAssignedAt: o.care_assigned_at, updatedAt: o.updated_at,
      statusName: ORDER_STATUS[Number(o.status_code)] ?? String(o.status_code), statusCode: o.status_code, origin: o.marketer_id ? 'mkt' : 'self', marketerName: o.marketer_id ? who(o.marketer_id) : null,
      sellerName: o.seller_id ? who(o.seller_id) : null, careName: o.care_id ? who(o.care_id) : null, net: Number(o.net),
      items: lines.get(o.id) ?? [], tags: productTags(o.tags_json) }));
  }
  const total = rows.reduce((a, r) => ({ self: a.self + r.self, selfNet: a.selfNet + r.selfNet, mkt: a.mkt + r.mkt, mktNet: a.mktNet + r.mktNet }), { self: 0, selfNet: 0, mkt: 0, mktNet: 0 });
  return Response.json({
    period: { start, end }, status: status.value, statusLabel: status.label, basis: basisKey, by: byKey,
    bases: Object.fromEntries(Object.entries(BASIS).map(([k, v]) => [k, v.label])),
    bys: Object.fromEntries(Object.entries(BY).map(([k, v]) => [k, v.label])),
    total, staff: rows, orders, products, groupLabels: MAIN_LABELS,
    definitions: {
      origin: 'Tự ups = đơn có cột Marketer trống trên Pancake (CSKH tự lên đơn). Từ MKT = đơn có marketer phụ trách (số do Marketing đưa về).',
      status: 'Trạng thái là trạng thái hiện tại của đơn lúc đồng bộ. Mặc định đếm mọi đơn đã lên (kể cả mới, hủy, hoàn; trừ đơn đã xóa); chọn trạng thái để xem riêng.',
      basis: 'Ngày lên đơn: đơn tạo trong kỳ. Ngày chốt: lần đầu vào Chờ xác nhận hoặc sau đó trong kỳ. Ngày gán NV chăm sóc: lúc đơn được giao cho NV chăm sóc (đơn cũ được giao chăm sóc hôm nay cũng tính). Ngày cập nhật: đơn có thay đổi trong kỳ.',
      groups: 'Kháng sinh = BIO NANO SHIELD, GENTADOX, OXY + BỔ HUYẾT (kể cả thẻ BIO NANO); Combo = BIO NANO CLEAN, GODKILL, SK + GK (mua lẻ hay combo đều tính); nhận diện theo nhãn đơn hoặc tên sản phẩm. Đơn có cả hai loại tính ở cả hai cột.',
      staff: 'Chỉ nhân viên thuộc đội CSKH. Mặc định tính theo NV chăm sóc trên đơn (như bộ lọc "NV chăm sóc" trên Pancake); đơn chưa có NV chăm sóc thì tính cho người bán.',
    },
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
