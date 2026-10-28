import { env } from 'cloudflare:workers';
import { bossRoute } from '../../me/route';
import { createZaloSender, zaloDiagnose } from '@/lib/zalo';
import { handleZaloUpdate } from '@/lib/zalo-work';
// Web nhận tin bằng getUpdates mỗi phút (lib/zalo-poll.ts); nút này gỡ webhook cũ, thử lấy tin một lần và trả tóm tắt để kiểm.
export async function POST(request: Request) {
  return bossRoute(request, async db => zaloDiagnose(env.ZALO_BOT_TOKEN, async update => { const now = Date.now(); await handleZaloUpdate(db, update, createZaloSender(db, now), now); }, db), true);
}
