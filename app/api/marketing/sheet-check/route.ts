import { getSessionUser, unauthorized } from '@/lib/auth/auth';
import { mktSheetCheck } from '@/lib/ops/mkt-sheet-check';
import { POS } from '@/lib/shared/report-model';
import { DATE_RE } from '@/lib/shared/report-time';
import { parseTeam } from '@/lib/teams/team';

// Đối chiếu số MKT trên sheet CPQC Daily với đơn Pancake (lib/mkt-sheet-check.ts). Cùng quyền với số chính Marketing (/api/marketing/analytics).
export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized();
  const p = new URL(request.url).searchParams;
  const start = p.get('start') ?? '', end = p.get('end') ?? '';
  if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end) return Response.json({ error: 'Khoảng ngày không hợp lệ.' }, { status: 400 });
  const valid = new Set<string>(POS.map((x) => x.id));
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !valid.has(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  return Response.json(await mktSheetCheck({ posIds: requested.length ? requested : [...valid], start, end, team: parseTeam(p.get('team')) }), { headers: { 'Cache-Control': 'private, no-store' } });
}
