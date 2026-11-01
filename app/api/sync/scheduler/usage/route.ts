import { env } from 'cloudflare:workers';
import { forbidden, getSessionUser, unauthorized } from '@/lib/auth/auth';
import { isOwner } from '@/lib/auth/access';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!isOwner(user)) return forbidden();
  const stub = env.SYNC_SCHEDULER.get(env.SYNC_SCHEDULER.idFromName('main'));
  return Response.json(await stub.usage(), { headers: { 'Cache-Control': 'no-store' } });
}
