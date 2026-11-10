// Tách khỏi app/api/telegram/route.ts (cải tổ B5, 05/11/2026): chỉ dời chỗ, câu SQL giữ nguyên.
import { env } from 'cloudflare:workers';

/** 30 cảnh báo gần nhất của người đang xem. */
export const alertLog = (user: { userId: string }) =>
  env.DB.prepare('SELECT kind,employee_id,day,sent_at,message,ok,error FROM alert_log WHERE owner_id=? ORDER BY sent_at DESC LIMIT 30')
    .bind(user.userId).all<Record<string, unknown>>();
/** Các chat Telegram được phép nhận tin. */
export const allowedChats = () =>
  env.DB.prepare('SELECT chat_id,name,added_at,role FROM telegram_chats ORDER BY added_at').all<{ chat_id: string; name: string; added_at: string; role: string }>();
/** Ghi nhật ký tin thử đã gửi. */
export const logTestAlert = (user: { userId: string }, message: string) =>
  env.DB.prepare('INSERT INTO alert_log (id,owner_id,kind,employee_id,day,sent_at,message,ok,error) VALUES (?,?,?,?,?,?,?,1,NULL)')
    .bind(crypto.randomUUID(), user.userId, 'test', null, new Date().toISOString().slice(0, 10), new Date().toISOString(), message).run();
