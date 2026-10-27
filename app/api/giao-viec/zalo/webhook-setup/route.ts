import { env } from 'cloudflare:workers';
import { bossRoute } from '../../me/route';
import { setWebhook } from '@/lib/zalo';
export async function POST(request: Request) { return bossRoute(request, async () => setWebhook(env.ZALO_BOT_TOKEN, new URL('/api/zalo/webhook', request.url).href), true); }
