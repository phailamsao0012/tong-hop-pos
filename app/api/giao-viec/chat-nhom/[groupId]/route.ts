import { bossRoute } from '../../me/route';
import { groupMessages, sendGroup } from '@/lib/zalo-chat';
import { createZaloSender } from '@/lib/zalo';
type Context = { params: Promise<{ groupId: string }> };
export async function GET(request: Request, context: Context) {
  return bossRoute(request, async db => { const p = new URL(request.url).searchParams; return groupMessages(db, (await context.params).groupId, { after: p.get('after'), before: p.get('before') }); });
}
export async function POST(request: Request, context: Context) {
  return bossRoute(request, async (db, actor) => sendGroup(db, actor, (await context.params).groupId, (await request.json() as { text?: unknown }).text, Date.now(), createZaloSender(db)));
}
