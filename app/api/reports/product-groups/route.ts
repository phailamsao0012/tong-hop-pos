import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { parseStatus, statusSql } from '@/lib/order-status';
import { GROUP_BASES, GROUP_DIMS, MAIN_GROUPS, OTHER, groupsOf, itemNames, mainGroupSql, parseGroupOptions, productTags, sortGroups } from '@/lib/product-groups';
import { POS } from '@/lib/report-model';
import { DATE_RE, vnRangeUtc } from '@/lib/report-time';
import { CLOSED } from '@/lib/stats';
import { parseTeam, teamFilter } from '@/lib/team';

// Chốt theo nhóm sản phẩm (yêu cầu 25/09/2026): mỗi nhóm có đơn lên, đơn chốt, tỷ lệ chốt = số chia đã chốt ÷ số chia
// (cùng cách tính tỷ lệ chốt của POS), doanh thu, GTTB; và từng nhân viên chốt bao nhiêu đơn mỗi nhóm.
// ?dim=main|tag|product · ?basis=both|tag|product (nhóm chính) · ?team=sale|cskh|all · ?status= (bộ lọc trạng thái chung).
// ?by=care: tính theo NV chăm sóc trên đơn (trống thì người bán) như các trang CSKH; mặc định theo người bán.
// ?staffId=&group=: kèm danh sách đơn chốt của ô đó (tối đa 500).
const NET = 'COALESCE(o.net_total,COALESCE(o.current_total,0)-COALESCE(o.total_discount,0))';
type Row = { seller_id: string | null; g: string | null; n: number; net: number; c?: number | null };

const NO_TAG = 'Chưa gắn thẻ';
// Nhớ kết quả đã tính xong 3 phút (theo URL), để thẻ Tổng quan và bảng bên dưới cùng gọi một URL không quét đơn hai lần.
// Chỉ nhớ giá trị đã xong, không giữ Promise dùng chung giữa các yêu cầu.
const memo = new Map<string, { at: number; body: string }>();

