// Phân tích Marketing đầu trang Tổng quan (anh Vũ 09/10/2026: "các con số phải đấm vào mặt", "rõ ràng theo khoảng thời gian, theo ngày,
// theo nhân sự, theo từng con sản phẩm, theo đủ thứ"). Chi phí lấy ở ad_costs (Google Sheet CPQC Daily + nhập tay), doanh thu / đơn / số ở đơn Pancake.
// Cách tính giống trang Chi phí & ROAS (lib/ad-costs.ts roasReport): doanh thu = đơn chốt theo ngày xác nhận lần đầu, sau giảm trừ;
// số = SĐT khác nhau trên đơn tạo trong kỳ của từng marketer; ROAS, chi phí / đơn, chi phí / số chỉ tính marketer có chi phí trong phạm vi đang xem.
// Sản phẩm: cột "Sản phẩm" của sheet (lưu ở ad_costs.campaign). Đơn Pancake thuộc sản phẩm đó khi nhãn đơn hoặc tên sản phẩm trong đơn chứa đúng tên ấy
// (so không dấu, bỏ dấu cách); "Kháng sinh" / "Combo" dùng nhóm chính của web. Một đơn nhiều sản phẩm được tính ở mỗi sản phẩm.
import { env } from 'cloudflare:workers';
import { ensureAdCostSchema } from '@/lib/ad-costs';
import { NET } from '@/lib/stats';
import { MARKETING_TEAMS_KEY, UNASSIGNED_TEAM, parseMarketingTeams } from '@/lib/marketing-teams';
import { MAIN_GROUPS, mainGroupSql } from '@/lib/product-groups';
import { addDays, bucketExpr, comparePeriod, compareWindow, daysBetween, vnRangeUtc } from '@/lib/report-time';

export const NO_PRODUCT = '';
export type Bucket = 'day' | 'week' | 'month';
export type Metrics = { cost: number; net: number; closed: number; orders: number; phones: number; coveredNet: number; coveredClosed: number; coveredPhones: number; marketers: number; roas: number | null; costPerClosed: number | null; costPerLead: number | null };
type Base = Pick<Metrics, 'cost' | 'net' | 'closed' | 'orders' | 'phones'>;

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^a-z0-9]/g, '');
const zero = (): Base => ({ cost: 0, net: 0, closed: 0, orders: 0, phones: 0 });
const add = (a: Base, b: Partial<Base>) => { a.cost += b.cost ?? 0; a.net += b.net ?? 0; a.closed += b.closed ?? 0; a.orders += b.orders ?? 0; a.phones += b.phones ?? 0; };

/** Cộng các dòng theo marketer thành một ô số; "có chi phí" xét theo từng marketer trong cùng phạm vi. */
function finish(rows: Iterable<Base & { paid?: boolean }>): Metrics {
  const t = { ...zero(), coveredNet: 0, coveredClosed: 0, coveredPhones: 0, marketers: 0 };
  for (const r of rows) {
    add(t, r);
    const paid = r.paid ?? r.cost > 0;
    if (paid) { t.coveredNet += r.net; t.coveredClosed += r.closed; t.coveredPhones += r.phones; }
    if (r.cost > 0) t.marketers++;
  }
  return { ...t, roas: t.cost ? t.coveredNet / t.cost : null, costPerClosed: t.cost && t.coveredClosed ? t.cost / t.coveredClosed : null, costPerLead: t.cost && t.coveredPhones ? t.cost / t.coveredPhones : null };
}

/** Khớp tên sản phẩm của sheet với nhãn đơn / tên sản phẩm Pancake (không dấu, bỏ dấu cách). Trả về danh sách nhãn, tên khớp để lọc bằng IN. */
export function matchProduct(product: string, tags: string[], items: string[]) {
  const key = fold(product);
  const main = MAIN_GROUPS.find((g) => fold(g.label) === key || (g.key === 'khang-sinh' && key === 'khangsinh'));
  if (main) return { main, tags: [] as string[], items: [] as string[] };
  if (key.length < 3) return { main: null, tags: [], items: [] };
  return {
    main: null,
    tags: tags.filter((t) => fold(t).includes(key)),
    items: items.filter((n) => fold(n).includes(key)),
  };
}

