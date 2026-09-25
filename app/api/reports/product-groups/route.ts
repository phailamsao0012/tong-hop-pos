import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { parseStatus, statusSql } from '@/lib/order-status';
import { GROUP_BASES, GROUP_DIMS, MAIN_GROUPS, OTHER, mainGroupSql, parseGroupOptions, productTags, sortGroups } from '@/lib/product-groups';
import { POS } from '@/lib/report-model';
import { DATE_RE, vnRangeUtc } from '@/lib/report-time';
import { CLOSED } from '@/lib/stats';
import { parseTeam, teamFilter } from '@/lib/team';

// Chốt theo nhóm sản phẩm (yêu cầu 25/09/2026): mỗi nhóm có đơn lên, đơn chốt, tỷ lệ chốt = đơn chốt ÷ đơn lên
// (cùng cách tính tỷ lệ chốt của POS), doanh thu, GTTB; và từng nhân viên chốt bao nhiêu đơn mỗi nhóm.
// ?dim=main|tag|product · ?basis=both|tag|product (nhóm chính) · ?team=sale|cskh|all · ?status= (bộ lọc trạng thái chung).
const NET = 'COALESCE(o.net_total,COALESCE(o.current_total,0)-COALESCE(o.total_discount,0))';
type Row = { seller_id: string | null; g: string | null; n: number; net: number };

