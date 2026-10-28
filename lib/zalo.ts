// Mọi lần gọi Zalo đi qua đây; demo chỉ ghi hộp thư D1.
import { env } from 'cloudflare:workers';

export async function webhookSecret(token: string) {
  const bytes = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', bytes.encode(token), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, bytes.encode('zalo-webhook-v1'))), b => b.toString(16).padStart(2, '0')).join('');
}
async function call(token: string, method: string, body: unknown, timeoutMs = 10000) {
  const response = await fetch(`https://bot-api.zaloplatforms.com/bot${token}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
  });
  const result = await response.json() as { ok?: boolean; result?: unknown };
  if (!response.ok || result.ok !== true) throw new Error('Zalo từ chối yêu cầu.');
  return result;
}
export async function sendZalo(token: string | undefined, chatId: string, text: string, db: D1Database = env.DB, now = Date.now()) {
  if (env.DEMO_MODE === '1') {
    const row = await db.prepare("SELECT value FROM app_settings WHERE key='demo_zalo_outbox'").first<{ value: string }>();
    const outbox = row ? JSON.parse(row.value) as unknown[] : [];
    const contact = await db.prepare('SELECT name FROM zalo_contacts WHERE chat_id=? AND active=1').bind(chatId).first<{ name: string }>();
    outbox.push({ to: chatId, name: contact?.name ?? '', text: text.slice(0, 2000), at: new Date(now).toISOString() });
    await db.prepare("INSERT INTO app_settings (key,value,updated_at) VALUES ('demo_zalo_outbox',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(JSON.stringify(outbox.slice(-100)), new Date(now).toISOString()).run();
    return { ok: true };
  }
  if (!token?.trim()) return { skipped: true };
  try { return await call(token.trim(), 'sendMessage', { chat_id: chatId, text: text.slice(0, 2000) }); }
  catch { console.error('zalo send failed'); return { ok: false }; }
}
export async function setWebhook(token: string | undefined, url: string) {
  if (env.DEMO_MODE === '1' || !token?.trim()) return { skipped: true };
  try { return await call(token.trim(), 'setWebhook', { url, secret_token: await webhookSecret(token.trim()) }); }
  catch { console.error('zalo webhook setup failed'); return { ok: false }; }
}
/** Chuyển sang nhận tin bằng getUpdates: Zalo không gọi được webhook vào *.workers.dev, còn .io.vn hay lỗi DNSSEC. */
export async function deleteWebhook(token: string | undefined) {
  if (env.DEMO_MODE === '1' || !token?.trim()) return { skipped: true };
  try { return await call(token.trim(), 'deleteWebhook', {}); }
  catch { console.error('zalo webhook delete failed'); return { ok: false }; }
}
/** Mỗi phút cron gọi getUpdates (long polling) tới khi hết quỹ giờ; mỗi tin đưa vào handle dạng { result: tin }. */
export async function pollZaloUpdates(token: string | undefined, handle: (update: unknown) => Promise<void>, budgetMs = 45000, waitSec = 15) {
  if (env.DEMO_MODE === '1' || !token?.trim()) return 0;
  const end = Date.now() + budgetMs;
  let handled = 0;
  while (Date.now() + waitSec * 1000 + 5000 <= end) {
    let result: unknown;
    try { result = (await call(token.trim(), 'getUpdates', { timeout: String(waitSec) }, (waitSec + 5) * 1000)).result; }
    catch { return handled; }
    const items = Array.isArray(result) ? result : result && typeof result === 'object' ? [result] : [];
    if (!items.length) continue;
    for (const item of items) {
      try { await handle({ result: item }); handled++; } catch { console.error('zalo update failed'); }
    }
  }
  return handled;
}
/** Một lượt xử lý gửi tối đa 30 tin, cách nhau ít nhất 300 ms. */
export function createZaloSender(db: D1Database, now = Date.now()) {
  let count = 0;
  let tail = Promise.resolve();
  return (chatId: string, text: string) => {
    if (count >= 30) return Promise.resolve();
    const index = count++;
    const job = tail.then(async () => {
      if (index) await new Promise(resolve => setTimeout(resolve, 300));
      await sendZalo(env.ZALO_BOT_TOKEN, chatId, text, db, now);
    });
    tail = job.catch(() => { console.error('zalo outbox failed'); });
    return tail;
  };
}
