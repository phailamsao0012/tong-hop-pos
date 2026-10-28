import { env } from 'cloudflare:workers';
import { bossRoute } from '../../me/route';
import { deleteWebhook } from '@/lib/zalo';
// Web nhận tin bằng getUpdates mỗi phút (lib/zalo-poll.ts); nút này gỡ webhook cũ để getUpdates chạy được.
export async function POST(request: Request) { return bossRoute(request, async () => deleteWebhook(env.ZALO_BOT_TOKEN), true); }
