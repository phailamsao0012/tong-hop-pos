import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { maskPhone } from '@/lib/bot-guard-core';
import { parseStatus, statusSql } from '@/lib/order-status';
import {
  GROUP_BASES,
  GROUP_DIMS,
  MAIN_GROUPS,
  OTHER,
  groupsOf,
  itemNames,
  mainGroupSql,
  parseGroupOptions,
  productTags,
  sortGroups,
} from '@/lib/product-groups';
import { POS } from '@/lib/report-model';
import { reportMemoKey } from '@/lib/report-memo';
import { DATE_RE, vnRangeUtc } from '@/lib/report-time';
import { CLOSED } from '@/lib/stats';
import { parseTeam, teamFilter, usingHrTeams } from '@/lib/team';
import { resolveHrUnit } from '@/lib/hr-unit';
import { PACKED_SQL, WH_CONFIRMED_SQL } from '@/lib/van-don';

// Chốt theo nhóm sản phẩm (yêu cầu 25/09/2026): mỗi nhóm có đơn lên, đơn chốt, tỷ lệ chốt = số chia đã chốt ÷ số chia
// (cùng cách tính tỷ lệ chốt của POS), doanh thu, GTTB; và từng nhân viên chốt bao nhiêu đơn mỗi nhóm.
// ?dim=main|tag|product · ?basis=both|tag|product (nhóm chính) · ?team=sale|cskh|all · ?status= (bộ lọc trạng thái chung).
// ?by=care: tính theo NV chăm sóc trên đơn (trống thì người bán) như các trang CSKH; mặc định theo người bán.
// ?staffId=&group=: kèm danh sách đơn chốt của ô đó (tối đa 500).
const NET =
  'COALESCE(o.net_total,COALESCE(o.current_total,0)-COALESCE(o.total_discount,0))';
type Row = {
  seller_id: string | null;
  g: string | null;
  n: number;
  net: number;
  c?: number | null;
  wh?: number;
  self?: number;
  unk?: number;
  st?: number;
  pending?: number;
  packed?: number;
  confirmedNotPacked?: number;
  cancelledBeforePack?: number;
};

