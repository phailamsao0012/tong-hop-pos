import { env } from 'cloudflare:workers';
import { mentorReport } from '@/lib/teams/staff-scope';
import { getSessionUser, unauthorized } from '@/lib/auth/auth';
import { customer360 } from '@/lib/reports/customer360';
import { POS } from '@/lib/shared/report-model';

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (user.role === 'mentor' && !user.teamScope) return mentorReport(env.DB, user, request);
  const p = new URL(request.url).searchParams;
  const valid = new Set<string>(POS.map((x) => x.id));
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !valid.has(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  return Response.json(await customer360({ posIds: requested.length ? requested : [...valid] }), { headers: { 'Cache-Control': 'private, no-store' } });
}
