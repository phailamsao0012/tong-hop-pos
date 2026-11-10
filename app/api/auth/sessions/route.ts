import { listSessions, revokeSessions } from '@/lib/auth/auth-db';
import { isOwner } from '@/lib/auth/access';
import { primaryOwnerId } from '@/lib/auth/primary-owner';
import { audit } from '@/lib/ops/audit';
import { deviceLabel } from '@/lib/ops/audit';
import { forgetSession, getSessionUser, unauthorized } from '@/lib/auth/auth';
import { ensureAuthSchema } from '@/lib/auth/auth-schema';
import { METHOD_LABELS, currentSessionId, type LoginMethod } from '@/lib/auth/login-session';

// Thiết bị đang đăng nhập.
//   GET               → phiên của chính mình; GET ?scope=all (chủ hệ thống) → phiên của mọi tài khoản
//   DELETE ?id=…      → đăng xuất một phiên (của mình; chủ hệ thống: của bất kỳ ai)
//   DELETE ?others=1  → đăng xuất mọi máy khác của mình;  DELETE ?userId=… (chủ hệ thống) → đăng xuất mọi máy của người đó

export async function GET(request: Request) {
  const user = await getSessionUser(); if (!user) return unauthorized();
  await ensureAuthSchema();
  const all = new URL(request.url).searchParams.get('scope') === 'all' && isOwner(user);
  const rows = await listSessions(new Date().toISOString(), all ? null : user.userId);
  const current = await currentSessionId(request);
  return Response.json({
    sessions: rows.map((r) => ({
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
  let removed;
  if (p.get('others') === '1') removed = await revokeSessions({ others: { userId: user.userId, keep: current ?? '' } }, null);
  else {
    // Chủ hệ thống đăng xuất được máy của người khác, trừ tài khoản chủ hệ thống khác (chỉ chủ hệ thống gốc làm được).
    const primary = isOwner(user) && user.userId === await primaryOwnerId();
    const guardFor = primary ? null : user.userId;
    const target = p.get('userId');
    if (target && isOwner(user)) removed = await revokeSessions({ userAll: { userId: target, keep: current ?? '' } }, guardFor);
    else {
      const id = p.get('id') ?? '';
      removed = isOwner(user) ? await revokeSessions({ one: { id } }, guardFor) : await revokeSessions({ one: { id, ownerOf: user.userId } }, null);
    }
  }
  await forgetSession(request.headers.get('cookie'));
  await audit({ action: 'session.revoke', userId: user.userId, email: user.email, name: user.displayName, detail: p.get('others') ? 'Đăng xuất mọi máy khác' : p.get('userId') ? `Đăng xuất mọi máy của ${p.get('userId')}` : 'Đăng xuất một máy', request, status: 200 });
  return Response.json({ ok: true, removed });
}
