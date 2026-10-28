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
type ZaloRaw = { ok?: boolean; result?: unknown; error_code?: unknown; description?: unknown };
async function raw(token: string, method: string, body: unknown, timeoutMs = 10000): Promise<{ http: number; body: ZaloRaw | string }> {
  try {
    const response = await fetch(`https://bot-api.zaloplatforms.com/bot${token}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await response.text();
    try { return { http: response.status, body: JSON.parse(text) as ZaloRaw }; } catch { return { http: response.status, body: text.slice(0, 200) }; }
  } catch (error) { return { http: 0, body: error instanceof Error ? error.message.slice(0, 200) : 'lỗi mạng' }; }
}
function brief(r: { http: number; body: ZaloRaw | string }) {
  if (typeof r.body === 'string') return `HTTP ${r.http}: ${r.body}`;
  const b = r.body, res = b.result;
  const shape = Array.isArray(res) ? `mảng ${res.length} tin` : res && typeof res === 'object' ? `đối tượng {${Object.keys(res).join(',')}}` : String(res);
  return `HTTP ${r.http} ok=${String(b.ok)}${b.error_code !== undefined ? ` mã=${String(b.error_code)}` : ''}${b.description ? ` (${String(b.description).slice(0, 120)})` : ''} · ${shape}`;
}
/** Mỗi phút cron gọi getUpdates (long polling) tới khi hết quỹ giờ; mỗi tin đưa vào handle dạng { result: tin }.
 *  Theo bot order đang chạy được: mỗi lượt gỡ webhook trước (còn webhook thì getUpdates luôn lỗi),
 *  lỗi "timeout / no update" lúc không có tin thì hỏi tiếp, lỗi khác mới dừng. */
export async function pollZaloUpdates(token: string | undefined, handle: (update: unknown) => Promise<void>, budgetMs = 45000, waitSec = 8) {
  if (env.DEMO_MODE === '1' || !token?.trim()) return 0;
  const t = token.trim(), end = Date.now() + budgetMs;
  const del = await raw(t, 'deleteWebhook', {});
  if (typeof del.body !== 'object' || del.body.ok !== true) console.log('zalo poll: deleteWebhook', brief(del));
  let handled = 0;
  while (Date.now() + waitSec * 1000 + 3000 <= end) {
    const started = Date.now();
    const r = await raw(t, 'getUpdates', { timeout: String(waitSec) }, (waitSec + 5) * 1000);
    if (typeof r.body !== 'object' || r.body.ok !== true) {
      const why = typeof r.body === 'object' ? String(r.body.description ?? '') : r.body;
      if (r.http !== 0 && /timeout|time out|no update/i.test(why)) continue;
      console.log('zalo poll: getUpdates', brief(r));
      return handled;
    }
    const res = r.body.result;
    const items = Array.isArray(res) ? res : res && typeof res === 'object' ? [res] : [];
    for (const item of items) {
      try { await handle({ result: item }); handled++; } catch { console.error('zalo update failed'); }
    }
    if (!items.length && Date.now() - started < 1000) await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return handled;
}
/** Nút "Bật nhận tin Zalo": gỡ webhook, xem webhook còn không, thử lấy tin một lần; trả về tóm tắt để biết Zalo trả gì (không có token trong kết quả). */
export async function zaloDiagnose(token: string | undefined, handle: (update: unknown) => Promise<void>) {
  if (env.DEMO_MODE === '1' || !token?.trim()) return { skipped: true };
  const t = token.trim();
  const del = await raw(t, 'deleteWebhook', {});
  const info = await raw(t, 'getWebhookInfo', {});
  const poll = await raw(t, 'getUpdates', { timeout: '3' }, 10000);
  let handled = 0;
  if (typeof poll.body === 'object' && poll.body.ok === true) {
    const res = poll.body.result;
    for (const item of Array.isArray(res) ? res : res && typeof res === 'object' ? [res] : []) { try { await handle({ result: item }); handled++; } catch { console.error('zalo update failed'); } }
  }
  const ok = typeof del.body === 'object' && del.body.ok === true;
  return { ok, steps: [`Gỡ webhook: ${brief(del)}`, `Webhook hiện tại: ${brief(info)}`, `Lấy tin thử: ${brief(poll)}`, `Đã xử lý ${handled} tin`] };
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
