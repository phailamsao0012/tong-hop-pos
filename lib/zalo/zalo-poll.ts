import { env } from 'cloudflare:workers';
import { createZaloSender, pollZaloUpdates, type ZaloPollStats } from '@/lib/zalo/zalo';
import { handleZaloUpdate } from '@/lib/zalo/zalo-work';

/** Cron mỗi phút: lấy tin Zalo bằng getUpdates, hỏi liền tay ~64 giây để luôn có lượt đang chờ (Zalo không giữ tin). Không có mã bot thì không làm gì.
 *  Ghi tóm tắt lượt vào app_settings zalo_poll_v1 (một dòng, ghi đè) để nút "Bật nhận tin Zalo" hiện ra. */
export async function maybeZaloPoll() {
  const token = env.ZALO_BOT_TOKEN?.trim();
  if (env.DEMO_MODE === '1' || !token) return;
  const started = Date.now(), stats: ZaloPollStats = { calls: 0, got: 0, handled: 0, webhook: '', last: '', err: '', shape: '' };
  await pollZaloUpdates(token, async update => {
    const now = Date.now();
    await handleZaloUpdate(env.DB, update, createZaloSender(env.DB, now), now);
  }, undefined, undefined, stats);
  const at = new Date(started + 7 * 3600000).toISOString().slice(11, 19);
  const text = `lượt ${at} (giờ VN), ${Math.round((Date.now() - started) / 1000)} giây, ${stats.webhook}, hỏi ${stats.calls} lần, nhận ${stats.got} tin, xử lý ${stats.handled}${stats.shape ? `, ${stats.shape}` : ''}${stats.err ? `, lỗi: ${stats.err}` : ''}; lần cuối: ${stats.last || '-'}`;
  await env.DB.prepare("INSERT INTO app_settings (key,value,updated_at) VALUES ('zalo_poll_v1',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(text, new Date().toISOString()).run();
}
