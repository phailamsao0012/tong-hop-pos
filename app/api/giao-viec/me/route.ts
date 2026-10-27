import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized, forbidden, type SessionUser } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { isBoss, webBossActor, type Actor } from '@/lib/zalo-work';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  return Response.json({ boss: await isBoss(env.DB, user) }, { headers: { 'Cache-Control': 'no-store' } });
}
export async function bossRoute(request: Request, run: (db: D1Database, actor: Actor, user: SessionUser) => Promise<unknown>, ownerOnly = false) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!await isBoss(env.DB, user) || ownerOnly && user.role !== 'owner') return forbidden('Chỉ người được cấp quyền giao việc mới dùng được phần này.');
  try {
    const actor = await webBossActor(env.DB, user);
    const result = await run(env.DB, actor, user);
    if (request.method !== 'GET') await audit({ request, userId: user.userId, action: `giao-viec.${request.method.toLowerCase()}`, target: new URL(request.url).pathname });
    return Response.json(result ?? { ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Không thực hiện được thao tác.' }, { status: 400 });
  }
}
