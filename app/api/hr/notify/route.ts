import { env } from 'cloudflare:workers';
import { HR_SECRET_HEADER, secretMatches } from '@/lib/hr-link';
import { recruitChatIds } from '@/lib/recruit';
import { sendTelegram } from '@/lib/telegram';

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Web nhân sự gửi thông báo (chờ duyệt, đã duyệt, nghỉ việc) qua bot Telegram của web chính, tới các chat nhận tin tuyển dụng / nhân sự
// (chat admin của bot, trừ chat đã /tuyendung tat, cộng chat đã /tuyendung bat). Nội dung là chữ thường, web chính tự thoát HTML.
export async function POST(request: Request) {
  if (!secretMatches(env.HR_SHARED_SECRET, request.headers.get(HR_SECRET_HEADER))) return Response.json({ error: 'Sai bí mật liên kết.' }, { status: 403 });
  const body = await request.json().catch(() => null) as { title?: unknown; text?: unknown; link?: unknown } | null;
  const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 120) : '';
  const text = typeof body?.text === 'string' ? body.text.trim().slice(0, 1500) : '';
  const link = typeof body?.link === 'string' && /^https:\/\/crm\.tonghopposmegatech\.io\.vn\//.test(body.link) ? body.link : null;
  if (!text) return Response.json({ error: 'Thiếu nội dung.' }, { status: 400 });
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return Response.json({ ok: false, sent: 0, error: 'Chưa cấu hình bot Telegram.' });
  const message = `${title ? `<b>${escape(title)}</b>\n` : ''}${escape(text)}${link ? `\n<a href="${link}">Mở web nhân sự</a>` : ''}`;
  let sent = 0;
  for (const chat of await recruitChatIds()) {
    try { await sendTelegram(token, chat, message); sent++; } catch (error) { console.error('hr notify failed', chat, error); }
  }
  return Response.json({ ok: true, sent });
}
