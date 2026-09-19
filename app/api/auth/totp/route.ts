import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { decryptText, encryptText, otpauthUri, totpSecret, verifyTotp } from '@/lib/mfa';

// Mã ứng dụng (Google Authenticator, 1Password…): action=setup (tạo secret, chưa bật) → enable (xác nhận mã) → disable (cần mã).
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  let body: { action?: unknown; code?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'JSON không hợp lệ.' }, { status: 400 }); }
  const now = new Date().toISOString();
  const row = await env.DB.prepare('SELECT totp_secret,totp_enabled_at FROM user_mfa WHERE user_id=?').bind(user.userId).first<{ totp_secret: string | null; totp_enabled_at: string | null }>();
  if (body.action === 'setup') {
    if (row?.totp_enabled_at) return Response.json({ error: 'Mã ứng dụng đã bật. Tắt trước khi tạo lại.' }, { status: 400 });
    const secret = totpSecret();
    await env.DB.prepare('INSERT INTO user_mfa (user_id,totp_secret,totp_enabled_at,updated_at) VALUES (?,?,NULL,?) ON CONFLICT(user_id) DO UPDATE SET totp_secret=excluded.totp_secret,totp_enabled_at=NULL,updated_at=excluded.updated_at')
      .bind(user.userId, await encryptText(secret), now).run();
    return Response.json({ secret, uri: otpauthUri(secret, user.email) });
  }
  const code = typeof body.code === 'string' ? body.code : '';
  if (!row?.totp_secret) return Response.json({ error: 'Chưa tạo mã ứng dụng.' }, { status: 400 });
  const valid = await verifyTotp(await decryptText(row.totp_secret), code);
  if (!valid) return Response.json({ error: 'Mã không đúng. Kiểm tra giờ trên điện thoại và thử lại.' }, { status: 401 });
  if (body.action === 'enable') {
    await env.DB.prepare('UPDATE user_mfa SET totp_enabled_at=?,updated_at=? WHERE user_id=?').bind(now, now, user.userId).run();
    return Response.json({ ok: true });
  }
  if (body.action === 'disable') {
    await env.DB.prepare('UPDATE user_mfa SET totp_secret=NULL,totp_enabled_at=NULL,updated_at=? WHERE user_id=?').bind(now, user.userId).run();
    return Response.json({ ok: true });
  }
  return Response.json({ error: 'Hành động không hợp lệ.' }, { status: 400 });
}
