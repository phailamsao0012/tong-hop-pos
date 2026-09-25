// Yêu cầu đăng nhập chờ duyệt trên app (25/09/2026):
// - 'qr': máy tính hiện mã QR, app đã đăng nhập quét và xác nhận → máy tính vào tài khoản của người quét;
// - 'approve': bước hai sau mật khẩu, app của chính người đó hiện yêu cầu và bấm duyệt.
// Chống bấm nhầm / bị lừa quét hộ: máy tính hiện một số 2 chữ số, app phải chọn đúng số đó trong 3 số.
// Máy tính giữ pollToken (không nằm trong QR) nên người chỉ thấy mã QR không lấy được phiên.
import { env } from 'cloudflare:workers';
import { ensureAuthSchema } from '@/lib/auth-schema';
import { clientInfo, startSession, type LoginMethod } from '@/lib/login-session';
import { randomToken, sha256b64 } from '@/lib/mfa';

export const QR_SECONDS = 90;
export const APPROVE_SECONDS = 300;
type Row = { id: string; poll_hash: string; kind: 'qr' | 'approve'; user_id: string | null; number: number; choices: string; status: string; remember: number;
  created_at: string; expires_at: string; requester_device: string | null; requester_place: string | null; requester_ip: string | null };

const two = () => 10 + (crypto.getRandomValues(new Uint32Array(1))[0] % 90);
const creates = new Map<string, { n: number; until: number }>();
function tooMany(ip: string | null) {
  const k = ip ?? 'none'; const e = creates.get(k);
  if (!e || e.until < Date.now()) { creates.set(k, { n: 1, until: Date.now() + 10 * 60000 }); return false; }
  return ++e.n > 60;
}

export async function createLoginRequest(request: Request, kind: 'qr' | 'approve', userId: string | null, remember = true) {
  await ensureAuthSchema();
  const info = clientInfo(request);
  if (tooMany(info.ip)) throw new Error('Tạo mã quá nhiều lần, thử lại sau ít phút.');
  const id = randomToken(18), pollToken = randomToken(24), number = two();
  const choices = new Set([number]); while (choices.size < 3) choices.add(two());
  const now = new Date(), expires = new Date(now.getTime() + (kind === 'qr' ? QR_SECONDS : APPROVE_SECONDS) * 1000);
  await env.DB.prepare(`INSERT INTO login_requests (id,poll_hash,kind,user_id,number,choices,status,remember,created_at,expires_at,requester_ua,requester_ip,requester_place,requester_device)
    VALUES (?,?,?,?,?,?,'pending',?,?,?,?,?,?,?)`).bind(id, await sha256b64(pollToken), kind, userId, number, JSON.stringify([...choices].sort(() => (crypto.getRandomValues(new Uint8Array(1))[0] & 1) - 0.5)),
    remember ? 1 : 0, now.toISOString(), expires.toISOString(), info.ua?.slice(0, 200) ?? null, info.ip, info.place, info.device).run();
  // Dọn yêu cầu cũ.
  void env.DB.prepare('DELETE FROM login_requests WHERE expires_at<?').bind(new Date(Date.now() - 3600000).toISOString()).run().catch(() => undefined);
  return { id, pollToken, number, expiresAt: expires.toISOString(), seconds: kind === 'qr' ? QR_SECONDS : APPROVE_SECONDS };
}

const load = (id: string) => env.DB.prepare('SELECT id,poll_hash,kind,user_id,number,choices,status,remember,created_at,expires_at,requester_device,requester_place,requester_ip FROM login_requests WHERE id=?').bind(id).first<Row>();

