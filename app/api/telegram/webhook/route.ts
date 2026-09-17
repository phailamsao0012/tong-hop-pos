import { env } from 'cloudflare:workers';
import { KEYBOARD, chatAllowed, handleCommand, splitMessage, type TelegramUpdate } from '@/lib/bot';
import { sendTelegram } from '@/lib/telegram';

// Telegram gọi vào đây khi có tin nhắn. Xác thực bằng header bí mật do setWebhook đăng ký.
export async function POST(request: Request) {
  const secret = env.TELEGRAM_WEBHOOK_SECRET?.trim();
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  if (!secret || !token || request.headers.get('x-telegram-bot-api-secret-token') !== secret)
    return new Response('forbidden', { status: 403 });
  let update: TelegramUpdate;
  try { update = await request.json() as TelegramUpdate; } catch { return Response.json({ ok: true }); }
  const message = update.message;
  const chatId = message?.chat?.id;
  const text = message?.text?.trim();
  if (!chatId || !text) return Response.json({ ok: true });
  const chat = String(chatId);
  const reply = async (html: string, keyboard = false) => {
    for (const part of splitMessage(html)) {
      try {
        await sendTelegramWithKeyboard(token, chat, part, keyboard);
      } catch (error) {
        console.error('telegram reply failed', error);
      }
    }
  };
  if (!(await chatAllowed(chat))) {
    await reply(`Chat này chưa được cấp quyền dùng bot. Chat ID: <code>${chat}</code>\nVào web → Cấu hình → Cảnh báo Telegram → "Cho phép chat" để bật.`);
    return Response.json({ ok: true });
  }
  try {
    const parts = await handleCommand(text);
    for (const p of parts) await reply(p, true);
  } catch (error) {
    console.error('bot command failed', error);
    await reply(`Lỗi khi tạo báo cáo: ${error instanceof Error ? error.message : String(error)}`);
  }
  return Response.json({ ok: true });
}

async function sendTelegramWithKeyboard(token: string, chatId: string, text: string, keyboard: boolean) {
  if (!keyboard) return sendTelegram(token, chatId, text);
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: KEYBOARD }),
    signal: AbortSignal.timeout(10000),
  });
  const result = await response.json() as { ok?: boolean; description?: string };
  if (!response.ok || !result.ok) throw new Error(result.description ?? `Telegram HTTP ${response.status}`);
}
