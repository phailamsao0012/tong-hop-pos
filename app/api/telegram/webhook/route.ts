import { env } from 'cloudflare:workers';
import { handleCommand, splitMessage, type TelegramUpdate } from '@/lib/bot';
import { allowChat, chatRole, checkBotPassword, hasBotPassword, noteStranger, notifyAdmins, removeChat } from '@/lib/bot-access';
import { MAIN_MENU, handleCallback, startScreen, tryPairing } from '@/lib/bot-menu';
import { answerCallback, editMessage, sendPhoto, sendWithMarkup } from '@/lib/telegram';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Telegram gọi vào đây khi có tin nhắn / bấm nút. Xác thực bằng header bí mật do setWebhook đăng ký.
// Chat chưa được phép không nhận bất kỳ số liệu nào.
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
  const strangerReply = async (chatId: string, name: string, username: string | null) => {
    if (!(await noteStranger(chatId, name, username))) return; // đã trả lời gần đây
    const withPassword = await hasBotPassword();
    await send(chatId, [
      '🔒 Bot này chỉ dành cho người được cấp quyền.',
      withPassword ? 'Nếu bạn có mật khẩu: gửi <code>/start &lt;mật khẩu&gt;</code>.' : '',
      'Hoặc bấm "Xin quyền" để quản trị viên duyệt.',
    ].filter(Boolean).join('\n'), { inline_keyboard: [[{ text: '🙋 Xin quyền', callback_data: 'acc:req' }]] });
  };

  // ----- Bấm nút -----
  const cb = update.callback_query;
  if (cb?.data && cb.message?.chat?.id) {
    const chatId = String(cb.message.chat.id);
    const fromName = cb.from?.first_name ?? 'bạn';
    await answerCallback(token, cb.id ?? '');
    const role = await chatRole(chatId);
    if (cb.data === 'acc:req') {
      if (role) { await send(chatId, 'Chat này đã được cấp quyền. Gõ /start để mở menu.', MAIN_MENU); return Response.json({ ok: true }); }
      const sent = await notifyAdmins(token, chatId, fromName, null);
      await send(chatId, sent ? '📨 Đã gửi yêu cầu tới quản trị viên. Bạn sẽ nhận thông báo khi được duyệt.' : 'Chưa có quản trị viên nào nhận yêu cầu. Liên hệ người quản lý web để được cấp quyền.');
      return Response.json({ ok: true });
    }
    if (cb.data.startsWith('acc:allow:') || cb.data.startsWith('acc:deny:')) {
      if (role !== 'admin') { await send(chatId, 'Chỉ chat quản trị mới duyệt được.'); return Response.json({ ok: true }); }
      const [, decision, target] = cb.data.split(':');
      if (decision === 'allow') {
        await allowChat(target, '', `tg:${chatId}`);
        await editMessage(token, chatId, cb.message.message_id ?? 0, `✅ Đã cho phép chat <code>${target}</code>.`).catch(() => undefined);
        const s = await startScreen('bạn').catch(() => null);
        await send(target, `✅ Bạn đã được cấp quyền dùng bot Tổng hợp POS.${s ? `\n\n${s.text}` : ''}`, s?.keyboard ?? MAIN_MENU);
      } else {
        await removeChat(target);
        await editMessage(token, chatId, cb.message.message_id ?? 0, `❌ Đã từ chối chat <code>${target}</code>.`).catch(() => undefined);
        await send(target, '❌ Yêu cầu dùng bot chưa được duyệt.');
      }
      return Response.json({ ok: true });
    }
    if (!role) { await strangerReply(chatId, fromName, null); return Response.json({ ok: true }); }
    try {
      const { text, keyboard, photo } = await handleCallback(cb.data, fromName);
      if (photo) {
        try { await sendPhoto(token, chatId, photo, text, keyboard); }
        catch (error) { console.error('sendPhoto failed', error); await send(chatId, text, keyboard); }
        return Response.json({ ok: true });
      }
      const parts = splitMessage(text);
      try { await editMessage(token, chatId, cb.message.message_id ?? 0, parts[0], parts.length === 1 ? keyboard : undefined); }
      catch { await send(chatId, parts[0], parts.length === 1 ? keyboard : undefined); }
      for (const p of parts.slice(1)) await send(chatId, p, p === parts.at(-1) ? keyboard : undefined);
    } catch (error) {
      console.error('bot callback failed', error);
      await send(chatId, `Lỗi khi tạo báo cáo: ${esc(error instanceof Error ? error.message : String(error))}`, MAIN_MENU);
    }
    return Response.json({ ok: true });
  }

  // ----- Tin nhắn -----
  const message = update.message;
  const chatId = message?.chat?.id;
  const text = message?.text?.trim();
  if (!chatId || !text) return Response.json({ ok: true });
  const chat = String(chatId);
  const chatName = message.chat?.title ?? [message.chat?.first_name, message.chat?.last_name].filter(Boolean).join(' ') ?? chat;
  const userName = message.from?.first_name ?? chatName;
  const username = message.from?.username ?? message.chat?.username ?? null;

  // /start <mã ghép nối 6 số> (từ web) hoặc /start <mật khẩu bot>
  const startArg = text.match(/^\/start(?:@\w+)?\s+(.+)$/)?.[1]?.trim();
  if (startArg && !(await chatRole(chat))) {
    const paired = /^\d{6}$/.test(startArg) && await tryPairing(chat, chatName, startArg);
    const byPassword = !paired && await checkBotPassword(startArg);
    if (paired || byPassword) {
      if (byPassword) await allowChat(chat, chatName, 'password');
      const s = await startScreen(userName);
      await send(chat, `✅ Đã kết nối chat này với Tổng hợp POS.\n\n${s.text}`, s.keyboard);
    } else await send(chat, '❌ Mã hoặc mật khẩu không đúng.', { inline_keyboard: [[{ text: '🙋 Xin quyền', callback_data: 'acc:req' }]] });
    return Response.json({ ok: true });
  }
  const role = await chatRole(chat);
  if (!role) { await strangerReply(chat, userName, username); return Response.json({ ok: true }); }

  try {
    if (/^\/(start|menu)(@\w+)?$/.test(text)) {
      const s = await startScreen(userName);
      await send(chat, s.text, s.keyboard);
    } else {
      const parts = await handleCommand(text);
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const markup = i === parts.length - 1 ? MAIN_MENU : undefined;
        if (typeof part === 'string') await send(chat, part, markup);
        else {
          try { await sendPhoto(token, chat, part.photo, part.caption, markup); }
          catch (error) { console.error('sendPhoto failed', error); await send(chat, part.caption, markup); }
        }
      }
    }
  } catch (error) {
    console.error('bot command failed', error);
    await send(chat, `Lỗi khi tạo báo cáo: ${esc(error instanceof Error ? error.message : String(error))}`, MAIN_MENU);
  }
  return Response.json({ ok: true });
}
