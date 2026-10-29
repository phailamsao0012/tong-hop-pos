import { bossRoute } from '../../../me/route';
import { remindInChat } from '@/lib/zalo-chat';
import { createZaloSender } from '@/lib/zalo';
type Context = { params: Promise<{ contactId: string }> };
export async function POST(request: Request, context: Context) {
  return bossRoute(request, async (db, actor) => remindInChat(db, actor, (await context.params).contactId, await request.json() as { kind?: unknown; no?: unknown }, Date.now(), createZaloSender(db)));
}