// Nhớ kết quả đã tính xong 3 phút (theo URL), để thẻ Tổng quan và bảng bên dưới cùng gọi một URL không quét đơn hai lần.
// Chỉ nhớ giá trị đã xong, không giữ Promise dùng chung giữa các yêu cầu.
const memo = new Map<string, { at: number; body: string }>();

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const memoKey = reportMemoKey(
    user.role,
    usingHrTeams() ? 'hr' : 'pc',
    request.url,
  );
  // Danh sách đơn của một ô: nhân viên chỉ thấy 3 số cuối SĐT khách (QA 11/10/2026).
  const phoneOut = (v: string | null) =>
    v && user.role !== 'owner' && user.role !== 'director' ? maskPhone(v) : v;
  const hit = memo.get(memoKey);
  if (hit && Date.now() - hit.at < 3 * 60000)
    return new Response(hit.body, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, no-store',
      },
    });
  const p = new URL(request.url).searchParams;
  const start = p.get('start') ?? '',
    end = p.get('end') ?? '';
  if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end)
    return Response.json(
      { error: 'Khoảng ngày không hợp lệ.' },
      { status: 400 },
    );
  const valid = new Set<string>(POS.map((x) => x.id));
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !valid.has(id)))
    return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  const posIds = requested.length ? requested : POS.map((x) => x.id);
  const unitScope = await resolveHrUnit(p, parseTeam(p.get('team') ?? 'sale'));
  if (unitScope instanceof Response) return unitScope;
  const { team, unit } = unitScope;
  const { dim, basis } = parseGroupOptions(p);
  const status = parseStatus(p.get('status'));
  const { startUtc, endUtc } = vnRangeUtc(start, end);
  const ph = posIds.map(() => '?').join(',');
  const cdate = status.isDefault
    ? 'o.first_closed_at'
    : 'COALESCE(o.first_closed_at,o.created_at)';
  const cwhere = status.isDefault
    ? `o.${CLOSED}`
    : statusSql(status, 'o.status_code');
  const by = p.get('by') === 'care' ? 'care' : 'seller';
  const staffCol =
    by === 'care'
      ? "COALESCE(NULLIF(o.care_id,''),o.seller_id)"
      : 'o.seller_id';
  // ?tag=BIO NANO: như bộ lọc "Thẻ đơn hàng" của Pancake — số chia và đơn chốt đều chỉ tính đơn mang thẻ đó (29/09/2026).
  const tag = (p.get('tag') ?? '').trim().slice(0, 120);
  const baseScope = `o.pos_id IN (${ph})${teamFilter(staffCol, team, true, unit)}`;
  const scope = `${baseScope}${tag ? ' AND instr(o.tags_json, ?)>0' : ''}`;
  const closedWhere = `${scope} AND ${cdate}>=? AND ${cdate}<? AND ${cwhere}`;
  const createdWhere = `${scope} AND o.created_at>=? AND o.created_at<? AND o.status_code<>7`;
  const binds = [
    ...posIds,
    ...(tag ? [`"name":${JSON.stringify(tag)}`] : []),
    startUtc,
    endUtc,
  ];
  const db = env.DB;
  // Kho phải là người khác với người được tính Đơn chốt trên trang này.
  const warehouseConfirmed = `${WH_CONFIRMED_SQL()} AND NULLIF(o.first_confirmed_by,'') IS NOT NULL AND o.first_confirmed_by<>${staffCol}`;
  const whColumns = {
    packed: PACKED_SQL(),
    confirmedNotPacked: 'o.status_code IN (1,11,12,13,20)',
    cancelledBeforePack: `o.status_code=6 AND NOT ${PACKED_SQL()}`,
    wh: warehouseConfirmed,
    self: `${WH_CONFIRMED_SQL()} AND NULLIF(o.first_confirmed_by,'')=${staffCol}`,
    unk: `${WH_CONFIRMED_SQL()} AND NULLIF(o.first_confirmed_by,'') IS NULL`,
    st: 'o.status_code=17',
    pending: `o.status_code=17 AND NOT ${WH_CONFIRMED_SQL()}`,
  };
  const whSelect = (aggregate = false) =>
    Object.entries(whColumns)
      .map(([alias, condition]) => {
        const value = `CASE WHEN ${condition} THEN 1 ELSE 0 END`;
        return `${aggregate ? `SUM(${value})` : value} AS ${alias}`;
      })
      .join(', ');

  const statements: D1PreparedStatement[] = [];
  const kinds: { kind: 'closed' | 'created'; label?: string }[] = [];
  const add = (
    kind: 'closed' | 'created',
    sql: string,
    extra: string[] = [],
    label?: string,
  ) => {
    statements.push(db.prepare(sql).bind(...extra, ...binds));
    kinds.push({ kind, label });
  };
  // Theo nhãn đơn (29/09/2026): đọc mỗi đơn một dòng (nhân viên, tags_json, tiền, đã chốt) rồi cộng trong code — 2 lượt quét thay vì
  // json_each + đếm đơn không có nhãn nhiều lượt (cách cũ làm D1 quá tải). Đơn không có nhãn chỉ cộng vào tổng.
  const rowSql = (where: string, closed = false) =>
    `SELECT ${staffCol} AS s, o.tags_json AS t, ${NET} AS net, CASE WHEN o.${CLOSED} THEN 1 ELSE 0 END AS c${closed ? `, ${whSelect()}` : ''} FROM raw_pos_orders o WHERE ${where}`;
  if (dim === 'tag') {
    statements.push(
      db.prepare(rowSql(closedWhere, true)).bind(...binds),
      db.prepare(rowSql(createdWhere)).bind(...binds),
    );
  } else {
    for (const [kind, where] of [
      ['closed', closedWhere],
      ['created', createdWhere],
    ] as const) {
      if (dim === 'main') {
        const flags = MAIN_GROUPS.map((g) => mainGroupSql(g, basis));
        for (const [i, g] of MAIN_GROUPS.entries()) {
          // Điều kiện nhóm đặt trước WHERE phạm vi để thứ tự tham số khớp.
          statements.push(
            db
              .prepare(
                `SELECT ${staffCol} AS seller_id, NULL AS g, COUNT(*) AS n, COALESCE(SUM(${NET}),0) AS net, SUM(CASE WHEN o.${CLOSED} THEN 1 ELSE 0 END) AS c FROM raw_pos_orders o WHERE ${flags[i].sql} AND ${where} GROUP BY 1`,
              )
              .bind(...flags[i].binds, ...binds),
          );
          kinds.push({ kind, label: g.label });
        }
        statements.push(
          db
            .prepare(
              `SELECT ${staffCol} AS seller_id, NULL AS g, COUNT(*) AS n, COALESCE(SUM(${NET}),0) AS net, SUM(CASE WHEN o.${CLOSED} THEN 1 ELSE 0 END) AS c FROM raw_pos_orders o WHERE NOT (${flags.map((f) => f.sql).join(' OR ')}) AND ${where} GROUP BY 1`,
            )
            .bind(...flags.flatMap((f) => f.binds), ...binds),
        );
        kinds.push({ kind, label: OTHER });
      } else {
        add(
          kind,
          `SELECT seller_id, g, COUNT(*) AS n, COALESCE(SUM(net),0) AS net, SUM(cl) AS c FROM (
            SELECT DISTINCT o.id, ${staffCol} AS seller_id, TRIM(gi.name) AS g, ${NET} AS net, CASE WHEN o.${CLOSED} THEN 1 ELSE 0 END AS cl FROM raw_pos_orders o JOIN raw_pos_order_items gi ON gi.order_id=o.id AND gi.is_bonus=0 AND gi.quantity>0 WHERE ${where})
          GROUP BY 1,2`,
        );
      }
      // Tổng của từng nhân viên (không chia nhóm) để tính tỷ trọng.
      add(
        kind,
        `SELECT ${staffCol} AS seller_id, '__all' AS g, COUNT(*) AS n, COALESCE(SUM(${NET}),0) AS net, SUM(CASE WHEN o.${CLOSED} THEN 1 ELSE 0 END) AS c${kind === 'closed' ? `, ${whSelect(true)}` : ''} FROM raw_pos_orders o WHERE ${where} GROUP BY 1`,
      );
    }
  }
  // Danh sách thẻ đơn trong kỳ (để chọn), không áp bộ lọc thẻ. Theo nhãn đơn mà không lọc thẻ thì dùng luôn các dòng đơn lên.
  const reuseCreated = dim === 'tag' && !tag;
  if (!reuseCreated)
    statements.push(
      db
        .prepare(
          `SELECT o.tags_json AS t FROM raw_pos_orders o WHERE ${baseScope} AND o.created_at>=? AND o.created_at<? AND o.status_code<>7`,
        )
        .bind(...posIds, startUtc, endUtc),
    );
  const results = await db.batch([
    ...statements,
    db.prepare(
      "SELECT user_id, MAX(name) AS name, MAX(department) AS department FROM pos_users WHERE name<>'' GROUP BY user_id",
    ),
  ]);
  const namesRes = results.pop()!;
  type OrderRow = {
    s: string | null;
    t: string | null;
    net: number;
    c: number;
    wh?: number;
    self?: number;
    unk?: number;
    st?: number;
    pending?: number;
    packed?: number;
    confirmedNotPacked?: number;
    cancelledBeforePack?: number;
  };
  const tagSource = reuseCreated
    ? (results[1].results as OrderRow[])
    : (results.pop()!.results as { t: string | null }[]);
  const tagCount = new Map<string, number>();
  for (const r of tagSource)
    for (const g of productTags(r.t))
      tagCount.set(g, (tagCount.get(g) ?? 0) + 1);
  const tags = [...tagCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 80)
    .map(([t, n]) => ({ tag: t, orders: n }));
  const names = new Map(
    (
      namesRes.results as {
        user_id: string;
        name: string;
        department: string | null;
      }[]
    ).map((r) => [r.user_id, r]),
  );

  type Cell = {
    closed: number;
    closedNet: number;
    created: number;
    createdClosed: number;
    packed: number;
    confirmedNotPacked: number;
    cancelledBeforePack: number;
    whConfirmed: number;
    selfConfirmed: number;
    unknownConfirmer: number;
    waiting: number;
    waitingUnconfirmed: number;
  };
  const blank = (): Cell => ({
    closed: 0,
    closedNet: 0,
    created: 0,
    createdClosed: 0,
    packed: 0,
    confirmedNotPacked: 0,
    cancelledBeforePack: 0,
    whConfirmed: 0,
    selfConfirmed: 0,
    unknownConfirmer: 0,
    waiting: 0,
    waitingUnconfirmed: 0,
  });
  const groups = new Map<string, Cell>();
  const untagged = { closed: 0, created: 0 };
  const staff = new Map<
    string,
    {
      total: Cell;
      byGroup: Map<string, Cell>;
      untagged: { closed: number; created: number };
    }
  >();
  const cell = (sid: string, g: string) => {
    if (!staff.has(sid))
      staff.set(sid, {
        total: blank(),
        byGroup: new Map(),
        untagged: { closed: 0, created: 0 },
      });
    const s = staff.get(sid)!;
    if (g === '__all') return [s.total];
    if (!s.byGroup.has(g)) s.byGroup.set(g, blank());
    if (!groups.has(g)) groups.set(g, blank());
    return [s.byGroup.get(g)!, groups.get(g)!];
  };
  const put = (
    kind: 'closed' | 'created',
    sid: string,
    g: string,
    n: number,
    net: number,
    c: number,
    confirmations?: Pick<Row, 'wh' | 'self' | 'unk' | 'st' | 'pending' | 'packed' | 'confirmedNotPacked' | 'cancelledBeforePack'>,
  ) => {
    for (const x of cell(sid, g)) {
      if (kind === 'closed') {
        x.closed += n;
        x.closedNet += net;
        // Chỉ tổng từng người: một đơn nhiều thẻ vẫn chỉ cộng XN một lần.
        if (g === '__all') {
          x.packed += Number(confirmations?.packed ?? 0);
          x.confirmedNotPacked += Number(confirmations?.confirmedNotPacked ?? 0);
          x.cancelledBeforePack += Number(confirmations?.cancelledBeforePack ?? 0);
          x.whConfirmed += Number(confirmations?.wh ?? 0);
          x.selfConfirmed += Number(confirmations?.self ?? 0);
          x.unknownConfirmer += Number(confirmations?.unk ?? 0);
          x.waiting += Number(confirmations?.st ?? 0);
          x.waitingUnconfirmed += Number(confirmations?.pending ?? 0);
        }
      } else {
        x.created += n;
        x.createdClosed += c;
      }
    }
  };
  if (dim === 'tag') {
    (['closed', 'created'] as const).forEach((kind, i) => {
      for (const r of results[i].results as OrderRow[]) {
        const sid = r.s ?? '',
          net = Number(r.net),
          c = Number(r.c ?? 0);
        put(kind, sid, '__all', 1, net, c, r);
        const ts = productTags(r.t);
        if (!ts.length) {
          untagged[kind] += 1;
          staff.get(sid)!.untagged[kind] += 1;
        }
        for (const g of ts) put(kind, sid, g, 1, net, c);
      }
    });
  } else {
    results.forEach((res, i) => {
      const k = kinds[i];
      for (const r of res.results as Row[]) {
        const g = k.label ?? r.g ?? '';
        if (!g) continue;
        put(
          k.kind,
          r.seller_id ?? '',
          g,
          Number(r.n),
          Number(r.net),
          Number(r.c ?? 0),
          r,
        );
      }
    });
  }
  // Tỷ lệ chốt: tổng = số chia (đơn lên trong kỳ) đã chốt ÷ số chia, không vượt 100%. Theo nhóm thì chia cho TỔNG số chia của người đó
  // (đơn mới chia thường chưa có sản phẩm / nhãn nên không biết thuộc nhóm nào → chia cho "đơn lên của nhóm" từng ra 100–200%).
  const pack = (c: Cell, denom = c.created) => ({
    ...c,
    packedRate: c.closed ? (c.packed / c.closed) * 100 : null,
    whRate: c.closed ? (c.whConfirmed / c.closed) * 100 : null,
    closeRate: denom ? (Math.min(denom, c.createdClosed) / denom) * 100 : null,
    aov: c.closed ? c.closedNet / c.closed : null,
  });
  const order = sortGroups(
    dim,
    new Map([...groups.entries()].map(([l, c]) => [l, c.closed])),
  );
  const total = [...staff.values()].reduce(
    (a, s) => ({
      closed: a.closed + s.total.closed,
      closedNet: a.closedNet + s.total.closedNet,
      created: a.created + s.total.created,
      createdClosed: a.createdClosed + s.total.createdClosed,
      packed: a.packed + s.total.packed,
      confirmedNotPacked: a.confirmedNotPacked + s.total.confirmedNotPacked,
      cancelledBeforePack: a.cancelledBeforePack + s.total.cancelledBeforePack,
      whConfirmed: a.whConfirmed + s.total.whConfirmed,
      selfConfirmed: a.selfConfirmed + s.total.selfConfirmed,
      unknownConfirmer: a.unknownConfirmer + s.total.unknownConfirmer,
      waiting: a.waiting + s.total.waiting,
      waitingUnconfirmed: a.waitingUnconfirmed + s.total.waitingUnconfirmed,
    }),
    blank(),
  );
  // Danh sách đơn của một ô (nhân viên × nhóm): đơn chốt trong kỳ, nhóm tính lại bằng cùng quy tắc (groupsOf).
  let orders = null;
  const pickStaff = p.get('staffId'),
    pickGroup = p.get('group');
  if (pickStaff) {
    const list = await db
      .prepare(`SELECT o.id, o.source_order_id, o.pos_id, o.phone, o.customer_name, o.tags_json, o.status_code, o.created_at, o.first_closed_at AS first_confirmed_at, o.first_confirmed_at AS confirmed_at, confirmer.name AS confirm_by_name, ${NET} AS net
      FROM raw_pos_orders o LEFT JOIN (SELECT user_id, MAX(name) AS name FROM pos_users GROUP BY user_id) confirmer ON confirmer.user_id=o.first_confirmed_by
      WHERE ${staffCol}=? AND ${closedWhere}${p.get('wh') === '1' ? ` AND ${warehouseConfirmed}` : ''}${p.get('packed') === '1' ? ` AND ${PACKED_SQL()}` : ''} ORDER BY ${cdate} DESC LIMIT 2000`)
      .bind(pickStaff, ...binds)
      .all<{
        id: string;
        source_order_id: string;
        pos_id: string;
        phone: string | null;
        customer_name: string | null;
        tags_json: string | null;
        status_code: number;
        created_at: string;
        first_confirmed_at: string | null;
        confirmed_at: string | null;
        confirm_by_name: string | null;
        net: number;
      }>();
    const items = await itemNames(
      db,
      list.results.map((o) => o.id),
    );
    orders = list.results
      .map((o) => ({
        ...o,
        products: items.get(o.id) ?? [],
        groups: groupsOf(o.tags_json, items.get(o.id) ?? [], dim, basis),
        tags: productTags(o.tags_json),
      }))
      .filter((o) => !pickGroup || o.groups.includes(pickGroup))
      .slice(0, 500)
      .map(({ tags_json: _t, ...o }) => ({
        ...o,
        phone: phoneOut(o.phone),
        posName: POS.find((x) => x.id === o.pos_id)?.name ?? o.pos_id,
      }));
  }
  // Chỉ thêm trường cho app; giữ nguyên pack và các số cũ sau X1.
  const splitStaff = (c: Cell) => ({
    warehouseConfirmed: c.whConfirmed,
    backToWaiting: c.waiting - c.waitingUnconfirmed,
    otherUnconfirmed: Math.max(
      0,
      c.closed - c.whConfirmed - c.selfConfirmed - c.unknownConfirmer -
        c.waitingUnconfirmed,
    ),
    closedFromCreated: Math.min(c.closed, c.createdClosed),
    closedFromEarlier: Math.max(0, c.closed - c.createdClosed),
    createdOpen: Math.max(0, c.created - c.createdClosed),
  });
  const staffRows = [...staff.entries()]
    .filter(([id]) => id)
    .map(([id, s]) => ({
      sellerId: id,
      name: names.get(id)?.name ?? `NV ${id.slice(0, 8)}`,
      department: names.get(id)?.department ?? null,
      ...pack(s.total),
      ...splitStaff(s.total),
      ...(dim === 'tag' ? { untagged: s.untagged } : {}),
      byGroup: Object.fromEntries(
        order
          .filter((l) => s.byGroup.has(l))
          .map((l) => [
            l,
            pack(
              s.byGroup.get(l)!,
              dim === 'tag' ? undefined : s.total.created,
            ),
          ]),
      ),
    }))
    .sort((a, b) => b.closedNet - a.closedNet);
  // Dòng Tổng trên web chỉ cộng người có mã. Cộng các trường tách của từng người
  // trước khi pack để các phép min/max không làm thay đổi tổng các dòng.
  const staffSum = staffRows.reduce((sum, row) => {
    for (const key of Object.keys(sum) as (keyof typeof sum)[])
      sum[key] += row[key];
    return sum;
  }, { ...blank(), ...splitStaff(blank()) });
  const body = JSON.stringify({
    orders,
    by,
    tag: tag || null,
    tags,
    period: { start, end },
    team,
    dim,
    basis,
    status: status.value,
    statusLabel: status.label,
    dims: GROUP_DIMS,
    bases: GROUP_BASES,
    total: pack(total),
    ...(dim === 'tag' ? { untagged } : {}),
    // Theo thẻ đơn: thẻ gắn từ lúc tạo đơn nên số chia của thẻ có nghĩa → tỷ lệ = số chia thẻ đó đã chốt ÷ số chia thẻ đó (như lọc Thẻ đơn hàng trên Pancake).
    groups: order.slice(0, dim === 'main' ? 10 : 40).map((label) => ({
      label,
      ...pack(groups.get(label)!, dim === 'tag' ? undefined : total.created),
    })),
    staff: staffRows,
    staffTotal: { ...pack(staffSum), people: staffRows.length },
    definitions: {
      groups:
        (dim === 'tag'
          ? 'Theo nhãn đơn: đơn không gắn thẻ vẫn tính vào tổng nhưng không hiện ở thẻ nào, nên cộng các thẻ có thể nhỏ hơn tổng. '
          : '') +
        'Kháng sinh = BIO NANO SHIELD, GENTADOX, OXY + BỔ HUYẾT (kể cả thẻ BIO NANO); Combo = BIO NANO CLEAN, GODKILL, SK + GK (mua lẻ hay combo đều tính). Nhận diện theo nhãn đơn trên Pancake, theo tên sản phẩm trong đơn, hoặc cả hai. Một đơn có cả hai loại được tính ở cả hai nhóm, nên cộng các nhóm có thể lớn hơn tổng.',
      rate: 'Số chia = đơn lên (tạo) trong kỳ của nhân viên, như ô Tất cả khi lọc NV xử lý trên Pancake. Tỷ lệ chốt = trong số chia, bao nhiêu đơn đã chốt (không vượt 100%). Tỷ lệ chốt của nhóm = số chia đã chốt thuộc nhóm đó ÷ TỔNG số chia (đơn mới chia chưa có sản phẩm nên không biết thuộc nhóm nào); cộng các nhóm ≈ tỷ lệ chốt chung. Cột Đơn chốt đếm theo ngày chốt nên có cả đơn chia từ trước.',
      closed: status.isDefault
        ? 'Đơn chốt = từ Chờ xác nhận trở đi, theo ngày chốt (lần đầu vào Chờ xác nhận hoặc sau đó).'
        : `Đơn chốt theo bộ lọc trạng thái: ${status.label}.`,
      packed: 'Đang đóng hàng = trong số Đơn chốt ở cột bên cạnh, bao nhiêu đơn đã được kho chuyển sang Đang đóng hàng (kể cả đơn đã đi tiếp: chờ chuyển, đã gửi, đã nhận, hoàn). Tỷ lệ = Đang đóng hàng ÷ Đơn chốt. Dữ liệu Pancake không ghi riêng bước kho gọi khách, nên đây là bước kho đầu tiên đo được.',
      whConfirmed:
        'Đã XN kho = trong số Đơn chốt ở cột bên cạnh, bao nhiêu đơn được kho hoặc vận đơn chuyển sang Đã xác nhận (người bấm khác người chốt và biết rõ là ai). Đơn người chốt tự bấm hoặc không rõ người bấm không tính. Tỷ lệ = Đã XN kho ÷ Đơn chốt. Còn Chờ xác nhận chỉ tính đơn chưa từng được xác nhận, để không cộng hai lần đơn đã xác nhận rồi quay lại Chờ xác nhận.',
      waiting: 'Chờ xác nhận đếm mọi Đơn chốt đang ở trạng thái Chờ xác nhận.',
      warehouseConfirmed:
        'Kho xác nhận trong số Đơn chốt của từng nhân viên = whConfirmed sau khi loại người chốt tự bấm và không rõ người bấm.',
      backToWaiting:
        'Trong số Đơn chốt, backToWaiting là đơn đang Chờ xác nhận (trạng thái 17) đã có giờ XN kho. waiting vẫn đếm mọi đơn 17; waiting − backToWaiting là số còn chờ chưa từng được xác nhận.',
      otherUnconfirmed:
        'Khác trong số Đơn chốt của từng nhân viên = max(0, closed − whConfirmed − selfConfirmed − unknownConfirmer − (waiting − backToWaiting)). Đơn đã xác nhận rồi quay lại Chờ xác nhận chỉ tính ở loại người xác nhận tương ứng.',
      closedFromCreated:
        'Đơn chốt từ số chia trong kỳ = min(closed, createdClosed) của từng nhân viên.',
      closedFromEarlier:
        'Đơn chốt từ số chia trước kỳ = max(0, closed − createdClosed) của từng nhân viên.',
      createdOpen:
        'Số chia trong kỳ chưa chốt = max(0, created − createdClosed) của từng nhân viên.',
      staffTotal:
        'Tổng các dòng nhân viên có mã trong staff, cùng bộ lọc, không gồm đơn chưa gán người; people là số người. Các trường tách cộng từ từng dòng; tỷ lệ và GTTB tính trên tổng.',
      revenue:
        'Doanh thu của nhóm = toàn bộ tiền các đơn thuộc nhóm (sau giảm trừ).',
    },
  });
  memo.set(memoKey, { at: Date.now(), body });
  if (memo.size > 200) memo.delete(memo.keys().next().value!);
  return new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-store',
    },
  });
}