function productSql(m: ReturnType<typeof matchProduct>) {
  if (m.main) return mainGroupSql(m.main, 'both');
  const parts: string[] = [], binds: string[] = [];
  if (m.tags.length) {
    parts.push("EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(o.tags_json) THEN o.tags_json ELSE '[]' END) mt WHERE TRIM(json_extract(mt.value,'$.name')) IN (SELECT value FROM json_each(?)))");
    binds.push(JSON.stringify(m.tags));
  }
  if (m.items.length) {
    parts.push('EXISTS (SELECT 1 FROM raw_pos_order_items mi WHERE mi.order_id=o.id AND COALESCE(mi.is_bonus,0)=0 AND mi.quantity>0 AND TRIM(mi.name) IN (SELECT value FROM json_each(?)))');
    binds.push(JSON.stringify(m.items));
  }
  return parts.length ? { sql: `(${parts.join(' OR ')})`, binds } : { sql: '0', binds: [] };
}

export function bucketOf(start: string, end: string): Bucket {
  const n = daysBetween(start, end);
  return n <= 62 ? 'day' : n <= 200 ? 'week' : 'month';
}
/** Ngày (YYYY-MM-DD) → khóa nhóm, khớp bucketExpr của SQL. */
function bucketKey(day: string, b: Bucket) {
  if (b === 'month') return day.slice(0, 7);
  if (b === 'week') { const w = new Date(`${day}T00:00:00Z`).getUTCDay(); return addDays(day, -((w + 6) % 7)); }
  return day;
}