export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized();
  const hit = memo.get(request.url);
  if (hit && Date.now() - hit.at < 3 * 60000) return new Response(hit.body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' } });
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
  const cdate = status.isDefault ? 'o.first_closed_at' : 'COALESCE(o.first_closed_at,o.created_at)';
  const cwhere = status.isDefault ? `o.${CLOSED}` : statusSql(status, 'o.status_code');
  const by = p.get('by') === 'care' ? 'care' : 'seller';
  const staffCol = by === 'care' ? "COALESCE(NULLIF(o.care_id,''),o.seller_id)" : 'o.seller_id';
  // ?tag=BIO NANO: như bộ lọc "Thẻ đơn hàng" của Pancake — số chia và đơn chốt đều chỉ tính đơn mang thẻ đó (29/09/2026).
  const tag = (p.get('tag') ?? '').trim().slice(0, 120);
  const baseScope = `o.pos_id IN (${ph})${teamFilter(staffCol, team)}`;
  const scope = `${baseScope}${tag ? ' AND instr(o.tags_json, ?)>0' : ''}`;
  const closedWhere = `${scope} AND ${cdate}>=? AND ${cdate}<? AND ${cwhere}`;
  const createdWhere = `${scope} AND o.created_at>=? AND o.created_at<? AND o.status_code<>7`;
  const binds = [...posIds, ...(tag ? [`"name":${JSON.stringify(tag)}`] : []), startUtc, endUtc];
  const db = env.DB;

  const statements: D1PreparedStatement[] = [];
  const kinds: { kind: 'closed' | 'created'; label?: string }[] = [];
  const add = (kind: 'closed' | 'created', sql: string, extra: string[] = [], label?: string) => { statements.push(db.prepare(sql).bind(...extra, ...binds)); kinds.push({ kind, label }); };
  // Theo nhãn đơn (29/09/2026): đọc mỗi đơn một dòng (nhân viên, tags_json, tiền, đã chốt) rồi cộng trong code — 2 lượt quét thay vì
  // json_each + đếm "Chưa gắn thẻ" nhiều lượt (cách cũ làm D1 quá tải). Chưa gắn thẻ = đơn không có nhãn dòng sản phẩm nào.
  const rowSql = (where: string) => `SELECT ${staffCol} AS s, o.tags_json AS t, ${NET} AS net, CASE WHEN o.${CLOSED} THEN 1 ELSE 0 END AS c FROM raw_pos_orders o WHERE ${where}`;
  if (dim === 'tag') {
    statements.push(db.prepare(rowSql(closedWhere)).bind(...binds), db.prepare(rowSql(createdWhere)).bind(...binds));
  } else {
    for (const [kind, where] of [['closed', closedWhere], ['created', createdWhere]] as const) {
      if (dim === 'main') {
        const flags = MAIN_GROUPS.map((g) => mainGroupSql(g, basis));
        for (const [i, g] of MAIN_GROUPS.entries()) {
          // Điều kiện nhóm đặt trước WHERE phạm vi để thứ tự tham số khớp.
          statements.push(db.prepare(`SELECT ${staffCol} AS seller_id, NULL AS g, COUNT(*) AS n, COALESCE(SUM(${NET}),0) AS net, SUM(CASE WHEN o.${CLOSED} THEN 1 ELSE 0 END) AS c FROM raw_pos_orders o WHERE ${flags[i].sql} AND ${where} GROUP BY 1`).bind(...flags[i].binds, ...binds));
          kinds.push({ kind, label: g.label });
        }
        statements.push(db.prepare(`SELECT ${staffCol} AS seller_id, NULL AS g, COUNT(*) AS n, COALESCE(SUM(${NET}),0) AS net, SUM(CASE WHEN o.${CLOSED} THEN 1 ELSE 0 END) AS c FROM raw_pos_orders o WHERE NOT (${flags.map((f) => f.sql).join(' OR ')}) AND ${where} GROUP BY 1`).bind(...flags.flatMap((f) => f.binds), ...binds));
        kinds.push({ kind, label: OTHER });
      } else {
        add(kind, `SELECT seller_id, g, COUNT(*) AS n, COALESCE(SUM(net),0) AS net, SUM(cl) AS c FROM (
            SELECT DISTINCT o.id, ${staffCol} AS seller_id, TRIM(gi.name) AS g, ${NET} AS net, CASE WHEN o.${CLOSED} THEN 1 ELSE 0 END AS cl FROM raw_pos_orders o JOIN raw_pos_order_items gi ON gi.order_id=o.id AND gi.is_bonus=0 AND gi.quantity>0 WHERE ${where})
          GROUP BY 1,2`);
      }
      // Tổng của từng nhân viên (không chia nhóm) để tính tỷ trọng.
      add(kind, `SELECT ${staffCol} AS seller_id, '__all' AS g, COUNT(*) AS n, COALESCE(SUM(${NET}),0) AS net, SUM(CASE WHEN o.${CLOSED} THEN 1 ELSE 0 END) AS c FROM raw_pos_orders o WHERE ${where} GROUP BY 1`);
    }
  }
  // Danh sách thẻ đơn trong kỳ (để chọn), không áp bộ lọc thẻ. Theo nhãn đơn mà không lọc thẻ thì dùng luôn các dòng đơn lên.
  const reuseCreated = dim === 'tag' && !tag;
  if (!reuseCreated) statements.push(db.prepare(`SELECT o.tags_json AS t FROM raw_pos_orders o WHERE ${baseScope} AND o.created_at>=? AND o.created_at<? AND o.status_code<>7`).bind(...posIds, startUtc, endUtc));
  const results = await db.batch([...statements, db.prepare("SELECT user_id, MAX(name) AS name, MAX(department) AS department FROM pos_users WHERE name<>'' GROUP BY user_id")]);
  const namesRes = results.pop()!;
  type OrderRow = { s: string | null; t: string | null; net: number; c: number };
  const tagSource = reuseCreated ? results[1].results as OrderRow[] : results.pop()!.results as { t: string | null }[];
  const tagCount = new Map<string, number>();
  for (const r of tagSource) for (const g of productTags(r.t)) tagCount.set(g, (tagCount.get(g) ?? 0) + 1);
  const tags = [...tagCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 80).map(([t, n]) => ({ tag: t, orders: n }));
  const names = new Map((namesRes.results as { user_id: string; name: string; department: string | null }[]).map((r) => [r.user_id, r]));

  type Cell = { closed: number; closedNet: number; created: number; createdClosed: number };
  const blank = (): Cell => ({ closed: 0, closedNet: 0, created: 0, createdClosed: 0 });
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
  const put = (kind: 'closed' | 'created', sid: string, g: string, n: number, net: number, c: number) => {
    for (const x of cell(sid, g)) {
      if (kind === 'closed') { x.closed += n; x.closedNet += net; } else { x.created += n; x.createdClosed += c; }
    }
  };
  if (dim === 'tag') {
    (['closed', 'created'] as const).forEach((kind, i) => {
      for (const r of results[i].results as OrderRow[]) {
        const sid = r.s ?? '', net = Number(r.net), c = Number(r.c ?? 0);
        put(kind, sid, '__all', 1, net, c);
        const ts = productTags(r.t);
        for (const g of ts.length ? ts : [NO_TAG]) put(kind, sid, g, 1, net, c);
      }
    });
  } else {
    results.forEach((res, i) => {
      const k = kinds[i];
      for (const r of res.results as Row[]) {
        const g = k.label ?? r.g ?? '';
        if (!g) continue;
        put(k.kind, r.seller_id ?? '', g, Number(r.n), Number(r.net), Number(r.c ?? 0));
      }
    });
  }
  // Tỷ lệ chốt: tổng = số chia (đơn lên trong kỳ) đã chốt ÷ số chia, không vượt 100%. Theo nhóm thì chia cho TỔNG số chia của người đó
  // (đơn mới chia thường chưa có sản phẩm / nhãn nên không biết thuộc nhóm nào → chia cho "đơn lên của nhóm" từng ra 100–200%).
  const pack = (c: Cell, denom = c.created) => ({ ...c, closeRate: denom ? Math.min(denom, c.createdClosed) / denom * 100 : null, aov: c.closed ? c.closedNet / c.closed : null });
  const order = sortGroups(dim, new Map([...groups.entries()].map(([l, c]) => [l, c.closed])));
  const total = [...staff.values()].reduce((a, s) => ({ closed: a.closed + s.total.closed, closedNet: a.closedNet + s.total.closedNet, created: a.created + s.total.created, createdClosed: a.createdClosed + s.total.createdClosed }), blank());
  // Danh sách đơn của một ô (nhân viên × nhóm): đơn chốt trong kỳ, nhóm tính lại bằng cùng quy tắc (groupsOf).
  let orders = null;
  const pickStaff = p.get('staffId'), pickGroup = p.get('group');
  if (pickStaff) {
    const list = await db.prepare(`SELECT o.id, o.source_order_id, o.pos_id, o.phone, o.customer_name, o.tags_json, o.status_code, o.created_at, o.first_closed_at AS first_confirmed_at, ${NET} AS net
      FROM raw_pos_orders o WHERE ${staffCol}=? AND ${closedWhere} ORDER BY ${cdate} DESC LIMIT 2000`).bind(pickStaff, ...binds)
      .all<{ id: string; source_order_id: string; pos_id: string; phone: string | null; customer_name: string | null; tags_json: string | null; status_code: number; created_at: string; first_confirmed_at: string | null; net: number }>();
    const items = await itemNames(db, list.results.map((o) => o.id));
    orders = list.results.map((o) => ({ ...o, products: items.get(o.id) ?? [], groups: groupsOf(o.tags_json, items.get(o.id) ?? [], dim, basis), tags: productTags(o.tags_json) }))
      .filter((o) => !pickGroup || o.groups.includes(pickGroup)).slice(0, 500)
      .map(({ tags_json: _t, ...o }) => ({ ...o, posName: POS.find((x) => x.id === o.pos_id)?.name ?? o.pos_id }));
  }
  const body = JSON.stringify({
    orders, by, tag: tag || null, tags,
    period: { start, end }, team, dim, basis, status: status.value, statusLabel: status.label,
    dims: GROUP_DIMS, bases: GROUP_BASES,
    total: pack(total),
    // Theo thẻ đơn: thẻ gắn từ lúc tạo đơn nên số chia của thẻ có nghĩa → tỷ lệ = số chia thẻ đó đã chốt ÷ số chia thẻ đó (như lọc Thẻ đơn hàng trên Pancake).
    groups: order.slice(0, dim === 'main' ? 10 : 40).map((label) => ({ label, ...pack(groups.get(label)!, dim === 'tag' ? undefined : total.created) })),
    staff: [...staff.entries()].filter(([id]) => id).map(([id, s]) => ({
      sellerId: id, name: names.get(id)?.name ?? `NV ${id.slice(0, 8)}`, department: names.get(id)?.department ?? null, ...pack(s.total),
      byGroup: Object.fromEntries(order.filter((l) => s.byGroup.has(l)).map((l) => [l, pack(s.byGroup.get(l)!, dim === 'tag' ? undefined : s.total.created)])),
    })).sort((a, b) => b.closedNet - a.closedNet),
    definitions: {
      groups: 'Kháng sinh = BIO NANO SHIELD, GENTADOX, OXY + BỔ HUYẾT (kể cả thẻ BIO NANO); Combo = BIO NANO CLEAN, GODKILL, SK + GK (mua lẻ hay combo đều tính). Nhận diện theo nhãn đơn trên Pancake, theo tên sản phẩm trong đơn, hoặc cả hai. Một đơn có cả hai loại được tính ở cả hai nhóm, nên cộng các nhóm có thể lớn hơn tổng.',
      rate: 'Số chia = đơn lên (tạo) trong kỳ của nhân viên, như ô Tất cả khi lọc NV xử lý trên Pancake. Tỷ lệ chốt = trong số chia, bao nhiêu đơn đã chốt (không vượt 100%). Tỷ lệ chốt của nhóm = số chia đã chốt thuộc nhóm đó ÷ TỔNG số chia (đơn mới chia chưa có sản phẩm nên không biết thuộc nhóm nào); cộng các nhóm ≈ tỷ lệ chốt chung. Cột Đơn chốt đếm theo ngày chốt nên có cả đơn chia từ trước.',
      closed: status.isDefault ? 'Đơn chốt = từ Chờ xác nhận trở đi, theo ngày chốt (lần đầu vào Chờ xác nhận hoặc sau đó).' : `Đơn chốt theo bộ lọc trạng thái: ${status.label}.`,
      revenue: 'Doanh thu của nhóm = toàn bộ tiền các đơn thuộc nhóm (sau giảm trừ).',
    },
  });
  memo.set(request.url, { at: Date.now(), body });
  if (memo.size > 200) memo.delete(memo.keys().next().value!);
  return new Response(body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' } });
}
