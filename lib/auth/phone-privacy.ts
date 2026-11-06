// Che SĐT khách theo vai trò ở máy chủ (không chỉ ẩn ở giao diện): chủ hệ thống và giám đốc thấy đủ số, vai trò khác chỉ thấy
// 3 số cuối (cùng quy tắc với customerPhone, lib/reports/customer-timeline.ts).
// Thay cho số đã che, mỗi khách có `phoneRef`: mã hoá (AES-GCM, khoá dẫn xuất từ AUTH_SECRET) cặp POS + SĐT, để giao diện vẫn mở được
// hồ sơ khách mà trình duyệt không nhận số thật. Máy chủ giải mã rồi vẫn kiểm phạm vi POS của tài khoản.
import { env } from 'cloudflare:workers';
import type { Role } from '@/lib/auth/access';
import { maskPhone } from '@/lib/bot/bot-guard-core';
import { maskPhonesIn } from '@/lib/ops/audit';

const enc = new TextEncoder();

/** Vai trò thấy đủ SĐT khách: mọi vai trò (anh Vũ 06/11/2026: CSKH và trưởng nhóm "cho thấy đủ chứ" để gọi từ web).
 *  Giữ hàm để đổi lại một chỗ nếu sau này cần che. */
export const seesFullPhone = (_role: Role) => true;

/** Trường chứa một SĐT. */
const PHONE_KEY = /^(?:phone|phoneNumber|phone_number|bill_phone_number|receiverPhone)$/i;
/** Trường chứa danh sách SĐT. */
const PHONES_KEY = /^(?:phones|phoneNumbers|phone_numbers)$/i;
/** Trường là đường dẫn: không sửa chữ bên trong (sửa sẽ hỏng liên kết). */
const URL_KEY = /(?:url|link)$/i;

async function secretKey(purpose: string, usage: 'aes' | 'hmac') {
  const secret = env.AUTH_SECRET?.trim();
  if (!secret) throw new Error('Thiếu biến bí mật AUTH_SECRET.');
  const raw = await crypto.subtle.digest('SHA-256', enc.encode(`${secret}:${purpose}`));
  return usage === 'aes'
    ? crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
    : crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

/** Mã tham chiếu cho một khách (POS + SĐT), không lộ số. */
export async function phoneRef(posId: string, phone: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await secretKey('phone-ref', 'aes') as CryptoKey, enc.encode(JSON.stringify([posId, phone]))));
  return b64url(new Uint8Array([...iv, ...ct]));
}

/** Giải mã tham chiếu; sai hoặc bị sửa thì trả null. */
export async function openPhoneRef(ref: string): Promise<{ posId: string; phone: string } | null> {
  try {
    if (!ref || ref.length > 400) return null;
    const bytes = fromB64url(ref);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, await secretKey('phone-ref', 'aes') as CryptoKey, bytes.slice(12));
    const v = JSON.parse(new TextDecoder().decode(pt)) as unknown;
    return Array.isArray(v) && typeof v[0] === 'string' && typeof v[1] === 'string' ? { posId: v[0], phone: v[1] } : null;
  } catch { return null; }
}

/** Bí danh ổn định cho một SĐT (cùng số → cùng bí danh, khác số → gần như chắc khác), dùng khi giao diện gộp theo SĐT. */
export async function phonePseudonym(phone: string) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', await secretKey('phone-alias', 'hmac') as CryptoKey, enc.encode(digits)));
  const n = ((mac[0] << 24) | (mac[1] << 16) | (mac[2] << 8) | mac[3]) >>> 0;
  return `•••${digits.slice(-3)} #${String(n % 1_000_000).padStart(6, '0')}`;
}

type Json = unknown;
/** Che mọi SĐT trong một cấu trúc JSON: trường SĐT → 3 số cuối (kèm `phoneRef` khi cùng object có posId), chữ tự do → che SĐT lẫn trong chữ. */
export async function redactPhones<T>(value: T): Promise<T> {
  const walk = async (v: Json, key: string): Promise<Json> => {
    if (typeof v === 'string') {
      if (PHONE_KEY.test(key)) return v ? maskPhone(v.replace(/\s/g, '')) : v;
      return URL_KEY.test(key) ? v : maskPhonesIn(v);
    }
    if (Array.isArray(v)) {
      if (PHONES_KEY.test(key)) return v.map((x) => typeof x === 'string' || typeof x === 'number' ? maskPhone(String(x)) : x);
      return Promise.all(v.map((x) => walk(x, key)));
    }
    if (v && typeof v === 'object') {
      const o = v as Record<string, Json>;
      const out: Record<string, Json> = {};
      for (const [k, x] of Object.entries(o)) out[k] = await walk(x, k);
      // Mã tham chiếu theo POS của chính dòng đó (một POS, hoặc danh sách POS khi khách gộp trên nhiều POS).
      const posId = o.posId ?? o.pos_id;
      const pos = typeof posId === 'string' ? posId : Array.isArray(o.posIds) && o.posIds.length && o.posIds.every((x) => typeof x === 'string') ? o.posIds.join(',') : null;
      if (typeof o.phone === 'string' && o.phone && pos && !('phoneRef' in o)) out.phoneRef = await phoneRef(pos, o.phone);
      return out;
    }
    return v;
  };
  return await walk(value, '') as T;
}

/** Trả JSON đã che SĐT theo vai trò người xem. */
export async function privateJson(role: Role, body: unknown, init?: ResponseInit) {
  return Response.json(seesFullPhone(role) ? body : await redactPhones(body), init);
}

/** Che SĐT trong một phản hồi JSON đã dựng sẵn (route giữ nguyên logic, chỉ bọc ở cuối). Lỗi / không phải JSON thì trả nguyên. */
export async function privateResponse(role: Role, res: Response): Promise<Response> {
  if (seesFullPhone(role) || !res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return res;
  const body = await redactPhones(await res.json());
  const headers = new Headers(res.headers);
  headers.delete('content-length');
  headers.set('content-type', 'application/json');
  return new Response(JSON.stringify(body), { status: res.status, headers });
}
