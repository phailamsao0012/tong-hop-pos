// Đăng nhập giả trong test: tạo người dùng + phiên trong D1 giả, đặt cookie cho shim next/headers.
import type { DatabaseSync } from 'node:sqlite';

const b64 = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
let n = 0;
export async function loginAs(raw: DatabaseSync, role: 'owner' | 'director' | 'lead' | 'staff', opts: { views?: string[]; posIds?: string[]; team?: string } = {}) {
  const id = `u-${role}-${++n}`, now = new Date().toISOString(), token = `tok-${id}`;
  raw.prepare('INSERT INTO users (id,email,name,password_hash,role,disabled,created_at,updated_at,views_json,pos_ids_json,team) VALUES (?,?,?,?,?,0,?,?,?,?,?)')
    .run(id, `${id}@test`, id, '-', role, now, now, opts.views ? JSON.stringify(opts.views) : '', opts.posIds ? JSON.stringify(opts.posIds) : '', opts.team ?? 'all');
  const key = b64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
  raw.prepare('INSERT INTO sessions (id,user_id,created_at,expires_at) VALUES (?,?,?,?)').run(key, id, now, new Date(Date.now() + 86400000).toISOString());
  (globalThis as { __testCookie?: string }).__testCookie = `thp_session=${token}`;
  return id;
}
export const logout = () => { delete (globalThis as { __testCookie?: string }).__testCookie; };
