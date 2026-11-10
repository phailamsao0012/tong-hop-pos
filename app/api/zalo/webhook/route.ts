import { env } from 'cloudflare:workers';
import { sameSecret } from '@/lib/bot/bot-guard-core';
import { createZaloSender, webhookSecret } from '@/lib/zalo/zalo';
import { handleZaloUpdate } from '@/lib/zalo/zalo-work';

export async function POST(request: Request) {
  const token = env.ZALO_BOT_TOKEN?.trim();
  if (!token || !sameSecret(await webhookSecret(token), request.headers.get('X-Bot-Api-Secret-Token')))
    return new Response('unauthorized', { status: 401 });
  try {
    const now = Date.now();
    await handleZaloUpdate(env.DB, await request.json(), createZaloSender(env.DB, now), now);
  } catch { console.error('zalo webhook failed'); }
  return Response.json({ ok: true });
}
