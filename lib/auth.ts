import { env } from 'cloudflare:workers';
import { headers } from 'next/headers';

export type Role = 'admin' | 'member';
export type SessionUser = {
  userId: string;
  email: string;
  displayName: string;
  role: Role;
};

export const SESSION_COOKIE = 'thp_session';
const SESSION_DAYS = 30;
// PBKDF2 giữ ở mức vừa phải để login không vượt giới hạn CPU của Workers Free;
// mật khẩu được trộn thêm AUTH_SECRET (pepper) trước khi băm.
const PBKDF2_ITERATIONS = 30000;

const encoder = new TextEncoder();
const toBase64 = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromBase64 = (value: string) =>
  Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
const randomToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const sha256 = async (value: string) =>
  toBase64(await crypto.subtle.digest('SHA-256', encoder.encode(value)));

function authSecret() {
  const secret = env.AUTH_SECRET?.trim();
  if (!secret) throw new Error('Thiếu biến bí mật AUTH_SECRET.');
  return secret;
}

async function pepper(password: string) {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(authSecret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  return crypto.subtle.sign('HMAC', key, encoder.encode(password));
}

async function derive(password: string, salt: Uint8Array, iterations: number) {
  const material = await crypto.subtle.importKey('raw', await pepper(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, material, 256,
  );
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await derive(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(bits)}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, iterations, salt, hash] = stored.split('$');
  if (scheme !== 'pbkdf2' || !iterations || !salt || !hash) return false;
  const bits = await derive(password, fromBase64(salt), Number(iterations));
  const expected = fromBase64(hash);
  const actual = new Uint8Array(bits);
  if (expected.length !== actual.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ actual[i];
  return diff === 0;
}

export function validPassword(password: unknown): password is string {
  return typeof password === 'string' && password.length >= 8 && password.length <= 200;
}
export function normalizeEmail(email: unknown) {
  const value = typeof email === 'string' ? email.trim().toLowerCase() : '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 200 ? value : null;
}

export async function createSession(userId: string, userAgent: string | null) {
  const token = randomToken();
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 86400000);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO sessions (id,user_id,created_at,expires_at,user_agent) VALUES (?,?,?,?,?)')
      .bind(await sha256(token), userId, now.toISOString(), expires.toISOString(), userAgent?.slice(0, 300) ?? null),
    env.DB.prepare('UPDATE users SET last_login_at=? WHERE id=?').bind(now.toISOString(), userId),
  ]);
  return { token, expires };
}

export function sessionCookie(token: string, expires: Date) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${expires.toUTCString()}`;
}
export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function readCookie(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=') || null;
  }
  return null;
}

export async function destroySession(cookieHeader: string | null) {
  const token = readCookie(cookieHeader, SESSION_COOKIE);
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE id=?').bind(await sha256(token)).run();
}

type UserRow = { id: string; email: string; name: string; role: string; disabled: number; expires_at: string };

async function userFromCookie(cookieHeader: string | null): Promise<SessionUser | null> {
  const token = readCookie(cookieHeader, SESSION_COOKIE);
  if (!token || !env.DB) return null;
  const row = await env.DB.prepare(
    'SELECT u.id,u.email,u.name,u.role,u.disabled,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=?',
  ).bind(await sha256(token)).first<UserRow>();
  if (!row || row.disabled || row.expires_at < new Date().toISOString()) return null;
  return {
    userId: row.id,
    email: row.email,
    displayName: row.name || row.email,
    role: row.role === 'admin' ? 'admin' : 'member',
  };
}

/** Người dùng đang đăng nhập (đọc cookie của request hiện tại). */
export async function getSessionUser(): Promise<SessionUser | null> {
  const requestHeaders = await headers();
  return userFromCookie(requestHeaders.get('cookie'));
}

export async function getSessionUserFromRequest(request: Request) {
  return userFromCookie(request.headers.get('cookie'));
}

export async function hasAnyUser() {
  const row = await env.DB.prepare('SELECT 1 AS present FROM users LIMIT 1').first<{ present: number }>();
  return !!row;
}

export const unauthorized = (message = 'Đăng nhập để tiếp tục.') =>
  Response.json({ error: message }, { status: 401 });
export const forbidden = (message = 'Chỉ quản trị viên mới thực hiện được.') =>
  Response.json({ error: message }, { status: 403 });

// Chặn dò mật khẩu: tối đa 10 lần sai / 15 phút cho mỗi email (trong một isolate).
const failures = new Map<string, { count: number; until: number }>();
export function loginBlocked(key: string) {
  const entry = failures.get(key);
  return !!entry && entry.count >= 10 && entry.until > Date.now();
}
export function recordLoginFailure(key: string) {
  const entry = failures.get(key);
  if (entry && entry.until > Date.now()) entry.count++;
  else failures.set(key, { count: 1, until: Date.now() + 15 * 60000 });
}
export function clearLoginFailures(key: string) {
  failures.delete(key);
}
