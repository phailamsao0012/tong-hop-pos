// Tạo phiên đăng nhập kèm thông tin thiết bị (web / app iPhone / app Android, nơi, IP, cách vào) và báo Telegram
// cho chủ hệ thống khi có máy lạ vào tài khoản (yêu cầu 25/09/2026).
import { env } from 'cloudflare:workers';
import { createSession, sessionCookie } from '@/lib/auth';
import { ensureAuthSchema } from '@/lib/auth-schema';
import { clientIp, deviceLabel } from '@/lib/audit';
import { adminChatIds } from '@/lib/bot-access';
import { deviceTrusted, trustDevice } from '@/lib/mfa';
import { sendTelegram } from '@/lib/telegram';

export type LoginMethod = 'password' | 'password+otp' | 'password+totp' | 'password+app' | 'passkey' | 'qr' | 'reset' | 'setup';
export const METHOD_LABELS: Record<LoginMethod, string> = {
  password: 'Mật khẩu (máy quen)', 'password+otp': 'Mật khẩu + mã email', 'password+totp': 'Mật khẩu + mã ứng dụng',
  'password+app': 'Mật khẩu + duyệt trên app', passkey: 'Face ID / vân tay', qr: 'Quét QR bằng app', reset: 'Đặt lại mật khẩu', setup: 'Tạo tài khoản',
};

/** App gửi X-Megatech-Client (ios | android) và X-Megatech-Device (tên máy); web đọc từ User-Agent. */
export function clientInfo(request: Request) {
  const ua = request.headers.get('user-agent');
  const h = (request.headers.get('x-megatech-client') ?? '').toLowerCase();
  const client = h === 'ios' || h === 'android' ? h : 'web';
  const model = (request.headers.get('x-megatech-device') ?? '').replace(/[^\p{L}\p{N} ._()-]/gu, '').slice(0, 60);
  const device = client === 'web' ? deviceLabel(ua) ?? 'Trình duyệt' : `${model || (client === 'ios' ? 'iPhone' : 'Android')} · app MEGATECH`;
  const cf = (request as Request & { cf?: { city?: string; country?: string } }).cf;
  const place = [cf?.city, cf?.country ?? request.headers.get('cf-ipcountry')].filter(Boolean).join(', ') || null;
  return { client, device, ua, ip: clientIp(request), place };
}

/** Tạo phiên + cookie; ghi thông tin phiên; báo Telegram nếu máy chưa từng tin cậy. trust = nhớ máy này 180 ngày. */
export async function startSession(request: Request, user: { id: string; name?: string | null; email?: string | null }, method: LoginMethod, opts: { trust?: boolean } = {}) {
  await ensureAuthSchema().catch((e) => console.error('auth schema', e));
  const info = clientInfo(request);
  const known = await deviceTrusted(user.id, request.headers.get('cookie')).catch(() => false);
  const { token, expires } = await createSession(user.id, info.ua);
  const sid = await sessionIdOf(token);
  await env.DB.prepare('UPDATE sessions SET client=?,method=?,ip=?,place=?,device=?,last_seen_at=? WHERE id=?')
    .bind(info.client, method, info.ip, info.place, info.device, new Date().toISOString(), sid).run().catch(() => undefined);
  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.append('Set-Cookie', sessionCookie(token, expires));
  if (opts.trust && !known) headers.append('Set-Cookie', await trustDevice(user.id, info.ua));
  if (!known) void notifyNewDevice(user, info, method).catch((e) => console.error('login notify', e));
  return headers;
}

async function sessionIdOf(token: string) {
  return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))));
}

async function notifyNewDevice(user: { id: string; name?: string | null; email?: string | null }, info: ReturnType<typeof clientInfo>, method: LoginMethod) {
  const token = env.TELEGRAM_BOT_TOKEN?.trim(); if (!token) return;
  const who = user.name || user.email ? { name: user.name, email: user.email } : await env.DB.prepare('SELECT name,email FROM users WHERE id=?').bind(user.id).first<{ name: string; email: string }>();
  const time = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
  const text = [`🔐 Đăng nhập từ máy mới`, `${who?.name ?? ''} (${who?.email ?? ''})`, `${info.device}${info.place ? ` · ${info.place}` : ''}${info.ip ? ` · IP ${info.ip}` : ''}`,
    `Cách vào: ${METHOD_LABELS[method]} · ${time}`, `Không phải người này? Vào web → Bảo mật tài khoản → Thiết bị đang đăng nhập để đăng xuất máy đó.`].join('\n');
  for (const chat of await adminChatIds()) { try { await sendTelegram(token, chat, text); } catch (e) { console.error('login notify send', e); } }
}

/** Mã phiên (băm) của request hiện tại, để đánh dấu "máy này" và ghi ai đã duyệt. */
export async function currentSessionId(request: Request) {
  const token = request.headers.get('cookie')?.split(';').map((p) => p.trim()).find((p) => p.startsWith('thp_session='))?.slice(12);
  return token ? sessionIdOf(token) : null;
}
