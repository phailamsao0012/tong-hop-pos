// Xác thực nhiều lớp: mã OTP email, mã ứng dụng (TOTP), thiết bị tin cậy, thử thách đăng nhập. Chỉ dùng WebCrypto.
import { env } from 'cloudflare:workers';
import type { Role } from '@/lib/access';

const enc = new TextEncoder();
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const OTP_MINUTES = 10;
export const DEVICE_DAYS = 180;
export const DEVICE_COOKIE = 'thp_device';

/** Vai trò bắt buộc bật 2 lớp (mã ứng dụng hoặc passkey). */
export const mfaRequiredFor = (role: Role) => role === 'owner' || role === 'director' || role === 'lead';

export const sha256b64 = async (v: string) => btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(v)))));
export const randomToken = (bytes = 32) => { const b = crypto.getRandomValues(new Uint8Array(bytes)); return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
export const otpCode = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
export const maskEmail = (e: string) => { const [u, d] = e.split('@'); return `${u.slice(0, 2)}${'*'.repeat(Math.max(1, u.length - 2))}@${d}`; };

// ---- mã hóa secret TOTP bằng AES-GCM, khóa dẫn xuất từ AUTH_SECRET ----
async function aesKey() {
  const raw = await crypto.subtle.digest('SHA-256', enc.encode(`${env.AUTH_SECRET ?? ''}:mfa`));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function encryptText(plain: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(), enc.encode(plain)));
  return btoa(String.fromCharCode(...iv, ...ct));
}
export async function decryptText(b64: string) {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, await aesKey(), bytes.slice(12));
  return new TextDecoder().decode(pt);
}

// ---- TOTP (RFC 6238, SHA-1, 6 số, 30 giây) ----
export const totpSecret = () => { const b = crypto.getRandomValues(new Uint8Array(20)); let bits = '', out = ''; for (const x of b) bits += x.toString(2).padStart(8, '0'); for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)]; return out; };
function b32decode(s: string) {
  let bits = ''; for (const ch of s.replace(/=+$/, '').toUpperCase()) { const v = B32.indexOf(ch); if (v < 0) continue; bits += v.toString(2).padStart(5, '0'); }
  const out = new Uint8Array(Math.floor(bits.length / 8)); for (let i = 0; i < out.length; i++) out[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2); return out;
}
async function hotp(secret: string, counter: number) {
  const key = await crypto.subtle.importKey('raw', b32decode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const msg = new Uint8Array(8); let c = counter; for (let i = 7; i >= 0; i--) { msg[i] = c & 0xff; c = Math.floor(c / 256); }
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const o = h[h.length - 1] & 0x0f;
  const code = ((h[o] & 0x7f) << 24) | ((h[o + 1] & 0xff) << 16) | ((h[o + 2] & 0xff) << 8) | (h[o + 3] & 0xff);
  return String(code % 1000000).padStart(6, '0');
}
export async function verifyTotp(secret: string, code: string, window = 1) {
  const clean = code.replace(/\D/g, ''); if (clean.length !== 6) return false;
  const step = Math.floor(Date.now() / 30000);
  for (let d = -window; d <= window; d++) if (await hotp(secret, step + d) === clean) return true;
  return false;
}
export const otpauthUri = (secret: string, email: string) => `otpauth://totp/${encodeURIComponent('MEGATECH POS')}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent('MEGATECH POS')}&algorithm=SHA1&digits=6&period=30`;

// ---- thử thách đăng nhập ----
export type ChallengeKind = 'otp' | 'totp' | 'webauthn' | 'webauthn-reg';
export async function createChallenge(userId: string, kind: ChallengeKind, secret: string, meta?: unknown, minutes = OTP_MINUTES) {
  const id = randomToken(24); const now = new Date();
  await env.DB.prepare('INSERT INTO login_challenges (id,user_id,kind,secret,attempts,created_at,expires_at,meta) VALUES (?,?,?,?,0,?,?,?)')
    .bind(id, userId, kind, secret, now.toISOString(), new Date(now.getTime() + minutes * 60000).toISOString(), meta === undefined ? null : JSON.stringify(meta)).run();
  return id;
}
export type Challenge = { id: string; user_id: string; kind: ChallengeKind; secret: string; attempts: number; expires_at: string; meta: string | null };
export async function loadChallenge(id: string, kind: ChallengeKind) {
  const c = await env.DB.prepare('SELECT id,user_id,kind,secret,attempts,expires_at,meta FROM login_challenges WHERE id=? AND kind=?').bind(id, kind).first<Challenge>();
  if (!c || c.expires_at < new Date().toISOString() || c.attempts >= 5) return null;
  return c;
}
export const bumpChallenge = (id: string) => env.DB.prepare('UPDATE login_challenges SET attempts=attempts+1 WHERE id=?').bind(id).run();
export const dropChallenge = (id: string) => env.DB.prepare('DELETE FROM login_challenges WHERE id=?').bind(id).run();
export const sweepChallenges = () => env.DB.prepare('DELETE FROM login_challenges WHERE expires_at<?').bind(new Date(Date.now() - 3600000).toISOString()).run();

// ---- thiết bị tin cậy ----
export function readCookie(header: string | null, name: string) {
  return header?.split(';').map((p) => p.trim()).find((p) => p.startsWith(`${name}=`))?.slice(name.length + 1) ?? null;
}
export async function deviceTrusted(userId: string, cookieHeader: string | null) {
  const token = readCookie(cookieHeader, DEVICE_COOKIE); if (!token) return false;
  const row = await env.DB.prepare('SELECT id FROM trusted_devices WHERE id=? AND user_id=? AND expires_at>?').bind(await sha256b64(token), userId, new Date().toISOString()).first();
  if (row) await env.DB.prepare('UPDATE trusted_devices SET last_used_at=? WHERE id=?').bind(new Date().toISOString(), (row as { id: string }).id).run();
  return !!row;
}
export async function trustDevice(userId: string, userAgent: string | null) {
  const token = randomToken(); const now = new Date(); const expires = new Date(now.getTime() + DEVICE_DAYS * 86400000);
  await env.DB.prepare('INSERT INTO trusted_devices (id,user_id,created_at,expires_at,last_used_at,user_agent) VALUES (?,?,?,?,?,?)').bind(await sha256b64(token), userId, now.toISOString(), expires.toISOString(), now.toISOString(), userAgent?.slice(0, 200) ?? null).run();
  return `${DEVICE_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${expires.toUTCString()}`;
}

// ---- trạng thái 2 lớp của người dùng ----
export async function mfaState(userId: string) {
  const [m, p] = await env.DB.batch([
    env.DB.prepare('SELECT totp_secret,totp_enabled_at FROM user_mfa WHERE user_id=?').bind(userId),
    env.DB.prepare('SELECT COUNT(*) AS n FROM passkeys WHERE user_id=?').bind(userId),
  ]);
  const row = m.results[0] as { totp_secret: string | null; totp_enabled_at: string | null } | undefined;
  return { totpEnabled: !!row?.totp_enabled_at, totpSecretEnc: row?.totp_secret ?? null, passkeys: Number((p.results[0] as { n: number })?.n ?? 0) };
}
