// Đối chiếu số MKT trên Google Sheet CPQC Daily (cột SĐT, Đơn, DT marketer tự ghi) với đơn Pancake (anh Vũ 12/10/2026:
// "vừa kết hợp trên pos và báo cáo trên sheet xem khớp không"). Chưa biết sheet ghi DT theo ngày tạo đơn hay ngày chốt, và ghi cả CSKH hay chỉ Sale,
// nên trả cả hai mốc ngày và tách POS ra Sale (New) / CSKH / khác để người xem thấy cột nào khớp sheet.
// Cách tính POS giống số chính Marketing (lib/mkt-analytics.ts): doanh thu sau giảm trừ, chỉ Marketer được tính doanh số; số = SĐT khác nhau mỗi ngày.
import { env } from 'cloudflare:workers';
import { ensureSheetCostSchema } from '@/lib/sheet-costs';
import { NET } from '@/lib/stats';
import { COUNTED_STAFF, type Team, teamFilter, teamSubquery } from '@/lib/team';
import { bucketExpr, vnRangeUtc } from '@/lib/report-time';

export type PosSide = { orders: number; phones: number; closed: number; net: number; sale: number; cskh: number; other: number };
export type SheetSide = { phones: number; orders: number; revenue: number };
export type CheckRow = { sheet: SheetSide; confirmed: PosSide; created: PosSide };

const zeroPos = (): PosSide => ({ orders: 0, phones: 0, closed: 0, net: 0, sale: 0, cskh: 0, other: 0 });
const zeroRow = (): CheckRow => ({ sheet: { phones: 0, orders: 0, revenue: 0 }, confirmed: zeroPos(), created: zeroPos() });
const addRow = (a: CheckRow, b: CheckRow) => {
  for (const k of ['phones', 'orders', 'revenue'] as const) a.sheet[k] += b.sheet[k];
  for (const side of ['confirmed', 'created'] as const) for (const k of Object.keys(a[side]) as (keyof PosSide)[]) a[side][k] += b[side][k];
};

