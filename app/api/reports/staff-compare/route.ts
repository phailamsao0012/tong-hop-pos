import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { parseStatus, statusSql } from '@/lib/order-status';
import { POS } from '@/lib/report-model';
import { reportMemoKey } from '@/lib/report-memo';
import { COMPARE_MODES, DATE_RE, VN_OFFSET_HOURS, compareWindow, daysBetween, shiftPeriod, vnRangeUtc, type CompareMode } from '@/lib/report-time';
import { CLOSED } from '@/lib/stats';
import { parseTeam, teamFilter, usingHrTeams } from '@/lib/team';
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
  const memoKey = reportMemoKey(
    user.role,
    usingHrTeams() ? 'hr' : 'pc',
    request.url,
  );
  const hit = memo.get(memoKey);
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
  const bucketOf = (col: string) => { const local = `datetime(${col},'+${VN_OFFSET_HOURS} hours')`; return hourly ? `CAST(strftime('%H',${local}) AS INTEGER)` : `date(${local})`; };
  const db = env.DB;
  // Mỗi kỳ hai lượt: đơn chốt theo (người, ngày/giờ chốt) và số chia theo (người, ngày/giờ tạo). Tổng và chuỗi của cả đội cộng từ đây.
  const period = (from: string, to: string) => [
    db.prepare(`SELECT ${staffCol} AS s, ${bucketOf(cdate)} AS b, COUNT(*) AS n, COALESCE(SUM(${NET}),0) AS net FROM raw_pos_orders o WHERE ${scope} AND ${cdate}>=? AND ${cdate}<? AND ${cwhere} GROUP BY 1,2`).bind(...scopeBinds, from, to),
    db.prepare(`SELECT ${staffCol} AS s, ${bucketOf('o.created_at')} AS b, COUNT(*) AS n, SUM(CASE WHEN o.${CLOSED} THEN 1 ELSE 0 END) AS c FROM raw_pos_orders o WHERE ${scope} AND o.created_at>=? AND o.created_at<? AND o.status_code<>7 GROUP BY 1,2`).bind(...scopeBinds, from, to),
  ];
  const res = await db.batch([...period(cur.startUtc, cur.endUtc), ...period(cmp.startUtc, cmp.endUtc)]);

  type Cell = { closed: number; closedNet: number; created: number; createdClosed: number };
  const blank = (): Cell => ({ closed: 0, closedNet: 0, created: 0, createdClosed: 0 });
  // Chuỗi từng người cho ô "lên xuống" ở bảng: gộp tối đa SERIES_MAX điểm (kỳ dài thì mỗi điểm vài ngày).
  const SERIES_MAX = 31;
  const side = (offset: number, from: string, length: number) => {
    const idx = (b: number | string | null) => hourly ? Number(b) : b ? daysBetween(from, String(b)) - 1 : -1;
    const points = Array.from({ length }, (_, i) => ({ i, ...blank() }));
    const staff = new Map<string, { total: Cell; series: Cell[] }>();
    const at = (s: string) => { let x = staff.get(s); if (!x) { x = { total: blank(), series: Array.from({ length }, blank) }; staff.set(s, x); } return x; };
    for (const r of res[offset].results as { s: string | null; b: number | string | null; n: number; net: number }[]) {
      const i = idx(r.b); if (!r.s || i < 0 || i >= length) continue;
      const x = at(r.s); for (const c of [x.total, x.series[i], points[i]]) { c.closed += Number(r.n); c.closedNet += Number(r.net); }
    }
    for (const r of res[offset + 1].results as { s: string | null; b: number | string | null; n: number; c: number }[]) {
      const i = idx(r.b); if (!r.s || i < 0 || i >= length) continue;
      const x = at(r.s); for (const c of [x.total, x.series[i], points[i]]) { c.created += Number(r.n); c.createdClosed += Number(r.c ?? 0); }
    }
    const total = [...staff.values()].reduce((a, x) => ({ closed: a.closed + x.total.closed, closedNet: a.closedNet + x.total.closedNet, created: a.created + x.total.created, createdClosed: a.createdClosed + x.total.createdClosed }), blank());
    return { points, staff, total };
  };
  const length = (a: string, b: string) => hourly ? 24 : daysBetween(a, b);
  const now = side(0, start, length(start, end)), before = side(2, range.start, length(range.start, range.end));
  const rate = (c: Pick<Cell, 'created' | 'createdClosed'>) => c.created ? Math.min(c.created, c.createdClosed) / c.created * 100 : null;
  const ids = new Set([...now.staff.keys(), ...before.staff.keys()]);
  // Gộp chuỗi về tối đa SERIES_MAX điểm, mỗi điểm [đơn chốt, doanh thu, số chia, số chia đã chốt].
  const group = Math.max(1, Math.ceil(Math.max(length(start, end), length(range.start, range.end)) / SERIES_MAX));
  const pack = (series: Cell[] | undefined, len: number) => {
    const out: number[][] = [];
    for (let i = 0; i < len; i += group) {
      const c = blank(); for (let j = i; j < Math.min(len, i + group); j++) { const x = series?.[j]; if (x) { c.closed += x.closed; c.closedNet += x.closedNet; c.created += x.created; c.createdClosed += x.createdClosed; } }
      out.push([c.closed, c.closedNet, c.created, c.createdClosed]);
    }
    return out;
  };
  const seriesRate = (series: number[][]) => series.map((t) => rate({ created: t[2], createdClosed: t[3] }));
  const staff = [...ids].map((id) => {
    const a = now.staff.get(id), b = before.staff.get(id);
    const series = { current: pack(a?.series, now.points.length), previous: pack(b?.series, before.points.length) };
    return { sellerId: id, current: { ...(a?.total ?? blank()), closeRate: rate(a?.total ?? blank()) }, previous: { ...(b?.total ?? blank()), closeRate: rate(b?.total ?? blank()) },
      series, seriesRate: { current: seriesRate(series.current), previous: seriesRate(series.previous) } };
  });
  // Dòng Tổng chỉ cộng người có số trong kỳ đang xem, như bảng product-groups.
  // Người chỉ có số kỳ so vẫn ở staff[], nhưng không thuộc dòng Tổng của bảng.
  const rows = staff.filter((s) => now.staff.has(s.sellerId));
  const rowsSide = (key: 'current' | 'previous') => {
    const total = blank(), series: number[][] = [];
    for (const s of rows) {
      for (const field of ['closed', 'closedNet', 'created', 'createdClosed'] as const) total[field] += s[key][field];
      s.series[key].forEach((t, i) => {
        series[i] = (series[i] ?? [0, 0, 0, 0]).map((v, j) => v + t[j]);
      });
    }
    return { total: { ...total, closeRate: rate(total) }, series, seriesRate: seriesRate(series) };
  };
  const rowsCurrent = rowsSide('current'), rowsPrevious = rowsSide('previous');
  const body = JSON.stringify({
    mode: modeParam, step: Number(p.get('step') ?? 1) || 1, bucket: hourly ? 'hour' : 'day', group,
    period: { start, end }, compare: { start: cmp.start, end: cmp.end, cutoff: cmp.cutoff },
    current: { total: { ...now.total, closeRate: rate(now.total) }, points: now.points },
    previous: { total: { ...before.total, closeRate: rate(before.total) }, points: before.points },
    staff,
    rowsTotal: { current: rowsCurrent.total, previous: rowsPrevious.total,
      series: { current: rowsCurrent.series, previous: rowsPrevious.series },
      seriesRate: { current: rowsCurrent.seriesRate, previous: rowsPrevious.seriesRate } },
  });
  memo.set(memoKey, { at: Date.now(), body });
  if (memo.size > 200) memo.delete(memo.keys().next().value!);
  return new Response(body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' } });
}
