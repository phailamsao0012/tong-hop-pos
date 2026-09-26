import { getSessionUser, unauthorized } from '@/lib/auth';
import { customer360 } from '@/lib/customer360';
import { POS } from '@/lib/report-model';

export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized();
  const p = new URL(request.url).searchParams;
  const valid = new Set<string>(POS.map((x) => x.id));
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !valid.has(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  return Response.json(await customer360({ posIds: requested.length ? requested : [...valid] }), { headers: { 'Cache-Control': 'private, no-store' } });
}