/** Máy tính hỏi trạng thái. Đã duyệt → tạo phiên (một lần) và trả cookie. */
export async function pollLoginRequest(request: Request, id: string, pollToken: string): Promise<{ status: string; headers?: Headers }> {
  await ensureAuthSchema();
  const r = await load(id);
  if (!r || r.poll_hash !== await sha256b64(pollToken)) return { status: 'invalid' };
  if (r.status === 'pending' && r.expires_at < new Date().toISOString()) return { status: 'expired' };
  if (r.status !== 'approved' || !r.user_id) return { status: r.status };
  // Chỉ một lần: đổi approved → consumed có điều kiện.
  const done = await env.DB.prepare("UPDATE login_requests SET status='consumed' WHERE id=? AND status='approved'").bind(id).run();
  if (!done.meta.changes) return { status: 'consumed' };
  const user = await env.DB.prepare('SELECT id,name,email,disabled FROM users WHERE id=?').bind(r.user_id).first<{ id: string; name: string; email: string; disabled: number }>();
  if (!user || user.disabled) return { status: 'denied' };
  const method: LoginMethod = r.kind === 'qr' ? 'qr' : 'password+app';
  return { status: 'done', headers: await startSession(request, user, method, { trust: !!r.remember }) };
}

const view = (r: Row) => ({
  id: r.id, kind: r.kind, device: r.requester_device ?? 'Máy không rõ', place: r.requester_place, ip: r.requester_ip,
  createdAt: r.created_at, expiresAt: r.expires_at, choices: JSON.parse(r.choices) as number[],
});

/** Yêu cầu 'approve' đang chờ của người dùng (app hỏi định kỳ khi đang mở). */
export async function pendingForUser(userId: string) {
  await ensureAuthSchema();
  const rows = await env.DB.prepare("SELECT id,poll_hash,kind,user_id,number,choices,status,remember,created_at,expires_at,requester_device,requester_place,requester_ip FROM login_requests WHERE user_id=? AND status='pending' AND expires_at>? ORDER BY created_at DESC LIMIT 5")
    .bind(userId, new Date().toISOString()).all<Row>();
  return rows.results.map(view);
}

/** Thông tin một yêu cầu (sau khi quét QR). */
export async function requestForApproval(id: string, userId: string) {
  await ensureAuthSchema();
  const r = await load(id);
  if (!r || r.status !== 'pending' || r.expires_at < new Date().toISOString()) return null;
  if (r.kind === 'approve' && r.user_id !== userId) return null;
  return view(r);
}

/** App duyệt / từ chối. Chọn sai số = từ chối luôn (có thể đang bị lừa). */
export async function decideLoginRequest(id: string, userId: string, sessionId: string | null, number: number | null, decision: 'approve' | 'deny') {
  await ensureAuthSchema();
  const r = await load(id);
  if (!r || r.status !== 'pending' || r.expires_at < new Date().toISOString()) return { ok: false, status: 'expired' as const };
  if (r.kind === 'approve' && r.user_id !== userId) return { ok: false, status: 'expired' as const };
  const approve = decision === 'approve' && number === r.number;
  const status = approve ? 'approved' : 'denied';
  const res = await env.DB.prepare("UPDATE login_requests SET status=?,user_id=?,decided_at=?,decided_by=? WHERE id=? AND status='pending'")
    .bind(status, userId, new Date().toISOString(), sessionId, id).run();
  if (!res.meta.changes) return { ok: false, status: 'expired' as const };
  return { ok: approve, status: decision === 'approve' && !approve ? 'wrong-number' as const : status, kind: r.kind, device: r.requester_device };
}

/** Người dùng có app đang đăng nhập (dùng được trong 45 ngày gần đây) → mời duyệt trên app thay cho mã. */
export async function hasActiveApp(userId: string) {
  await ensureAuthSchema();
  const row = await env.DB.prepare("SELECT 1 AS x FROM sessions WHERE user_id=? AND client IN ('ios','android') AND expires_at>? AND COALESCE(last_seen_at,created_at)>? LIMIT 1")
    .bind(userId, new Date().toISOString(), new Date(Date.now() - 45 * 86400000).toISOString()).first();
  return !!row;
}
