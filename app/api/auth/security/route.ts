import { deleteTrustedDevice, securityOverview } from '@/lib/auth/auth-db';
import { audit } from '@/lib/ops/audit';
import { getSessionUser, unauthorized } from '@/lib/auth/auth';
import { mailConfigured } from '@/lib/ops/mail';
import { DEVICE_COOKIE, readCookie, sha256b64 } from '@/lib/auth/mfa';

// Trạng thái bảo mật của chính mình: mã ứng dụng, passkey, thiết bị tin cậy. DELETE ?device=id để gỡ một thiết bị.
export async function GET(request: Request) {
  const user = await getSessionUser(); if (!user) return unauthorized();
  const sec = await securityOverview(user.userId, new Date().toISOString());
  const token = readCookie(request.headers.get('cookie'), DEVICE_COOKIE);
  const thisDevice = token ? await sha256b64(token) : null;
  return Response.json({
    totpEnabled: sec.totpEnabled,
    passkeys: sec.passkeys, devices: sec.devices.map((d) => ({ ...d, current: d.id === thisDevice })),
    mfaRequired: user.mfaRequired, mfaEnabled: user.mfaEnabled, mailConfigured: mailConfigured(), role: user.role,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE(request: Request) {
  const user = await getSessionUser(); if (!user) return unauthorized();
  const id = new URL(request.url).searchParams.get('device') ?? '';
  await deleteTrustedDevice(id, user.userId);
  await audit({ action: 'device.remove', userId: user.userId, email: user.email, name: user.displayName, target: id, request, status: 200 });
  return Response.json({ ok: true });
}
