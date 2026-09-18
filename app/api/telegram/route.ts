import { env } from 'cloudflare:workers';
import { runAlerts } from '@/lib/alerts';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { pairingCode } from '@/lib/bot-menu';
import { allowChat, hasBotPassword, listRequests, removeChat, setBotPassword } from '@/lib/bot-access';
import { validPassword } from '@/lib/auth';
import { botInfo, recentChats, sendTelegram, setWebhook, webhookInfo } from '@/lib/telegram';

const noStore = { headers: { 'Cache-Control': 'no-store' } };

// Trạng thái bot, Chat ID gợi ý, nhật ký cảnh báo gần đây.
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  // quick=1: chỉ đọc D1 (danh sách chat, yêu cầu, mật khẩu), bỏ qua gọi Telegram — dùng khi web vừa đổi quyền để cập nhật ngay.
  const quick = new URL(request.url).searchParams.get('quick') === '1';
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const log = await env.DB.prepare('SELECT kind,employee_id,day,sent_at,message,ok,error FROM alert_log WHERE owner_id=? ORDER BY sent_at DESC LIMIT 30')
    .bind(user.userId).all<Record<string, unknown>>();
  const allowed = await env.DB.prepare('SELECT chat_id,name,added_at,role FROM telegram_chats ORDER BY added_at').all<{ chat_id: string; name: string; added_at: string; role: string }>();
  const [requests, hasPassword] = await Promise.all([listRequests(), hasBotPassword()]);
  let bot: { username?: string; first_name?: string } | null = null, chats: { id: string; type: string; name: string }[] = [], botError: string | null = null;
  let webhook: { url?: string; last_error_message?: string; pending_update_count?: number } = {};
  if (token && !quick) {
    try { [bot, chats, webhook] = await Promise.all([botInfo(token), recentChats(token), webhookInfo(token)]); }
    catch (e) { botError = e instanceof Error ? e.message : String(e); }
  }
  return Response.json({ hasToken: !!token, hasWebhookSecret: !!env.TELEGRAM_WEBHOOK_SECRET, bot, botError, chats, webhook, allowed: allowed.results, requests, hasPassword, log: log.results, pairingCode: await pairingCode() }, noStore);
}

// action=test: gửi tin thử tới Chat ID; action=preview: đánh giá quy tắc hiện tại (không gửi).
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  let body: { action?: string; chatId?: string; name?: string; role?: string; password?: string };
  try { body = await request.json(); } catch { return Response.json({ error: 'JSON không hợp lệ.' }, { status: 400 }); }
  if (body.action === 'allow' || body.action === 'disallow') {
    const chatId = (body.chatId ?? '').trim();
    if (!/^-?\d{4,20}$/.test(chatId)) return Response.json({ error: 'Chat ID không hợp lệ.' }, { status: 400 });
    if (body.action === 'allow') await allowChat(chatId, body.name ?? '', user.userId, body.role === 'admin' ? 'admin' : 'member');
    else await removeChat(chatId);
    return Response.json({ ok: true });
  }
  if (body.action === 'password') {
    if (user.role !== 'admin') return Response.json({ error: 'Chỉ quản trị viên mới đặt mật khẩu bot.' }, { status: 403 });
    const password = (body.password ?? '').trim();
    if (password && !validPassword(password)) return Response.json({ error: 'Mật khẩu bot cần từ 8 ký tự.' }, { status: 400 });
    await setBotPassword(password || null);
    return Response.json({ ok: true, hasPassword: !!password });
  }
  if (body.action === 'webhook') {
    const token = env.TELEGRAM_BOT_TOKEN?.trim(), secret = env.TELEGRAM_WEBHOOK_SECRET?.trim();
    if (!token || !secret) return Response.json({ error: 'Thiếu TELEGRAM_BOT_TOKEN hoặc TELEGRAM_WEBHOOK_SECRET.' }, { status: 400 });
    const url = new URL(request.url);
    try {
      await setWebhook(token, `${url.origin}/api/telegram/webhook`, secret);
      return Response.json({ ok: true, webhook: await webhookInfo(token) });
    } catch (e) { return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 }); }
  }
  if (body.action === 'preview') {
    const runs = await runAlerts(env, new Date(), { dryRun: true, ownerId: user.userId });
    return Response.json({ runs }, noStore);
  }
  if (body.action === 'test') {
    const token = env.TELEGRAM_BOT_TOKEN?.trim();
    const chatId = (body.chatId ?? '').trim();
    if (!token) return Response.json({ error: 'Chưa có TELEGRAM_BOT_TOKEN.' }, { status: 400 });
    if (!/^-?\d{4,20}$/.test(chatId)) return Response.json({ error: 'Chat ID phải là dãy số (có thể bắt đầu bằng dấu trừ).' }, { status: 400 });
    const message = `✅ Tổng hợp POS đã kết nối Telegram.\nCảnh báo tỷ lệ chốt sẽ gửi vào đây trong ca làm.`;
    try {
      await sendTelegram(token, chatId, message);
      await env.DB.prepare('INSERT INTO alert_log (id,owner_id,kind,employee_id,day,sent_at,message,ok,error) VALUES (?,?,?,?,?,?,?,1,NULL)')
        .bind(crypto.randomUUID(), user.userId, 'test', null, new Date().toISOString().slice(0, 10), new Date().toISOString(), message).run();
      return Response.json({ ok: true });
    } catch (e) {
      return Response.json({ error: `Gửi thất bại: ${e instanceof Error ? e.message : String(e)}` }, { status: 502 });
    }
  }
  return Response.json({ error: 'Hành động không hợp lệ.' }, { status: 400 });
}
