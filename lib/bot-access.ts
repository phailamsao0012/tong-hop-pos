// Kiểm soát ai được dùng bot: chat trong telegram_chats (member/admin) hoặc chat nhận cảnh báo.
// Người lạ vào bằng mật khẩu bot (đặt trên web) hoặc bấm "Xin quyền" để quản trị duyệt.
import { env } from 'cloudflare:workers';
import { hashPassword, verifyPassword } from '@/lib/auth';
import { sendWithMarkup } from '@/lib/telegram';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function chatRole(chatId: string): Promise<'admin' | 'member' | null> {
  const [row, alert] = await env.DB.batch([
    env.DB.prepare('SELECT role FROM telegram_chats WHERE chat_id=?').bind(chatId),
    env.DB.prepare('SELECT 1 AS x FROM alert_rules WHERE chat_id=?').bind(chatId),
  ]);
  const role = (row.results[0] as { role?: string } | undefined)?.role;
  if (role === 'admin' || alert.results.length) return 'admin';
  return role ? 'member' : null;
}

export async function adminChatIds() {
  const [rows, alerts] = await env.DB.batch([
    env.DB.prepare("SELECT chat_id FROM telegram_chats WHERE role='admin'"),
    env.DB.prepare("SELECT chat_id FROM alert_rules WHERE chat_id GLOB '[0-9]*' OR chat_id GLOB '-[0-9]*'"),
  ]);
  return [...new Set([...rows.results, ...alerts.results].map((r) => String((r as { chat_id: string }).chat_id)))];
}

export async function allowChat(chatId: string, name: string, addedBy: string, role: 'admin' | 'member' = 'member') {
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO telegram_chats (chat_id,name,added_by,added_at,role) VALUES (?,?,?,?,?) ON CONFLICT(chat_id) DO UPDATE SET name=CASE WHEN excluded.name<>\'\' THEN excluded.name ELSE telegram_chats.name END,role=excluded.role')
      .bind(chatId, name.slice(0, 100), addedBy, now, role),
    env.DB.prepare("UPDATE telegram_requests SET status='approved',decided_at=? WHERE chat_id=?").bind(now, chatId),
  ]);
}
export async function removeChat(chatId: string) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM telegram_chats WHERE chat_id=?').bind(chatId),
    env.DB.prepare("UPDATE telegram_requests SET status='denied',decided_at=? WHERE chat_id=?").bind(new Date().toISOString(), chatId),
  ]);
}

// ---------- mật khẩu bot ----------
export async function setBotPassword(password: string | null) {
  if (!password) { await env.DB.prepare("DELETE FROM app_settings WHERE key='bot_password'").run(); return; }
  await env.DB.prepare("INSERT INTO app_settings (key,value,updated_at) VALUES ('bot_password',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at")
    .bind(await hashPassword(password), new Date().toISOString()).run();
}
export async function hasBotPassword() {
  return !!(await env.DB.prepare("SELECT 1 AS x FROM app_settings WHERE key='bot_password'").first());
}
export async function checkBotPassword(password: string) {
  const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key='bot_password'").first<{ value: string }>();
  return !!row && await verifyPassword(password, row.value);
}

// ---------- xin quyền ----------
const REQUEST_COOLDOWN_MS = 10 * 60000;

/** Ghi nhận chat lạ; trả về true nếu nên trả lời (lần đầu hoặc đã quá 10 phút). */
export async function noteStranger(chatId: string, name: string, username: string | null) {
  const row = await env.DB.prepare('SELECT requested_at,status FROM telegram_requests WHERE chat_id=?').bind(chatId).first<{ requested_at: string; status: string }>();
  const now = new Date().toISOString();
  if (row && Date.now() - Date.parse(row.requested_at) < REQUEST_COOLDOWN_MS) return false;
  await env.DB.prepare("INSERT INTO telegram_requests (chat_id,name,username,requested_at,status) VALUES (?,?,?,?,'pending') ON CONFLICT(chat_id) DO UPDATE SET name=excluded.name,username=excluded.username,requested_at=excluded.requested_at,status=CASE WHEN telegram_requests.status='approved' THEN 'approved' ELSE 'pending' END")
    .bind(chatId, name.slice(0, 100), username, now).run();
  return true;
}

/** Gửi yêu cầu duyệt tới mọi chat quản trị với nút Cho phép / Từ chối. */
export async function notifyAdmins(token: string, chatId: string, name: string, username: string | null) {
  const admins = await adminChatIds();
  const text = [
    '🔐 <b>Yêu cầu dùng bot</b>',
    `Tên: <b>${esc(name || '—')}</b>${username ? ` (@${esc(username)})` : ''}`,
    `Chat ID: <code>${chatId}</code>`,
    'Cho phép chat này xem báo cáo?',
  ].join('\n');
  const keyboard = { inline_keyboard: [[{ text: '✅ Cho phép', callback_data: `acc:allow:${chatId}` }, { text: '❌ Từ chối', callback_data: `acc:deny:${chatId}` }]] };
  let sent = 0;
  for (const admin of admins) {
    try { await sendWithMarkup(token, admin, text, keyboard); sent++; } catch (error) { console.error('notify admin failed', error); }
  }
  return sent;
}

export async function listRequests() {
  const rows = await env.DB.prepare("SELECT chat_id,name,username,requested_at,status FROM telegram_requests WHERE status='pending' ORDER BY requested_at DESC LIMIT 50")
    .all<{ chat_id: string; name: string; username: string | null; requested_at: string; status: string }>();
  return rows.results;
}
