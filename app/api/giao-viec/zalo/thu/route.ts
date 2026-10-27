import { env } from 'cloudflare:workers';
import { bossRoute } from '../../me/route';
import { listContacts, handleZaloUpdate } from '@/lib/zalo-work';
import { createZaloSender } from '@/lib/zalo';
export async function POST(request: Request) {
  return bossRoute(request, async db => {
    if (env.DEMO_MODE !== '1') throw new Error('Chỉ dùng trong demo.');
    const input = await request.json() as { contactId: string; text: string };
    const contact = (await listContacts(db)).find(c => c.id === input.contactId && c.active && c.chat_id);
    if (!contact) throw new Error('Người này chưa nối Zalo.');
    await handleZaloUpdate(db, { message: { chat: { id: contact.chat_id }, text: input.text } }, createZaloSender(db));
  });
}
