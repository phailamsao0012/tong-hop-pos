import { env } from 'cloudflare:workers';
import { chatAllowed, handleCommand, splitMessage, type TelegramUpdate } from '@/lib/bot';
import { MAIN_MENU, handleCallback, startScreen, tryPairing } from '@/lib/bot-menu';
import { answerCallback, editMessage, sendWithMarkup } from '@/lib/telegram';

// Telegram gọi vào đây khi có tin nhắn / bấm nút. Xác thực bằng header bí mật do setWebhook đăng ký.
export async function POST(request: Request) {
  const secret = env.TELEGRAM_WEBHOOK_SECRET?.trim();
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  if (!secret || !token || request.headers.get('x-telegram-bot-api-secret-token') !== secret)
    return new Response('forbidden', { status: 403 });
  let update: TelegramUpdate;
  try { update = await request.json() as TelegramUpdate; } catch { return Response.json({ ok: true }); }

  const send = async (chatId: string, html: string, markup?: unknown) => {
    const parts = splitMessage(html);
    for (let i = 0; i < parts.length; i++) {
      try { await sendWithMarkup(token, chatId, parts[i], i === parts.length - 1 ? markup : undefined); }
      catch (error) { console.error('telegram reply failed', error); }
    }
  };

  // Bấm nút: sửa tin nhắn tại chỗ.
  const cb = update.callback_query;
  if (cb?.data && cb.message?.chat?.id) {
    const chatId = String(cb.message.chat.id);
    await answerCallback(token, cb.id ?? '');
    if (!(await chatAllowed(chatId))) { await send(chatId, notAllowed(chatId)); return Response.json({ ok: true }); }
    try {
      const { text, keyboard } = await handleCallback(cb.data, cb.from?.first_name ?? 'bạn');
      const parts = splitMessage(text);
      try { await editMessage(token, chatId, cb.message.message_id ?? 0, parts[0], parts.length === 1 ? keyboard : undefined); }
      catch { await send(chatId, parts[0], parts.length === 1 ? keyboard : undefined); }
      for (const p of parts.slice(1)) await send(chatId, p, p === parts.at(-1) ? keyboard : undefined);
    } catch (error) {
      console.error('bot callback failed', error);
      await send(chatId, `Lỗi khi tạo báo cáo: ${error instanceof Error ? error.message : String(error)}`, MAIN_MENU);
    }
    return Response.json({ ok: true });
  }

  const message = update.message;
  const chatId = message?.chat?.id;
  const text = message?.text?.trim();
  if (!chatId || !text) return Response.json({ ok: true });
  const chat = String(chatId);
  const chatName = message.chat?.title ?? [message.chat?.first_name, message.chat?.last_name].filter(Boolean).join(' ') ?? chat;
  const userName = message.from?.first_name ?? chatName;

  // /start <mã ghép nối> → cấp quyền cho chat này.
  const startMatch = text.match(/^\/start(?:@\w+)?\s+(\d{6})$/);
  if (startMatch && await tryPairing(chat, chatName, startMatch[1])) {
    const s = await startScreen(userName);
    await send(chat, `✅ Đã kết nối chat này với Tổng hợp POS.\n\n${s.text}`, s.keyboard);
    return Response.json({ ok: true });
  }
  if (!(await chatAllowed(chat))) { await send(chat, notAllowed(chat)); return Response.json({ ok: true }); }

  try {
    if (/^\/(start|menu)(@\w+)?$/.test(text)) {
      const s = await startScreen(userName);
      await send(chat, s.text, s.keyboard);
    } else {
      const parts = await handleCommand(text);
      for (let i = 0; i < parts.length; i++) await send(chat, parts[i], i === parts.length - 1 ? MAIN_MENU : undefined);
    }
  } catch (error) {
    console.error('bot command failed', error);
    await send(chat, `Lỗi khi tạo báo cáo: ${error instanceof Error ? error.message : String(error)}`, MAIN_MENU);
  }
  return Response.json({ ok: true });
}

const notAllowed = (chatId: string) =>
  `Chat này chưa được kết nối với Tổng hợp POS.\nChat ID: <code>${chatId}</code>\n\nCách kết nối: mở web → Cấu hình & kết nối → Cảnh báo Telegram, lấy <b>mã ghép nối 6 số</b> rồi gửi cho bot: <code>/start 123456</code>.`;
