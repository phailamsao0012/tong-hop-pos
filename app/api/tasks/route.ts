import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized, forbidden } from '@/lib/auth';
import { buildMyTasks, loadTaskData, scopeAllowed, type TaskScope } from '@/lib/my-tasks';
import { demoTaskData } from '@/lib/demo/my-tasks';

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const raw = new URL(request.url).searchParams.get('scope') ?? 'mine';
  if (!['mine', 'team', 'all'].includes(raw)) return Response.json({ error: 'Phạm vi không hợp lệ.' }, { status: 400 });
  const scope = raw as TaskScope;
  if (!scopeAllowed(user, scope)) return forbidden('Bạn không được xem phạm vi việc này.');
  const now = Date.now();
  const data = env.DEMO_MODE === '1' ? await demoTaskData(env.DB, user, scope, now) : await loadTaskData(env.DB, user, scope, now, new URL(request.url).origin);
  return Response.json(buildMyTasks(data, user, now), { headers: { 'Cache-Control': 'private, max-age=60' } });
}
