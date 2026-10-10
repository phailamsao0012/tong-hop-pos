// Kiểm soát ai được dùng bot: chat trong telegram_chats (member/admin) hoặc chat nhận cảnh báo.
// Người lạ vào bằng mật khẩu bot (đặt trên web) hoặc bấm "Xin quyền" để quản trị duyệt.
import { env } from 'cloudflare:workers';
import { hashPassword, verifyPassword } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { FAIL_LIMIT_ALL, FAIL_LIMIT_CHAT, LOCK_ALL_MS, LOCK_CHAT_MS, addFailure, isLocked, type FailState } from '@/lib/bot-guard-core';
import { sendWithMarkup } from '@/lib/telegram';
import { parseTeam, type Team } from '@/lib/team';

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

/**
 * Chat tin cậy: chat nhận cảnh báo của tài khoản chủ hệ thống hoặc giám đốc đang hoạt động (đặt trên web, trang Cấu hình).
 * Chỉ các chat này nhận tin tuyển dụng, duyệt người lạ, và (nếu là chat riêng) tra hồ sơ khách — luật dữ liệu cá nhân 10/10/2026.
 */
export async function trustedChatIds() {
  const rows = await env.DB.prepare(`SELECT DISTINCT a.chat_id FROM alert_rules a JOIN users u ON u.id=a.owner_id
    WHERE u.role IN ('owner','director') AND u.disabled=0 AND (a.chat_id GLOB '[0-9]*' OR a.chat_id GLOB '-[0-9]*')`).all<{ chat_id: string }>();
  return rows.results.map((r) => String(r.chat_id));
}
export const isTrustedChat = async (chatId: string) => (await trustedChatIds()).includes(chatId);

/** Ghi nhật ký việc của bot vào audit_log (cùng bảng nhật ký của web). Không ghi số điện thoại hay nội dung khách. */
export function botAudit(action: string, chatId: string, from: { id?: number; first_name?: string; username?: string } | undefined, detail?: string) {
  return audit({ action: `bot.${action}`, target: `tg:${chatId}`, userId: from?.id ? `tg:${from.id}` : null, name: from?.username ? `${from.first_name ?? ''} @${from.username}`.trim() : from?.first_name ?? null, detail: detail ?? null });
}

// ---------- khoá khi nhập sai mã ghép nối / mật khẩu ----------
const failKey = (chatId: string | null) => chatId ? `bot_fail:${chatId}` : 'bot_fail:*';
async function readFail(chatId: string | null) {
  const row = await env.DB.prepare('SELECT value FROM app_settings WHERE key=?').bind(failKey(chatId)).first<{ value: string }>();
  try { return row ? JSON.parse(row.value) as FailState : null; } catch { return null; }
}
const writeFail = (chatId: string | null, s: FailState) => env.DB.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at')
  .bind(failKey(chatId), JSON.stringify(s), new Date().toISOString());
/** Đang bị khoá thử mã (chat này sai quá 5 lần, hoặc cả bot bị dò quá 20 lần trong 15 phút). */
export async function pairingLocked(chatId: string) {
  const now = Date.now();
  const [one, all] = await Promise.all([readFail(chatId), readFail(null)]);
  return isLocked(one, now) || isLocked(all, now);
}
export async function notePairingFailure(chatId: string) {
  const now = Date.now();
  const [one, all] = await Promise.all([readFail(chatId), readFail(null)]);
  await env.DB.batch([writeFail(chatId, addFailure(one, now, FAIL_LIMIT_CHAT, LOCK_CHAT_MS)), writeFail(null, addFailure(all, now, FAIL_LIMIT_ALL, LOCK_ALL_MS))]);
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

// ---------- bộ phận mặc định của chat (Sale / CSKH / cả hai) ----------
// Lưu ở app_settings (khóa bot_team:<chat>) để không cần migration; mọi báo cáo của chat lọc theo lựa chọn này.
export async function getChatTeam(chatId: string): Promise<Team> {
  const row = await env.DB.prepare('SELECT value FROM app_settings WHERE key=?').bind(`bot_team:${chatId}`).first<{ value: string }>();
  return parseTeam(row?.value);
}
export async function setChatTeam(chatId: string, team: Team) {
  if (team === 'all') { await env.DB.prepare('DELETE FROM app_settings WHERE key=?').bind(`bot_team:${chatId}`).run(); return; }
  await env.DB.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at')
    .bind(`bot_team:${chatId}`, team, new Date().toISOString()).run();
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

/** Gửi yêu cầu duyệt tới chat tin cậy (chủ hệ thống / giám đốc) với nút Cho phép / Từ chối. */
export async function notifyAdmins(token: string, chatId: string, name: string, username: string | null) {
  const admins = await trustedChatIds();
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
