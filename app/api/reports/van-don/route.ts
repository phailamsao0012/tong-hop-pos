import { resolveMktLens, lensDatabase } from '@/lib/shared/scope-filter';
import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth/auth';
import { POS } from '@/lib/shared/report-model';
import { DATE_RE } from '@/lib/shared/report-time';
import { parseTeam } from '@/lib/teams/team';
import { resolveBranchUnit as resolveHrUnit } from '@/lib/shared/scope-filter';
import { sentAtReady } from '@/lib/reports/stats';
import { vanDonCard, vanDonReport } from '@/lib/reports/van-don-report';

// Đo team Vận đơn (lib/reports/van-don-report.ts).
export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized();
  const p = new URL(request.url).searchParams;
  const start = p.get('start') ?? '', end = p.get('end') ?? '';
  if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end) return Response.json({ error: 'Khoảng ngày không hợp lệ.' }, { status: 400 });
  const validPos = new Set<string>(POS.map((x) => x.id));
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !validPos.has(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  const posIds = requested.length ? requested : POS.map((x) => x.id);
  const lens = await resolveMktLens(env.DB, p);
  if (lens instanceof Response) return lens;
  const db = lensDatabase(env.DB, lens);
  // ?hrTeam=<mã team web nhân sự>: chỉ đơn có người lên đơn thuộc team đó (người xác nhận là ai cũng giữ, để thấy Vận đơn xử lý đơn của team).
  const unitScope = await resolveHrUnit(p, parseTeam(p.get('team')));
  if (unitScope instanceof Response) return unitScope;
  const bySent = await sentAtReady(db);
  const card = p.get('card');
  if (card) {
    const r = await vanDonCard(db, posIds, start, end, unitScope.unit, bySent, card, p.get('offset'));
    if (!r) return Response.json({ error: 'Bước không hợp lệ.' }, { status: 400 });
    return Response.json(r);
  }
  return Response.json(await vanDonReport(db, posIds, start, end, unitScope, bySent));
}
