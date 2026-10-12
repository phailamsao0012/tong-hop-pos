import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { parseStatus, statusSql } from '@/lib/order-status';
import { POS } from '@/lib/report-model';
import { COMPARE_MODES, DATE_RE, VN_OFFSET_HOURS, compareWindow, daysBetween, shiftPeriod, vnRangeUtc, type CompareMode } from '@/lib/report-time';
import { CLOSED } from '@/lib/stats';
import { parseTeam, teamFilter } from '@/lib/team';
import { resolveHrUnit } from '@/lib/hr-unit';

// So cùng kỳ cho bảng Từng nhân viên ở Tổng quan Sale / CSKH (anh Vũ 12/10/2026: "biểu đồ mini để xem so với cùng kì… tôi muốn có tùy chọn").
// ?mode=previous|weekday|monthday|year (lib/report-time.ts shiftPeriod) &step=1.. hoặc ?mode=custom&cstart=&cend=.
// Cùng phạm vi đơn với /api/reports/product-groups (bộ phận, team, NV chăm sóc, trạng thái, thẻ đơn) để số khớp bảng.
// Kỳ đang xem kết thúc hôm nay thì kỳ so cắt ở cùng giờ (compareWindow). Kỳ một ngày: chuỗi theo giờ; dài hơn: theo ngày thứ mấy của kỳ.
const NET = 'COALESCE(o.net_total,COALESCE(o.current_total,0)-COALESCE(o.total_discount,0))';
const MAX_DAYS = 1000;
const memo = new Map<string, { at: number; body: string }>();

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const hit = memo.get(request.url);
  if (hit && Date.now() - hit.at < 3 * 60000) return new Response(hit.body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' } });
  const p = new URL(request.url).searchParams;
  const start = p.get('start') ?? '', end = p.get('end') ?? '';
  if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end || daysBetween(start, end) > MAX_DAYS) return Response.json({ error: 'Khoảng ngày không hợp lệ.' }, { status: 400 });
  const modeParam = p.get('mode') ?? 'previous';
  let range: { start: string; end: string };
  if (modeParam === 'custom') {
    const cs = p.get('cstart') ?? '', ce = p.get('cend') ?? '';
    if (!DATE_RE.test(cs) || !DATE_RE.test(ce) || cs > ce || daysBetween(cs, ce) > MAX_DAYS) return Response.json({ error: 'Kỳ so sánh không hợp lệ.' }, { status: 400 });
    range = { start: cs, end: ce };
  } else if ((COMPARE_MODES as string[]).includes(modeParam)) range = shiftPeriod(start, end, modeParam as CompareMode, Number(p.get('step') ?? 1));
  else return Response.json({ error: 'Kiểu so sánh không hợp lệ.' }, { status: 400 });
  const valid = new Set<string>(POS.map((x) => x.id));
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !valid.has(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  const posIds = requested.length ? requested : POS.map((x) => x.id);
  const unitScope = await resolveHrUnit(p, parseTeam(p.get('team') ?? 'sale'));
  if (unitScope instanceof Response) return unitScope;
  const { team, unit } = unitScope;
  const status = parseStatus(p.get('status'));
  const cdate = status.isDefault ? 'o.first_closed_at' : 'COALESCE(o.first_closed_at,o.created_at)';
  const cwhere = status.isDefault ? `o.${CLOSED}` : statusSql(status, 'o.status_code');
  const staffCol = p.get('by') === 'care' ? "COALESCE(NULLIF(o.care_id,''),o.seller_id)" : 'o.seller_id';
  const tag = (p.get('tag') ?? '').trim().slice(0, 120);
  const staffIds = (p.get('staffIds') ?? '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 200);
  const ph = posIds.map(() => '?').join(',');
  const scope = `o.pos_id IN (${ph})${teamFilter(staffCol, team, true, unit)}${tag ? ' AND instr(o.tags_json, ?)>0' : ''}${staffIds.length ? ` AND ${staffCol} IN (${staffIds.map(() => '?').join(',')})` : ''}`;
  const scopeBinds = [...posIds, ...(tag ? [`"name":${JSON.stringify(tag)}`] : []), ...staffIds];

  const cur = vnRangeUtc(start, end);
  const cmp = compareWindow(end, range);
  // Hai kỳ đều một ngày: so theo giờ (hôm nay tới giờ này so hôm qua tới cùng giờ); còn lại theo ngày thứ mấy của kỳ.
  const hourly = start === end && range.start === range.end;
  const local = `datetime(${cdate},'+${VN_OFFSET_HOURS} hours')`;
  const bucket = hourly ? `CAST(strftime('%H',${local}) AS INTEGER)` : `date(${local})`;
  const db = env.DB;
  const period = (from: string, to: string) => [
    db.prepare(`SELECT ${bucket} AS b, COUNT(*) AS n, COALESCE(SUM(${NET}),0) AS net FROM raw_pos_orders o WHERE ${scope} AND ${cdate}>=? AND ${cdate}<? AND ${cwhere} GROUP BY 1`).bind(...scopeBinds, from, to),
    db.prepare(`SELECT ${staffCol} AS s, COUNT(*) AS n, COALESCE(SUM(${NET}),0) AS net FROM raw_pos_orders o WHERE ${scope} AND ${cdate}>=? AND ${cdate}<? AND ${cwhere} GROUP BY 1`).bind(...scopeBinds, from, to),
    db.prepare(`SELECT ${staffCol} AS s, COUNT(*) AS n, SUM(CASE WHEN o.${CLOSED} THEN 1 ELSE 0 END) AS c FROM raw_pos_orders o WHERE ${scope} AND o.created_at>=? AND o.created_at<? AND o.status_code<>7 GROUP BY 1`).bind(...scopeBinds, from, to),
  ];
  const res = await db.batch([...period(cur.startUtc, cur.endUtc), ...period(cmp.startUtc, cmp.endUtc)]);

  type Cell = { closed: number; closedNet: number; created: number; createdClosed: number };
  const side = (offset: number, from: string, length: number) => {
    const points = Array.from({ length }, (_, i) => ({ i, closed: 0, closedNet: 0 }));
    for (const r of res[offset].results as { b: number | string | null; n: number; net: number }[]) {
      const i = hourly ? Number(r.b) : r.b ? daysBetween(from, String(r.b)) - 1 : -1;
      if (i >= 0 && i < length) { points[i].closed += Number(r.n); points[i].closedNet += Number(r.net); }
    }
    const staff = new Map<string, Cell>();
    const at = (s: string) => { let x = staff.get(s); if (!x) { x = { closed: 0, closedNet: 0, created: 0, createdClosed: 0 }; staff.set(s, x); } return x; };
    for (const r of res[offset + 1].results as { s: string | null; n: number; net: number }[]) if (r.s) { const x = at(r.s); x.closed += Number(r.n); x.closedNet += Number(r.net); }
    for (const r of res[offset + 2].results as { s: string | null; n: number; c: number }[]) if (r.s) { const x = at(r.s); x.created += Number(r.n); x.createdClosed += Number(r.c ?? 0); }
    const total = [...staff.values()].reduce((a, x) => ({ closed: a.closed + x.closed, closedNet: a.closedNet + x.closedNet, created: a.created + x.created, createdClosed: a.createdClosed + x.createdClosed }), { closed: 0, closedNet: 0, created: 0, createdClosed: 0 });
    return { points, staff, total };
  };
  const length = (a: string, b: string) => hourly ? 24 : daysBetween(a, b);
  const now = side(0, start, length(start, end)), before = side(3, range.start, length(range.start, range.end));
  const rate = (c: Cell) => c.created ? Math.min(c.created, c.createdClosed) / c.created * 100 : null;
  const ids = new Set([...now.staff.keys(), ...before.staff.keys()]);
  const zero: Cell = { closed: 0, closedNet: 0, created: 0, createdClosed: 0 };
  const body = JSON.stringify({
    mode: modeParam, step: Number(p.get('step') ?? 1) || 1, bucket: hourly ? 'hour' : 'day',
    period: { start, end }, compare: { start: cmp.start, end: cmp.end, cutoff: cmp.cutoff },
    current: { total: { ...now.total, closeRate: rate(now.total) }, points: now.points },
    previous: { total: { ...before.total, closeRate: rate(before.total) }, points: before.points },
    staff: [...ids].map((id) => {
      const a = now.staff.get(id) ?? zero, b = before.staff.get(id) ?? zero;
      return { sellerId: id, current: { ...a, closeRate: rate(a) }, previous: { ...b, closeRate: rate(b) } };
    }),
  });
  memo.set(request.url, { at: Date.now(), body });
  if (memo.size > 200) memo.delete(memo.keys().next().value!);
  return new Response(body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' } });
}