export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized();
  const p = new URL(request.url).searchParams;
  const start = p.get('start') ?? '', end = p.get('end') ?? '';
  if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end) return Response.json({ error: 'Khoảng ngày không hợp lệ.' }, { status: 400 });
  const valid = new Set<string>(POS.map((x) => x.id));
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !valid.has(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  const posIds = requested.length ? requested : POS.map((x) => x.id);
  const team = parseTeam(p.get('team') ?? 'sale');
  const { dim, basis } = parseGroupOptions(p);
  const status = parseStatus(p.get('status'));
  const { startUtc, endUtc } = vnRangeUtc(start, end);
  const ph = posIds.map(() => '?').join(',');
  const cdate = status.isDefault ? 'o.first_confirmed_at' : 'COALESCE(o.first_confirmed_at,o.created_at)';
  const cwhere = status.isDefault ? `o.${CLOSED}` : statusSql(status, 'o.status_code');
  const scope = `o.pos_id IN (${ph})${teamFilter('o.seller_id', team)}`;
  const closedWhere = `${scope} AND ${cdate}>=? AND ${cdate}<? AND ${cwhere}`;
  const createdWhere = `${scope} AND o.created_at>=? AND o.created_at<? AND o.status_code<>7`;
  const binds = [...posIds, startUtc, endUtc];
  const db = env.DB;

  const statements: D1PreparedStatement[] = [];
  const kinds: { kind: 'closed' | 'created'; label?: string }[] = [];
  const add = (kind: 'closed' | 'created', sql: string, extra: string[] = [], label?: string) => { statements.push(db.prepare(sql).bind(...extra, ...binds)); kinds.push({ kind, label }); };
  for (const [kind, where] of [['closed', closedWhere], ['created', createdWhere]] as const) {
    if (dim === 'main') {
      const flags = MAIN_GROUPS.map((g) => mainGroupSql(g, basis));
      for (const [i, g] of MAIN_GROUPS.entries()) {
        // Điều kiện nhóm đặt trước WHERE phạm vi để thứ tự tham số khớp.
        statements.push(db.prepare(`SELECT o.seller_id, NULL AS g, COUNT(*) AS n, COALESCE(SUM(${NET}),0) AS net FROM raw_pos_orders o WHERE ${flags[i].sql} AND ${where} GROUP BY 1`).bind(...flags[i].binds, ...binds));
        kinds.push({ kind, label: g.label });
      }
      statements.push(db.prepare(`SELECT o.seller_id, NULL AS g, COUNT(*) AS n, COALESCE(SUM(${NET}),0) AS net FROM raw_pos_orders o WHERE NOT (${flags.map((f) => f.sql).join(' OR ')}) AND ${where} GROUP BY 1`).bind(...flags.flatMap((f) => f.binds), ...binds));
      kinds.push({ kind, label: OTHER });
    } else if (dim === 'tag') {
      add(kind, `SELECT o.seller_id, TRIM(json_extract(t.value,'$.name')) AS g, COUNT(DISTINCT o.id) AS n, COALESCE(SUM(${NET}),0) AS net
        FROM raw_pos_orders o, json_each(CASE WHEN json_valid(o.tags_json) THEN o.tags_json ELSE '[]' END) t WHERE ${where} GROUP BY 1,2`);
    } else {
      add(kind, `SELECT seller_id, g, COUNT(*) AS n, COALESCE(SUM(net),0) AS net FROM (
          SELECT DISTINCT o.id, o.seller_id, TRIM(gi.name) AS g, ${NET} AS net FROM raw_pos_orders o JOIN raw_pos_order_items gi ON gi.order_id=o.id AND gi.is_bonus=0 AND gi.quantity>0 WHERE ${where})
        GROUP BY 1,2`);
    }
    // Tổng của từng nhân viên (không chia nhóm) để tính tỷ trọng.
    add(kind, `SELECT o.seller_id, '__all' AS g, COUNT(*) AS n, COALESCE(SUM(${NET}),0) AS net FROM raw_pos_orders o WHERE ${where} GROUP BY 1`);
  }
  const results = await db.batch([...statements, db.prepare("SELECT user_id, MAX(name) AS name, MAX(department) AS department FROM pos_users WHERE name<>'' GROUP BY user_id")]);
  const names = new Map((results.pop()!.results as { user_id: string; name: string; department: string | null }[]).map((r) => [r.user_id, r]));

  type Cell = { closed: number; closedNet: number; created: number };
  const blank = (): Cell => ({ closed: 0, closedNet: 0, created: 0 });
  const groups = new Map<string, Cell>();
  const staff = new Map<string, { total: Cell; byGroup: Map<string, Cell> }>();
  const cell = (sid: string, g: string) => {
    if (!staff.has(sid)) staff.set(sid, { total: blank(), byGroup: new Map() });
    const s = staff.get(sid)!;
    if (g === '__all') return [s.total];
    if (!s.byGroup.has(g)) s.byGroup.set(g, blank());
    if (!groups.has(g)) groups.set(g, blank());
    return [s.byGroup.get(g)!, groups.get(g)!];
  };
  results.forEach((res, i) => {
    const k = kinds[i];
    for (const r of res.results as Row[]) {
      let g = k.label ?? r.g ?? '';
      if (!g) continue;
      if (dim === 'tag' && g !== '__all' && !productTags(JSON.stringify([{ name: g }])).length) continue; // bỏ nhãn vận hành
      if (k.label) g = k.label;
      for (const c of cell(r.seller_id ?? '', g)) {
        if (k.kind === 'closed') { c.closed += Number(r.n); c.closedNet += Number(r.net); } else c.created += Number(r.n);
      }
    }
  });
  const pack = (c: Cell) => ({ ...c, closeRate: c.created ? c.closed / c.created * 100 : null, aov: c.closed ? c.closedNet / c.closed : null });
  const order = sortGroups(dim, new Map([...groups.entries()].map(([l, c]) => [l, c.closed])));
  const total = [...staff.values()].reduce((a, s) => ({ closed: a.closed + s.total.closed, closedNet: a.closedNet + s.total.closedNet, created: a.created + s.total.created }), blank());
  return Response.json({
    period: { start, end }, team, dim, basis, status: status.value, statusLabel: status.label,
    dims: GROUP_DIMS, bases: GROUP_BASES,
    total: pack(total),
    groups: order.slice(0, dim === 'main' ? 10 : 40).map((label) => ({ label, ...pack(groups.get(label)!) })),
    staff: [...staff.entries()].filter(([id]) => id).map(([id, s]) => ({
      sellerId: id, name: names.get(id)?.name ?? `NV ${id.slice(0, 8)}`, department: names.get(id)?.department ?? null, ...pack(s.total),
      byGroup: Object.fromEntries(order.filter((l) => s.byGroup.has(l)).map((l) => [l, pack(s.byGroup.get(l)!)])),
    })).sort((a, b) => b.closedNet - a.closedNet),
    definitions: {
      groups: 'Kháng sinh = BIO NANO SHIELD, GENTADOX, OXY + BỔ HUYẾT; SK + GK = nhãn SK + GK. Nhận diện theo nhãn đơn trên Pancake, theo tên sản phẩm trong đơn, hoặc cả hai. Một đơn có cả hai loại được tính ở cả hai nhóm, nên cộng các nhóm có thể lớn hơn tổng.',
      rate: 'Tỷ lệ chốt của nhóm = đơn chốt ÷ đơn lên của nhóm trong kỳ, cùng cách tính tỷ lệ chốt của POS (đơn chốt theo ngày chốt, đơn lên theo ngày tạo nên có thể vượt 100% khi chốt đơn cũ).',
      closed: status.isDefault ? 'Đơn chốt = đã xác nhận trở đi (như ô Đơn chốt Pancake), theo ngày xác nhận lần đầu.' : `Đơn chốt theo bộ lọc trạng thái: ${status.label}.`,
      revenue: 'Doanh thu của nhóm = toàn bộ tiền các đơn thuộc nhóm (sau giảm trừ).',
    },
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
