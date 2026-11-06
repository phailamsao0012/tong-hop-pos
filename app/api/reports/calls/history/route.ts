import { getSessionUser, unauthorized } from '@/lib/auth/auth';
import { POS } from '@/lib/shared/report-model';
import { DATE_RE } from '@/lib/shared/report-time';
import { callsHistory } from '@/lib/reports/calls-history';

// Lịch sử cuộc gọi của một nhân viên (lib/reports/calls-history.ts).
export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized();
  const p = new URL(request.url).searchParams;
  const authorId = (p.get('authorId') ?? '').slice(0, 100);
  const start = p.get('start') ?? '', end = p.get('end') ?? '';
  if (!authorId || !DATE_RE.test(start) || !DATE_RE.test(end) || start > end) return Response.json({ error: 'Thiếu nhân viên hoặc khoảng ngày không hợp lệ.' }, { status: 400 });
  const validPos = new Set<string>(POS.map((x) => x.id));
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !validPos.has(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  const posIds = requested.length ? requested : POS.map((x) => x.id);
  return Response.json(await callsHistory(authorId, start, end, posIds), { headers: { 'Cache-Control': 'private, no-store' } });
}
