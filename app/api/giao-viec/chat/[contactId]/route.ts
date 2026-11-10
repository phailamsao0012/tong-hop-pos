import { bossRoute } from '../../me/route';
import { listMessages, markRead, sendChat } from '@/lib/zalo/zalo-chat';
import { createZaloSender } from '@/lib/zalo/zalo';
type Context = { params: Promise<{ contactId: string }> };
export async function GET(request: Request, context: Context) {
  return bossRoute(request, async db => {
    const p = new URL(request.url).searchParams, id = (await context.params).contactId;
    const data = await listMessages(db, id, { after: p.get('after'), before: p.get('before') });
    // Đang mở chat (không phải tải thêm tin cũ) thì coi như đã đọc; câu UPDATE chỉ đọc các tin chưa đọc qua chỉ mục.
    if (!p.get('before')) await markRead(db, id);
    return data;
  });
}
export async function POST(request: Request, context: Context) {
  return bossRoute(request, async (db, actor) => {
    const input = await request.json() as { text?: unknown };
    return sendChat(db, actor, (await context.params).contactId, input.text, Date.now(), createZaloSender(db));
  });
}
