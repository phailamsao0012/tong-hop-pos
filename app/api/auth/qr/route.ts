import { env } from 'cloudflare:workers';
import { audit } from '@/lib/audit';
import { createLoginRequest, pollLoginRequest } from '@/lib/login-requests';
import { OTP_MINUTES, createChallenge, maskEmail, otpCode, sha256b64 } from '@/lib/mfa';
import { mailConfigured, otpMail, sendMail } from '@/lib/mail';

// Đăng nhập bằng QR / duyệt trên app — phía máy đang đăng nhập (chưa có phiên):
//   {action:'create'}                 → mã QR mới {id, pollToken, number, seconds}; QR chứa <origin>/qr/<id>
//   {action:'poll', id, pollToken}    → {status: pending|approved→done|denied|expired|invalid}; 'done' kèm cookie phiên
//   {action:'email', id, pollToken}   → bước hai 'approve' nhưng không mở được app: gửi mã về email như cũ
export async function POST(request: Request) {
  let body: { action?: unknown; id?: unknown; pollToken?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'JSON không hợp lệ.' }, { status: 400 }); }
  const id = typeof body.id === 'string' ? body.id.slice(0, 80) : '';
  const pollToken = typeof body.pollToken === 'string' ? body.pollToken.slice(0, 120) : '';
  if (body.action === 'create') {
    try {
      const r = await createLoginRequest(request, 'qr', null);
      return Response.json({ ...r, url: `${new URL(request.url).origin}/qr/${r.id}` }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (e) { return Response.json({ error: e instanceof Error ? e.message : 'Không tạo được mã.' }, { status: 429 }); }
  }
  if (body.action === 'poll') {
    const r = await pollLoginRequest(request, id, pollToken);
    if (r.status === 'done' && r.headers) return new Response(JSON.stringify({ status: 'done' }), { headers: r.headers });
    return Response.json({ status: r.status }, { headers: { 'Cache-Control': 'no-store' } });
  }
  if (body.action === 'email') {
    const row = await env.DB.prepare("SELECT r.user_id,r.poll_hash,u.email FROM login_requests r JOIN users u ON u.id=r.user_id WHERE r.id=? AND r.kind='approve' AND r.status='pending' AND r.expires_at>?")
      .bind(id, new Date().toISOString()).first<{ user_id: string; poll_hash: string; email: string }>();
    if (!row || row.poll_hash !== await sha256b64(pollToken)) return Response.json({ error: 'Yêu cầu đã hết hạn, đăng nhập lại.' }, { status: 410 });
    if (!mailConfigured()) return Response.json({ error: 'Chưa cấu hình gửi thư. Dùng app hoặc mã ứng dụng.' }, { status: 400 });
    const code = otpCode();
    const challengeId = await createChallenge(row.user_id, 'otp', await sha256b64(code));
    const m = otpMail(code, OTP_MINUTES);
    try { await sendMail(row.email, m.subject, m.html); }
    catch (e) { console.error('otp mail failed', e); return Response.json({ error: 'Không gửi được mã tới email.' }, { status: 502 }); }
    await audit({ action: 'login.otp', userId: row.user_id, email: row.email, detail: 'Chọn nhận mã email thay vì duyệt trên app', request, status: 200 });
    return Response.json({ step: 'otp', challengeId, to: maskEmail(row.email), minutes: OTP_MINUTES });
  }
  return Response.json({ error: 'Hành động không hợp lệ.' }, { status: 400 });
}
