import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { maskPhone } from '@/lib/bot-guard-core';
import { maskPhonesIn } from '@/lib/audit';
import { overviewReport } from '@/lib/overview-report';
import { annotateRates } from '@/lib/overview-rates';
import { parseMetricSettings } from '@/lib/metrics';
import { closedWhere, orderFilterSql, parseOrderFilters } from '@/lib/order-segments';
import { POS } from '@/lib/report-model';
import { DATE_RE, vnRangeUtc } from '@/lib/report-time';
import { resolveBranchUnit as resolveHrUnit } from '@/lib/scope-filter';
import { parseTeam, teamFilter } from '@/lib/team';
import { ORDER_STATUS } from '@/lib/pancake';
import { aggregateReasons, definitions, groupOf, noteBatches, reasonOf, STATUS_LABELS } from '@/lib/staff-detail';
import { hideCskhAssigned } from '../overview/route';

type Order = { id: string; source_order_id: string; pos_id: string; phone: string | null; customer_id: string | null; status_code: number; tags_json: string | null; note: string | null; net: number; at: string; marketer_name: string | null };
type Note = { pos_id: string; customer_id: string; message: string; author_name: string | null; created_at: string };
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const p = new URL(request.url).searchParams;
  const start = p.get('start') ?? '', end = p.get('end') ?? '';
  const validDay = (s: string) => DATE_RE.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s;
  if (!validDay(start) || !validDay(end) || start > end || (Date.parse(end)-Date.parse(start))/86400000 >= 400)
    return Response.json({error: 'Khoảng ngày không hợp lệ.'}, {status: 400});
  const sellerId = (p.get('sellerId') ?? '').trim().slice(0,100);
  if (!sellerId) return Response.json({error: 'Thiếu mã nhân viên.'}, {status: 400});
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some(id => !POS.some(pos => pos.id === id))) return Response.json({error: 'Bộ lọc POS không hợp lệ.'}, {status: 400});
  const posIds = requested.length ? requested : POS.map(pos => pos.id);
  const scope = await resolveHrUnit(p, parseTeam(p.get('team')));
  if (scope instanceof Response) return scope;
  const {team, unit} = scope, filters = parseOrderFilters(p, team), ms = parseMetricSettings(p);
  const report = await overviewReport({posIds, start, end, groupBy: 'day', employeeIds: [sellerId], compare: 'previous', team, unit, filters});
  const assignedVisible = user.role === 'owner' || user.role === 'director';
  if (!assignedVisible) hideCskhAssigned(report, team);
  annotateRates(report, ms);
  const current = report.current.byEmployee.find(r => r.sellerId === sellerId);
  const previous = report.compare?.byEmployee.find(r => r.sellerId === sellerId);
  const row = current ?? previous;
  const person = row ?? await env.DB.prepare(`SELECT MAX(name) AS name, MAX(department) AS department FROM pos_users WHERE user_id=? AND pos_id IN (${posIds.map(() => '?').join(',')})${teamFilter('user_id',team,true,unit)}`).bind(sellerId,...posIds).first<{name: string | null; department: string | null}>();
  const hideDept = !assignedVisible && !row
    ? (await env.DB.prepare('SELECT MAX(department) AS department FROM pos_users WHERE user_id=?').bind(sellerId).first<{department: string | null}>())?.department ?? ''
    : '';
  const assignedHidden = !assignedVisible && (row ? Boolean(row.assignedHidden) : /cskh|chăm sóc/i.test(hideDept));
  const kind = ms.rateBase === 'assigned' && !assignedHidden ? 'assigned' : 'created';
  const at = kind === 'assigned' ? 'o.seller_assigned_at' : 'o.created_at';
  const {startUtc, endUtc} = vnRangeUtc(start,end), f = orderFilterSql(filters,team,'o');
  const common = `o.pos_id IN (${posIds.map(() => '?').join(',')}) AND o.seller_id=? AND o.status_code<>7${f.sql}${teamFilter('o.seller_id',team,true,unit)}`;
  const binds = [...posIds,sellerId,...f.binds,startUtc,endUtc];
  const where = `${common} AND ${at}>=? AND ${at}<?`, closed = closedWhere(filters,'o.');
  const db = env.DB;
  const [counts, createdPhones, assignedPhones, open] = await db.batch([
    db.prepare(`SELECT o.status_code, COUNT(*) AS n, CASE WHEN ${closed} THEN 1 ELSE 0 END AS closed FROM raw_pos_orders o WHERE ${where} GROUP BY o.status_code`).bind(...binds),
    db.prepare(`SELECT COUNT(DISTINCT NULLIF(o.phone,'')) AS n FROM raw_pos_orders o WHERE ${common} AND o.created_at>=? AND o.created_at<?`).bind(...binds),
    db.prepare(`SELECT COUNT(DISTINCT NULLIF(o.phone,'')) AS n FROM raw_pos_orders o WHERE ${common} AND o.seller_assigned_at>=? AND o.seller_assigned_at<?`).bind(...binds),
    db.prepare(`SELECT o.id,o.source_order_id,o.pos_id,o.phone,o.customer_id,o.status_code,o.tags_json,o.note,COALESCE(o.net_total,COALESCE(o.current_total,0)-COALESCE(o.total_discount,0)) AS net, ${at} AS at, (SELECT MAX(name) FROM pos_users WHERE user_id=o.marketer_id) AS marketer_name FROM raw_pos_orders o WHERE ${where} AND NOT (${closed}) ORDER BY ${at} DESC,o.id DESC LIMIT 2000`).bind(...binds),
  ]);
  const rows = counts.results as {status_code: number; n: number; closed: number}[];
  const total = rows.reduce((s,r) => s+r.n,0), nClosed = rows.reduce((s,r) => s+(r.closed ? r.n : 0),0);
  const statuses = (Object.keys(STATUS_LABELS) as (keyof typeof STATUS_LABELS)[]).flatMap(key => {
    const group = rows.filter(r => groupOf(r.status_code) === key), n = group.reduce((s,r) => s+r.n,0);
    return n ? [{key,label: STATUS_LABELS[key],n,closed: group.every(r => Boolean(r.closed))}] : [];
  });
  const allOrders = open.results as Order[];
  const raw = p.get('limit');
  const value = raw ? Number(raw) : 200, limit = Number.isFinite(value) ? Math.max(1,Math.min(300,Math.trunc(value))) : 200;
  const selected = allOrders.slice(0,limit), batches = noteBatches(selected);
  const notes = batches.length ? await db.batch(batches.map(batch => db.prepare(`SELECT pos_id,customer_id,message,author_name,created_at FROM (SELECT *,ROW_NUMBER() OVER (PARTITION BY pos_id,customer_id ORDER BY created_at DESC,id DESC) AS rn FROM customer_notes WHERE TRIM(message, ' '||char(9)||char(10)||char(13)||char(160))<>'' AND (${batch.map(() => '(pos_id=? AND customer_id=?)').join(' OR ')})) WHERE rn=1`).bind(...batch.flatMap(pair => [pair.pos_id,pair.customer_id])))) : [];
  const noteMap = new Map(notes.flatMap(result => (result.results as Note[]).map(n => [JSON.stringify([n.pos_id,n.customer_id]),n] as const)));
  const textOut = (s: string | null) => s ? (assignedVisible ? s : maskPhonesIn(s)).slice(0,300) : null;
  const summaryOf = (row: typeof current) => row ? {
    orders: row.orders, closedOrders: row.closedOrders, closedNet: row.closedNet,
    averageOrder: row.averageOrder, assignedOrders: row.assignedOrders,
    assignedHidden: row.assignedHidden, rate: row.rate, rateTop: row.rateTop, rateDen: row.rateDen,
  } : null;
  const phoneCounts = {created: (createdPhones.results[0] as {n: number}).n, assigned: (assignedPhones.results[0] as {n: number}).n};
  return Response.json({
    person: {sellerId,name: person?.name ?? 'Nhân viên',department: person?.department ?? null},
    period: {start,end}, previous: report.comparePeriod, rateBase: ms.rateBase, assignedVisible,
    summary: current ? {...summaryOf(current),createdPhones: phoneCounts.created,assignedPhones: assignedHidden ? null : phoneCounts.assigned} : null,
    previousSummary: summaryOf(previous),
    base: {kind,total,closed: nClosed,open: total-nClosed}, statuses,
    ...aggregateReasons(allOrders), reasonsPartial: total-nClosed > allOrders.length,
    orders: selected.map(o => {
      const r = reasonOf(o.tags_json,o.note), n = noteMap.get(JSON.stringify([o.pos_id,o.customer_id]));
      const noteText = n?.message.trim() ? textOut(n.message) : null;
      return {id: o.id,orderId: o.source_order_id,posId: o.pos_id,posName: POS.find(pos => pos.id === o.pos_id)?.name ?? o.pos_id,phone: o.phone && !assignedVisible ? maskPhone(o.phone) : o.phone,at: o.at,statusCode: o.status_code,statusName: ORDER_STATUS[o.status_code] ?? '',group: groupOf(o.status_code),reason: r.reason,reasonKind: r.kind,tags: r.tags,note: textOut(o.note),customerNote: n && noteText !== null ? {text: noteText,by: n.author_name,at: n.created_at} : null,marketerName: o.marketer_name,net: o.net};
    }),
    hasMore: total-nClosed > selected.length,
    definitions: {...definitions,...(filters.productSegment !== 'all' ? {productFilter: 'Đang lọc nhóm đơn: trạng thái và lý do chỉ tính đơn thuộc nhóm này.'} : {})},
  }, {headers: {'Cache-Control': 'private, no-store'}});
}
