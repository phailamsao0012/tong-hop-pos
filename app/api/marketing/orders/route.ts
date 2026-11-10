import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth/auth';
import { ORDER_STATUS } from '@/lib/pancake/pancake';
import { mktOrders } from '@/lib/reports/mkt-orders';
import { POS } from '@/lib/shared/report-model';
import { DATE_RE, vnRangeUtc } from '@/lib/shared/report-time';
import { mktTeams } from '@/lib/teams/mkt-teams-source';

/** Đơn sau ô "x đơn" (DT New / DT CSKH) của một marketer hoặc một team MKT. */
export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized();
  const p = new URL(request.url).searchParams;
  const start = p.get('start') ?? '', end = p.get('end') ?? '', kind = p.get('kind');
  if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end) return Response.json({ error: 'Khoảng ngày không hợp lệ.' }, { status: 400 });
  if (kind !== 'new' && kind !== 'cskh') return Response.json({ error: 'Loại đơn không hợp lệ.' }, { status: 400 });
  const valid = new Set<string>(POS.map((x) => x.id));
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !valid.has(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  const posIds = requested.length ? requested : [...valid];
  const marketerId = (p.get('marketerId') ?? '').trim().slice(0, 120), teamId = (p.get('teamId') ?? '').trim().slice(0, 120);
  const db = env.DB;
  let marketerIds = marketerId ? [marketerId] : [];
  if (!marketerId && teamId) marketerIds = (await mktTeams(db)).teams.find((t) => t.id === teamId)?.memberIds ?? [];
  if (!marketerIds.length) return Response.json({ orders: [], more: false });
  const { startUtc, endUtc } = vnRangeUtc(start, end);
  const body = await mktOrders(db, { posIds, marketerIds, kind, startUtc, endUtc, posName: (id) => POS.find((x) => x.id === id)?.name ?? id, status: (c) => ORDER_STATUS[c] ?? String(c) });
  return Response.json(body, { headers: { 'Cache-Control': 'private, no-store' } });
}
