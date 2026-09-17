import { env } from 'cloudflare:workers';
import { runAlerts } from '@/lib/alerts';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { botInfo, recentChats, sendTelegram } from '@/lib/telegram';

const noStore = { headers: { 'Cache-Control': 'no-store' } };

// Trạng thái bot, Chat ID gợi ý, nhật ký cảnh báo gần đây.
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const log = await env.DB.prepare('SELECT kind,employee_id,day,sent_at,message,ok,error FROM alert_log WHERE owner_id=? ORDER BY sent_at DESC LIMIT 30')
    .bind(user.userId).all<Record<string, unknown>>();
  let bot: { username?: string; first_name?: string } | null = null, chats: { id: string; type: string; name: string }[] = [], botError: string | null = null;
  if (token) {
    try { [bot, chats] = await Promise.all([botInfo(token), recentChats(token)]); }
    catch (e) { botError = e instanceof Error ? e.message : String(e); }
  }
  return Response.json({ hasToken: !!token, bot, botError, chats, log: log.results }, noStore);
}

// action=test: gửi tin thử tới Chat ID; action=preview: đánh giá quy tắc hiện tại (không gửi).
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  let body: { action?: string; chatId?: string };
  try { body = await request.json(); } catch { return Response.json({ error: 'JSON không hợp lệ.' }, { status: 400 }); }
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