export async function mktSheetCheck(opts: { posIds: string[]; start: string; end: string; team?: Team }) {
  await ensureSheetCostSchema();
  const db = env.DB;
  const ph = opts.posIds.map(() => '?').join(',');
  const mk = "NULLIF(TRIM(o.marketer_id),'')";
  const cur = vnRangeUtc(opts.start, opts.end);
  const net = NET.replaceAll(/\b(net_total|current_total|total_discount)\b/g, 'o.$1');
  const saleSub = teamSubquery('sale')!, cskhSub = teamSubquery('cskh')!;
  // Tài khoản chỉ xem một bộ phận (lib/access.ts ép ?team=): doanh thu POS chỉ còn đơn bộ phận đó chốt; số về, đơn tạo giữ nguyên.
  const seg = teamFilter('o.seller_id', opts.team ?? 'all');
  const closedNow = `o.first_confirmed_at IS NOT NULL AND o.status_code NOT IN (0,17,6,7) AND o.marketer_id IN ${COUNTED_STAFF}${seg}`;
  const split = (cond: string) => `COALESCE(SUM(CASE WHEN ${cond} AND o.seller_id IN ${saleSub} THEN ${net} ELSE 0 END),0) AS sale,
    COALESCE(SUM(CASE WHEN ${cond} AND o.seller_id IN ${cskhSub} THEN ${net} ELSE 0 END),0) AS cskh`;
  // Số về, đơn tạo: mọi marketer (như ô Số ở số chính); doanh thu, đơn chốt: chỉ marketer được tính doanh số.
  const base = `o.pos_id IN (${ph}) AND ${mk} IS NOT NULL`;

  const [sheetRows, confRows, createdRows, nameRows, sources] = await db.batch([
    db.prepare('SELECT marketer_id AS m, day AS d, SUM(phones) AS phones, SUM(orders) AS orders, SUM(revenue) AS revenue FROM sheet_mkt_stats WHERE day>=? AND day<=? GROUP BY 1,2')
      .bind(opts.start, opts.end),
    // Mốc ngày xác nhận lần đầu: đúng như ô Doanh thu MKT.
    db.prepare(`SELECT ${mk} AS m, ${bucketExpr('o.first_confirmed_at', 'day')} AS d, COUNT(*) AS closed, COALESCE(SUM(${net}),0) AS net, ${split('1')}
      FROM raw_pos_orders o WHERE ${base} AND o.marketer_id IN ${COUNTED_STAFF} AND o.first_confirmed_at>=? AND o.first_confirmed_at<? AND o.status_code NOT IN (0,17,6,7)${seg} GROUP BY 1,2`)
      .bind(...opts.posIds, cur.startUtc, cur.endUtc),
    // Mốc ngày tạo đơn: đơn tạo trong ngày, SĐT khác nhau, và bao nhiêu đơn trong số đó tới nay đã chốt.
    db.prepare(`SELECT ${mk} AS m, ${bucketExpr('o.created_at', 'day')} AS d, COUNT(*) AS orders, COUNT(DISTINCT NULLIF(TRIM(o.phone),'')) AS phones,
      SUM(CASE WHEN ${closedNow} THEN 1 ELSE 0 END) AS closed, COALESCE(SUM(CASE WHEN ${closedNow} THEN ${net} ELSE 0 END),0) AS net, ${split(closedNow)}
      FROM raw_pos_orders o WHERE ${base} AND o.created_at>=? AND o.created_at<? AND o.status_code<>7 GROUP BY 1,2`)
      .bind(...opts.posIds, cur.startUtc, cur.endUtc),
    db.prepare(`SELECT user_id, MAX(name) AS name, MAX(user_id IN ${COUNTED_STAFF}) AS counted FROM pos_users WHERE name<>'' GROUP BY user_id`),
    db.prepare("SELECT MAX(received_at) AS at, COUNT(*) AS n FROM sheet_cost_sources"),
  ]);

  type R = Record<string, string | number | null>;
  const n = (v: unknown) => Number(v ?? 0);
  const names = new Map((nameRows.results as { user_id: string; name: string }[]).map((r) => [r.user_id, r.name]));
  // Marketer chưa có hậu tố MKT: POS không tính doanh thu (quy tắc doanh số), nên sheet có DT mà POS 0; trang báo rõ thay vì coi là lệch.
  const counted = new Set((nameRows.results as { user_id: string; counted: number }[]).filter((r) => Number(r.counted)).map((r) => r.user_id));
  const who = (id: string) => names.get(id) ?? (id.startsWith('sheet:') ? `${id.slice(6)} (chưa ghép với POS)` : `NV ${id.slice(0, 8)}`);
  const cells = new Map<string, CheckRow>();
  const cell = (m: string, d: string) => { const k = `${m}|${d}`; let x = cells.get(k); if (!x) { x = zeroRow(); cells.set(k, x); } return x; };
  for (const r of sheetRows.results as R[]) { const x = cell(String(r.m), String(r.d)); x.sheet.phones += n(r.phones); x.sheet.orders += n(r.orders); x.sheet.revenue += n(r.revenue); }
  const pos = (side: PosSide, r: R) => {
    side.orders += n(r.orders); side.phones += n(r.phones); side.closed += n(r.closed); side.net += n(r.net);
    side.sale += n(r.sale); side.cskh += n(r.cskh); side.other += n(r.net) - n(r.sale) - n(r.cskh);
  };
  for (const r of confRows.results as R[]) pos(cell(String(r.m), String(r.d)).confirmed, r);
  for (const r of createdRows.results as R[]) pos(cell(String(r.m), String(r.d)).created, r);

  const byMarketer = new Map<string, CheckRow>(), byDay = new Map<string, CheckRow>(), total = zeroRow();
  const detail: ({ marketerId: string; day: string } & CheckRow)[] = [];
  for (const [k, x] of cells) {
    const [m, d] = k.split('|');
    if (!byMarketer.has(m)) byMarketer.set(m, zeroRow());
    if (!byDay.has(d)) byDay.set(d, zeroRow());
    addRow(byMarketer.get(m)!, x); addRow(byDay.get(d)!, x); addRow(total, x);
    detail.push({ marketerId: m, day: d, ...x });
  }
  const src = sources.results[0] as { at: string | null; n: number } | undefined;
  return {
    period: { start: opts.start, end: opts.end },
    sheet: { connected: n(src?.n) > 0, receivedAt: src?.at ?? null, hasStats: total.sheet.phones + total.sheet.orders + total.sheet.revenue > 0 },
    total,
    marketers: [...byMarketer.entries()].map(([id, x]) => ({ id, name: who(id), counted: counted.has(id), ...x })).sort((a, b) => b.sheet.revenue + b.confirmed.net - (a.sheet.revenue + a.confirmed.net)),
    days: [...byDay.entries()].map(([day, x]) => ({ day, ...x })).sort((a, b) => a.day.localeCompare(b.day)),
    detail: detail.sort((a, b) => a.day.localeCompare(b.day)),
  };
}