export async function mktAnalytics(opts: { posIds: string[]; start: string; end: string; marketerId?: string | null; teamId?: string | null; product?: string | null }) {
  await ensureAdCostSchema();
  const db = env.DB;
  const ph = opts.posIds.map(() => '?').join(',');
  const mk = "NULLIF(TRIM(o.marketer_id),'')";
  const label = "COALESCE(NULLIF(TRIM(campaign),''),'')";
  const prev = comparePeriod(opts.start, opts.end, 'previous');
  const win = compareWindow(opts.end, prev);
  const cur = vnRangeUtc(opts.start, opts.end);
  const bucket = bucketOf(opts.start, opts.end);
  const product = opts.product ?? null;

  // Lượt 1: tên sản phẩm trên sheet, nhãn đơn + tên sản phẩm Pancake của đơn MKT trong cả hai kỳ, team MKT, tên nhân viên.
  // Hai nhánh theo đúng chỉ mục (pos_id, created_at) và (pos_id, first_confirmed_at); UNION bỏ trùng.
  const tagSql = "SELECT DISTINCT TRIM(json_extract(t.value,'$.name')) AS v FROM raw_pos_orders o, json_each(CASE WHEN json_valid(o.tags_json) THEN o.tags_json ELSE '[]' END) t";
  const itemSql = 'SELECT DISTINCT TRIM(i.name) AS v FROM raw_pos_orders o JOIN raw_pos_order_items i ON i.order_id=o.id';
  const itemOk = 'AND COALESCE(i.is_bonus,0)=0 AND i.quantity>0';
  const scopeOf = (col: string) => `o.pos_id IN (${ph}) AND o.${col}>=? AND o.${col}<? AND ${mk} IS NOT NULL`;
  const scopeBinds = [...opts.posIds, win.startUtc, cur.endUtc];
  const [labels, tagRows, itemRows, teamRow, nameRows] = await db.batch([
    db.prepare(`SELECT ${label} AS product, SUM(amount) AS amount FROM ad_costs WHERE day>=? AND day<=? GROUP BY 1 ORDER BY 2 DESC`).bind(prev.start, opts.end),
    db.prepare(`${tagSql} WHERE ${scopeOf('created_at')} UNION ${tagSql} WHERE ${scopeOf('first_confirmed_at')}`).bind(...scopeBinds, ...scopeBinds),
    db.prepare(`${itemSql} WHERE ${scopeOf('created_at')} ${itemOk} UNION ${itemSql} WHERE ${scopeOf('first_confirmed_at')} ${itemOk}`).bind(...scopeBinds, ...scopeBinds),
    db.prepare('SELECT value FROM app_settings WHERE key=?').bind(MARKETING_TEAMS_KEY),
    db.prepare("SELECT user_id, MAX(name) AS name FROM pos_users WHERE name<>'' GROUP BY user_id"),
  ]);
  const tags = (tagRows.results as { v: string | null }[]).map((r) => r.v ?? '').filter(Boolean);
  const items = (itemRows.results as { v: string | null }[]).map((r) => r.v ?? '').filter(Boolean);
  const products = (labels.results as { product: string }[]).map((r) => r.product);
  const matches = new Map(products.map((p) => [p, matchProduct(p, tags, items)]));
  const pf = product === null ? null : product === NO_PRODUCT ? { sql: '0', binds: [] } : productSql(matches.get(product) ?? matchProduct(product, tags, items));
  const pfSql = pf ? ` AND ${pf.sql}` : '', pfBinds = pf?.binds ?? [];
  const costPf = product === null ? '' : ` AND ${label}=?`, costPfBinds = product === null ? [] : [product];

  const teams = parseMarketingTeams((teamRow.results[0] as { value?: string } | undefined)?.value);
  const teamOf = new Map(teams.flatMap((t) => t.memberIds.map((id) => [id, t] as const)));
  const names = new Map((nameRows.results as { user_id: string; name: string }[]).map((r) => [r.user_id, r.name]));
  const who = (id: string) => names.get(id) ?? (id.startsWith('sheet:') ? `${id.slice(6)} (Sheet)` : `NV ${id.slice(0, 8)}`);
  // Người đang xem: một marketer, một team, nhóm "Chưa phân team", hoặc tất cả.
  const picked = (id: string) => {
    if (opts.marketerId) return id === opts.marketerId;
    if (opts.teamId === UNASSIGNED_TEAM) return !teamOf.has(id);
    if (opts.teamId) return teamOf.get(id)?.id === opts.teamId;
    return true;
  };

  const closedWhere = (from: string, to: string) => [`o.pos_id IN (${ph}) AND o.first_confirmed_at>=? AND o.first_confirmed_at<? AND o.status_code NOT IN (0,17,6,7) AND ${mk} IS NOT NULL`, [...opts.posIds, from, to]] as const;
  const leadWhere = (from: string, to: string) => [`o.pos_id IN (${ph}) AND o.created_at>=? AND o.created_at<? AND o.status_code<>7 AND ${mk} IS NOT NULL`, [...opts.posIds, from, to]] as const;
  const net = NET.replaceAll(/\b(net_total|current_total|total_discount)\b/g, 'o.$1');
  const [cw, cb] = closedWhere(cur.startUtc, cur.endUtc), [lw, lb] = leadWhere(cur.startUtc, cur.endUtc);
  const [pcw, pcb] = closedWhere(win.startUtc, win.endUtc), [plw, plb] = leadWhere(win.startUtc, win.endUtc);
  // Sản phẩm theo nhãn / tên: gom vào một bảng ghép (tên → sản phẩm) rồi chạy một câu cho đơn chốt, một câu cho đơn tạo.
  // UNION bỏ trùng cặp (đơn, sản phẩm) nên đơn khớp cả nhãn lẫn tên vẫn tính một lần cho mỗi sản phẩm.
  // Riêng "Kháng sinh" / "Combo" (nhóm chính) chạy câu riêng theo mainGroupSql.
  const productList = products.filter((p) => p !== NO_PRODUCT);
  const tagMap = productList.flatMap((p) => (matches.get(p)!.tags).map((t) => [t, p]));
  const itemMap = productList.flatMap((p) => (matches.get(p)!.items).map((t) => [t, p]));
  const mainList = productList.filter((p) => matches.get(p)!.main);
  const hitsOf = (where: string) => `WITH tm AS (SELECT json_extract(value,'$[0]') AS name, json_extract(value,'$[1]') AS product FROM json_each(?)),
    im AS (SELECT json_extract(value,'$[0]') AS name, json_extract(value,'$[1]') AS product FROM json_each(?)),
    base AS (SELECT o.id, ${mk} AS m, o.phone, ${net} AS net, o.tags_json FROM raw_pos_orders o WHERE ${where}),
    hits AS (SELECT b.id, tm.product FROM base b, json_each(CASE WHEN json_valid(b.tags_json) THEN b.tags_json ELSE '[]' END) t JOIN tm ON tm.name=TRIM(json_extract(t.value,'$.name'))
      UNION SELECT b.id, im.product FROM base b JOIN raw_pos_order_items i ON i.order_id=b.id JOIN im ON im.name=TRIM(i.name) WHERE COALESCE(i.is_bonus,0)=0 AND i.quantity>0)`;
  const maps = [JSON.stringify(tagMap), JSON.stringify(itemMap)];

  const stmts = [
    /* 0 */ db.prepare(`SELECT marketer_id, day, SUM(amount) AS amount FROM ad_costs WHERE day>=? AND day<=?${costPf} GROUP BY 1,2`).bind(opts.start, opts.end, ...costPfBinds),
    /* 1 */ db.prepare(`SELECT marketer_id, day, SUM(amount) AS amount FROM ad_costs WHERE day>=? AND day<=?${costPf} GROUP BY 1,2`).bind(prev.start, prev.end, ...costPfBinds),
    /* 2 */ db.prepare(`SELECT ${label} AS product, marketer_id, SUM(amount) AS amount FROM ad_costs WHERE day>=? AND day<=? GROUP BY 1,2`).bind(opts.start, opts.end),
    /* 3 */ db.prepare(`SELECT ${mk} AS m, ${bucketExpr('o.first_confirmed_at', bucket)} AS b, COUNT(*) AS closed, COALESCE(SUM(${net}),0) AS net FROM raw_pos_orders o WHERE ${cw}${pfSql} GROUP BY 1,2`).bind(...cb, ...pfBinds),
    /* 4 */ db.prepare(`SELECT ${mk} AS m, COUNT(*) AS orders, COUNT(DISTINCT o.phone) AS phones FROM raw_pos_orders o WHERE ${lw}${pfSql} GROUP BY 1`).bind(...lb, ...pfBinds),
    /* 5 */ db.prepare(`SELECT ${mk} AS m, ${bucketExpr('o.created_at', bucket)} AS b, COUNT(*) AS orders, COUNT(DISTINCT o.phone) AS phones FROM raw_pos_orders o WHERE ${lw}${pfSql} GROUP BY 1,2`).bind(...lb, ...pfBinds),
    /* 6 */ db.prepare(`SELECT ${mk} AS m, COUNT(*) AS closed, COALESCE(SUM(${net}),0) AS net FROM raw_pos_orders o WHERE ${pcw}${pfSql} GROUP BY 1`).bind(...pcb, ...pfBinds),
    /* 7 */ db.prepare(`SELECT ${mk} AS m, COUNT(*) AS orders, COUNT(DISTINCT o.phone) AS phones FROM raw_pos_orders o WHERE ${plw}${pfSql} GROUP BY 1`).bind(...plb, ...pfBinds),
    /* 8 */ db.prepare(`${hitsOf(cw)} SELECT h.product AS p, b.m, COUNT(*) AS closed, COALESCE(SUM(b.net),0) AS net FROM hits h JOIN base b ON b.id=h.id GROUP BY 1,2`).bind(...maps, ...cb),
    /* 9 */ db.prepare(`${hitsOf(lw)} SELECT h.product AS p, b.m, COUNT(*) AS orders, COUNT(DISTINCT b.phone) AS phones FROM hits h JOIN base b ON b.id=h.id GROUP BY 1,2`).bind(...maps, ...lb),
    ...mainList.flatMap((p) => {
      const g = productSql(matches.get(p)!);
      return [
        db.prepare(`SELECT ? AS p, ${mk} AS m, COUNT(*) AS closed, COALESCE(SUM(${net}),0) AS net FROM raw_pos_orders o WHERE ${cw} AND ${g.sql} GROUP BY 2`).bind(p, ...cb, ...g.binds),
        db.prepare(`SELECT ? AS p, ${mk} AS m, COUNT(*) AS orders, COUNT(DISTINCT o.phone) AS phones FROM raw_pos_orders o WHERE ${lw} AND ${g.sql} GROUP BY 2`).bind(p, ...lb, ...g.binds),
      ];
    }),
  ];
  const res = await db.batch(stmts);
  type R = Record<string, string | number | null>;
  const rowsOf = (i: number) => res[i].results as R[];
  const n = (v: unknown) => Number(v ?? 0);

  // Theo marketer, kỳ này và kỳ trước (đã áp lọc sản phẩm, chưa áp lọc người).
  const byM = new Map<string, Base>(), prevM = new Map<string, Base>();
  const get = (m: Map<string, Base>, id: string) => { let x = m.get(id); if (!x) { x = zero(); m.set(id, x); } return x; };
  for (const r of rowsOf(0)) get(byM, String(r.marketer_id)).cost += n(r.amount);
  for (const r of rowsOf(3)) { const x = get(byM, String(r.m)); x.closed += n(r.closed); x.net += n(r.net); }
  for (const r of rowsOf(4)) { const x = get(byM, String(r.m)); x.orders = n(r.orders); x.phones = n(r.phones); }
  // Kỳ đang xem tới hôm nay mà hôm nay chưa có chi phí (sheet thường ghi sau): chi phí kỳ trước cũng chỉ tính tới hết ngày áp chót, để so cùng mốc.
  const todayCost = rowsOf(0).some((r) => r.day === opts.end && picked(String(r.marketer_id)) && n(r.amount) > 0);
  const costUntil = win.cutoff && !todayCost ? addDays(prev.end, -1) : prev.end;
  for (const r of rowsOf(1)) if (String(r.day) <= costUntil) get(prevM, String(r.marketer_id)).cost += n(r.amount);
  for (const r of rowsOf(6)) { const x = get(prevM, String(r.m)); x.closed = n(r.closed); x.net = n(r.net); }
  for (const r of rowsOf(7)) { const x = get(prevM, String(r.m)); x.orders = n(r.orders); x.phones = n(r.phones); }
  const paidNow = (id: string) => (byM.get(id)?.cost ?? 0) > 0;

  const people = [...byM.entries()].map(([id, x]) => {
    const p = prevM.get(id);
    return { id, name: who(id), teamId: teamOf.get(id)?.id ?? UNASSIGNED_TEAM, picked: picked(id), ...finish([x]), prevNet: p?.net ?? 0, prevCost: p?.cost ?? 0 };
  }).sort((a, b) => b.net - a.net || b.cost - a.cost);
  const current = finish([...byM.entries()].filter(([id]) => picked(id)).map(([, x]) => x));
  const previous = finish([...prevM.entries()].filter(([id]) => picked(id)).map(([, x]) => x));

  // Theo team (tổng các marketer của team).
  const teamRows = [...teams.map((t) => ({ id: t.id, name: t.name })), { id: UNASSIGNED_TEAM, name: 'Chưa phân team' }].map((t) => {
    const members = [...byM.entries()].filter(([id]) => (teamOf.get(id)?.id ?? UNASSIGNED_TEAM) === t.id);
    const before = [...prevM.entries()].filter(([id]) => (teamOf.get(id)?.id ?? UNASSIGNED_TEAM) === t.id);
    return { ...t, people: members.length, ...finish(members.map(([, x]) => x)), prevNet: before.reduce((s, [, x]) => s + x.net, 0), prevCost: before.reduce((s, [, x]) => s + x.cost, 0) };
  }).filter((t) => t.cost || t.net || t.orders);

  // Theo ngày / tuần / tháng (đã áp mọi lọc). Có chi phí = marketer có chi phí trong cả kỳ đang xem.
  const series = new Map<string, Base & { coveredNet: number; coveredClosed: number; coveredPhones: number }>();
  for (let d = opts.start; d <= opts.end; d = addDays(d, 1)) { const k = bucketKey(d, bucket); if (!series.has(k)) series.set(k, { ...zero(), coveredNet: 0, coveredClosed: 0, coveredPhones: 0 }); }
  const at = (k: string) => series.get(k);
  for (const r of rowsOf(0)) if (picked(String(r.marketer_id))) { const x = at(bucketKey(String(r.day), bucket)); if (x) x.cost += n(r.amount); }
  for (const r of rowsOf(3)) if (picked(String(r.m))) { const x = at(String(r.b)); if (x) { x.closed += n(r.closed); x.net += n(r.net); if (paidNow(String(r.m))) { x.coveredNet += n(r.net); x.coveredClosed += n(r.closed); } } }
  for (const r of rowsOf(5)) if (picked(String(r.m))) { const x = at(String(r.b)); if (x) { x.orders += n(r.orders); x.phones += n(r.phones); if (paidNow(String(r.m))) x.coveredPhones += n(r.phones); } }
  const timeline = [...series.entries()].map(([key, x]) => ({ key, ...x,
    roas: x.cost ? x.coveredNet / x.cost : null, costPerClosed: x.cost && x.coveredClosed ? x.cost / x.coveredClosed : null, costPerLead: x.cost && x.coveredPhones ? x.cost / x.coveredPhones : null }));

  // Theo sản phẩm của sheet (áp lọc người, không áp lọc sản phẩm để thấy cả danh sách).
  const costPM = new Map<string, Map<string, number>>();
  for (const r of rowsOf(2)) {
    const p = String(r.product ?? ''); if (!picked(String(r.marketer_id))) continue;
    if (!costPM.has(p)) costPM.set(p, new Map());
    costPM.get(p)!.set(String(r.marketer_id), n(r.amount));
  }
  const perProduct = new Map<string, Map<string, Base>>();
  const pp = (p: string) => { let x = perProduct.get(p); if (!x) { x = new Map(); perProduct.set(p, x); } return x; };
  const closedRows = [rowsOf(8), ...mainList.map((_, i) => rowsOf(10 + i * 2))].flat();
  const leadRows = [rowsOf(9), ...mainList.map((_, i) => rowsOf(11 + i * 2))].flat();
  for (const r of closedRows) if (picked(String(r.m))) { const x = get(pp(String(r.p)), String(r.m)); x.closed = n(r.closed); x.net = n(r.net); }
  for (const r of leadRows) if (picked(String(r.m))) { const x = get(pp(String(r.p)), String(r.m)); x.orders = n(r.orders); x.phones = n(r.phones); }
  const productRows = [...new Set([...productList, ...costPM.keys()])].map((p) => {
    const byPerson = pp(p);
    for (const [id, amount] of costPM.get(p) ?? []) get(byPerson, id).cost += amount;
    const m = matches.get(p);
    return { product: p, ...finish(byPerson.values()), matched: m?.main ? [`Nhóm ${m.main.label}`] : [...(m?.tags ?? []), ...(m?.items ?? [])].slice(0, 12), linked: !!m && (!!m.main || m.tags.length + m.items.length > 0) };
  }).filter((r) => r.cost || r.net).sort((a, b) => b.cost - a.cost || b.net - a.net);

  return {
    period: { start: opts.start, end: opts.end }, previous: { start: prev.start, end: prev.end, cutoff: win.cutoff, costUntil }, bucket,
    filters: { marketerId: opts.marketerId ?? null, marketerName: opts.marketerId ? who(opts.marketerId) : null, teamId: opts.teamId ?? null, teamName: opts.teamId === UNASSIGNED_TEAM ? 'Chưa phân team' : teams.find((t) => t.id === opts.teamId)?.name ?? null, product },
    current, prev: previous, timeline, people, teams: teamRows, products: productRows,
  };
}
