import { env } from 'cloudflare:workers';
import { isOwner } from '@/lib/access';
import { audit } from '@/lib/audit';
import { deviceLabel } from '@/lib/audit';
import { forgetSession, getSessionUser, unauthorized } from '@/lib/auth';
import { ensureAuthSchema } from '@/lib/auth-schema';
import { METHOD_LABELS, currentSessionId, type LoginMethod } from '@/lib/login-session';

// Thiết bị đang đăng nhập.
//   GET               → phiên của chính mình; GET ?scope=all (chủ hệ thống) → phiên của mọi tài khoản
//   DELETE ?id=…      → đăng xuất một phiên (của mình; chủ hệ thống: của bất kỳ ai)
//   DELETE ?others=1  → đăng xuất mọi máy khác của mình;  DELETE ?userId=… (chủ hệ thống) → đăng xuất mọi máy của người đó
type Row = { id: string; user_id: string; name: string; email: string; created_at: string; expires_at: string; user_agent: string | null; client: string | null; method: string | null; ip: string | null; place: string | null; device: string | null; last_seen_at: string | null };

export async function GET(request: Request) {
  const user = await getSessionUser(); if (!user) return unauthorized();
  await ensureAuthSchema();
  const all = new URL(request.url).searchParams.get('scope') === 'all' && isOwner(user);
  const rows = await env.DB.prepare(`SELECT s.id,s.user_id,u.name,u.email,s.created_at,s.expires_at,s.user_agent,s.client,s.method,s.ip,s.place,s.device,s.last_seen_at
    FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.expires_at>? ${all ? '' : 'AND s.user_id=?'} ORDER BY COALESCE(s.last_seen_at,s.created_at) DESC LIMIT 500`)
    .bind(...[new Date().toISOString(), ...(all ? [] : [user.userId])]).all<Row>();
  const current = await currentSessionId(request);
  return Response.json({
    sessions: rows.results.map((r) => ({
      id: r.id, userId: r.user_id, name: r.name, email: r.email, client: r.client ?? 'web',
      device: r.device ?? deviceLabel(r.user_agent) ?? 'Không rõ', method: r.method, methodLabel: r.method ? METHOD_LABELS[r.method as LoginMethod] ?? r.method : 'Trước khi ghi cách vào',
      ip: r.ip, place: r.place, createdAt: r.created_at, lastSeenAt: r.last_seen_at ?? r.created_at, expiresAt: r.expires_at, current: r.id === current,
    })),
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE(request: Request) {
  const user = await getSessionUser(); if (!user) return unauthorized();
  const p = new URL(request.url).searchParams;
  const current = await currentSessionId(request);
  let res;
  if (p.get('others') === '1') res = await env.DB.prepare('DELETE FROM sessions WHERE user_id=? AND id<>?').bind(user.userId, current ?? '').run();
  else if (p.get('userId') && isOwner(user)) res = await env.DB.prepare('DELETE FROM sessions WHERE user_id=? AND id<>?').bind(p.get('userId'), current ?? '').run();
  else {
    const id = p.get('id') ?? '';
    res = isOwner(user) ? await env.DB.prepare('DELETE FROM sessions WHERE id=?').bind(id).run()
      : await env.DB.prepare('DELETE FROM sessions WHERE id=? AND user_id=?').bind(id, user.userId).run();
  }
  await forgetSession(request.headers.get('cookie'));
  await audit({ action: 'session.revoke', userId: user.userId, email: user.email, name: user.displayName, detail: p.get('others') ? 'Đăng xuất mọi máy khác' : p.get('userId') ? `Đăng xuất mọi máy của ${p.get('userId')}` : 'Đăng xuất một máy', request, status: 200 });
  return Response.json({ ok: true, removed: res.meta.changes ?? 0 });
}
