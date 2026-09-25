import { audit } from '@/lib/audit';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { decideLoginRequest, pendingForUser, requestForApproval } from '@/lib/login-requests';
import { currentSessionId } from '@/lib/login-session';

// Phía app đã đăng nhập:
//   GET                  → {items}: yêu cầu duyệt đăng nhập đang chờ của chính mình (app hỏi vài giây một lần khi đang mở)
//   GET ?id=<mã QR>      → {item}: thông tin yêu cầu vừa quét (máy nào, ở đâu, 3 số để chọn)
//   POST {id, number, decision:'approve'|'deny'} → {ok, status}
export async function GET(request: Request) {
  const user = await getSessionUser(); if (!user) return unauthorized();
  const id = new URL(request.url).searchParams.get('id');
  if (id) {
    const item = await requestForApproval(id.slice(0, 80), user.userId);
    return item ? Response.json({ item }, { headers: { 'Cache-Control': 'no-store' } }) : Response.json({ error: 'Mã đã hết hạn hoặc đã dùng. Tải lại mã trên máy tính rồi quét lại.' }, { status: 410 });
  }
  return Response.json({ items: await pendingForUser(user.userId) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const user = await getSessionUser(); if (!user) return unauthorized();
  let body: { id?: unknown; number?: unknown; decision?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'JSON không hợp lệ.' }, { status: 400 }); }
  const id = typeof body.id === 'string' ? body.id.slice(0, 80) : '';
  const number = typeof body.number === 'number' ? body.number : Number(body.number ?? NaN);
  const decision = body.decision === 'approve' ? 'approve' : 'deny';
  const r = await decideLoginRequest(id, user.userId, await currentSessionId(request), Number.isFinite(number) ? number : null, decision);
  if (r.status === 'expired') return Response.json({ ok: false, status: r.status, error: 'Yêu cầu đã hết hạn hoặc đã được xử lý.' }, { status: 410 });
  await audit({ action: r.ok ? 'login.approve' : 'login.deny', userId: user.userId, email: user.email, name: user.displayName,
    detail: `${r.kind === 'qr' ? 'Quét QR' : 'Duyệt bước hai'} cho ${r.device ?? 'máy không rõ'}${r.status === 'wrong-number' ? ' · chọn sai số' : ''}`, request, status: 200 });
  return Response.json({ ok: r.ok, status: r.status });
}
