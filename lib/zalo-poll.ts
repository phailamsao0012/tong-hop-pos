import { env } from 'cloudflare:workers';
import { createZaloSender, pollZaloUpdates } from './zalo';
import { handleZaloUpdate } from './zalo-work';

/** Cron mỗi phút: lấy tin Zalo bằng getUpdates. Không có mã bot thì không làm gì. */
export async function maybeZaloPoll() {
  const token = env.ZALO_BOT_TOKEN?.trim();
  if (env.DEMO_MODE === '1' || !token) return;
  await pollZaloUpdates(token, async update => {
    const now = Date.now();
    await handleZaloUpdate(env.DB, update, createZaloSender(env.DB, now), now);
  });
}
