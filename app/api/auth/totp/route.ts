import { disableTotp, enableTotp, saveTotpSecret, totpRow } from '@/lib/auth/auth-db';
import { forgetSession } from '@/lib/auth/auth';
import { getSessionUser, unauthorized } from '@/lib/auth/auth';
import { audit } from '@/lib/ops/audit';
import { decryptText, encryptText, otpauthUri, totpSecret, verifyTotp } from '@/lib/auth/mfa';

// Mã ứng dụng (Google Authenticator, 1Password…): action=setup (tạo secret, chưa bật) → enable (xác nhận mã) → disable (cần mã).
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  let body: { action?: unknown; code?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'JSON không hợp lệ.' }, { status: 400 }); }
  const now = new Date().toISOString();
  const row = await totpRow(user.userId);
  if (body.action === 'setup') {
    if (row?.totp_enabled_at) return Response.json({ error: 'Mã ứng dụng đã bật. Tắt trước khi tạo lại.' }, { status: 400 });
    const secret = totpSecret();
    await saveTotpSecret(user.userId, await encryptText(secret), now);
    return Response.json({ secret, uri: otpauthUri(secret, user.email) });
  }
  const code = typeof body.code === 'string' ? body.code : '';
  if (!row?.totp_secret) return Response.json({ error: 'Chưa tạo mã ứng dụng.' }, { status: 400 });
  const valid = await verifyTotp(await decryptText(row.totp_secret), code);
  if (!valid) return Response.json({ error: 'Mã không đúng. Kiểm tra giờ trên điện thoại và thử lại.' }, { status: 401 });
  if (body.action === 'enable') {
    await enableTotp(user.userId, now);
    await audit({ action: 'totp.enable', userId: user.userId, email: user.email, name: user.displayName, request, status: 200 });
    await forgetSession(request.headers.get('cookie'));
  return Response.json({ ok: true });
  }
  if (body.action === 'disable') {
    await disableTotp(user.userId, now);
    await audit({ action: 'totp.disable', userId: user.userId, email: user.email, name: user.displayName, request, status: 200 });
    await forgetSession(request.headers.get('cookie'));
  return Response.json({ ok: true });
  }
  return Response.json({ error: 'Hành động không hợp lệ.' }, { status: 400 });
}
