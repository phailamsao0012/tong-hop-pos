import { getSessionUser, unauthorized } from '@/lib/auth/auth';
import { defaultBucket, mktTrend } from '@/lib/reports/mkt-trend';
import { POS } from '@/lib/shared/report-model';
import { DATE_RE, daysBetween } from '@/lib/shared/report-time';

export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized();
  const p = new URL(request.url).searchParams;
  const start = p.get('start') ?? '', end = p.get('end') ?? '';
  const validDay = (d: string) => DATE_RE.test(d) && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d;
  if (!validDay(start) || !validDay(end) || start > end || daysBetween(start, end) > 3660) return Response.json({ error: 'Khoảng ngày không hợp lệ.' }, { status: 400 });
  const valid = POS.map(x => x.id as string), asked = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (asked.some(id => !valid.includes(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  if (p.get('branch')) return Response.json({ error: 'Bộ lọc chi nhánh chưa được hỗ trợ.' }, { status: 400 });
  const bucket = p.get('bucket') ?? defaultBucket(start, end);
  if (bucket !== 'day' && bucket !== 'week' && bucket !== 'month') return Response.json({ error: 'Đoạn thời gian không hợp lệ.' }, { status: 400 });
  return Response.json(await mktTrend({ start, end, posIds: asked.length ? asked : valid, marketerId: p.get('marketerId'), teamId: p.get('teamId'), bucket, team: p.get('team') ?? 'all' }), { headers: { 'Cache-Control': 'private, no-store' } });
}
