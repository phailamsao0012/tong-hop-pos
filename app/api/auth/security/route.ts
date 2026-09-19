import { env } from 'cloudflare:workers';
import { audit } from '@/lib/audit';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { mailConfigured } from '@/lib/mail';
import { DEVICE_COOKIE, readCookie, sha256b64 } from '@/lib/mfa';

// Trạng thái bảo mật của chính mình: mã ứng dụng, passkey, thiết bị tin cậy. DELETE ?device=id để gỡ một thiết bị.
export async function GET(request: Request) {
  const user = await getSessionUser(); if (!user) return unauthorized();
  const [mfa, keys, devices] = await env.DB.batch([
    env.DB.prepare('SELECT totp_enabled_at FROM user_mfa WHERE user_id=?').bind(user.userId),
    env.DB.prepare('SELECT id,name,device_type,backed_up,created_at,last_used_at FROM passkeys WHERE user_id=? ORDER BY created_at').bind(user.userId),
    env.DB.prepare('SELECT id,created_at,last_used_at,user_agent,expires_at FROM trusted_devices WHERE user_id=? AND expires_at>? ORDER BY last_used_at DESC').bind(user.userId, new Date().toISOString()),
  ]);
  const token = readCookie(request.headers.get('cookie'), DEVICE_COOKIE);
  const thisDevice = token ? await sha256b64(token) : null;
  return Response.json({
    totpEnabled: !!(mfa.results[0] as { totp_enabled_at: string | null } | undefined)?.totp_enabled_at,
    passkeys: keys.results, devices: (devices.results as { id: string }[]).map((d) => ({ ...d, current: d.id === thisDevice })),
    mfaRequired: user.mfaRequired, mfaEnabled: user.mfaEnabled, mailConfigured: mailConfigured(), role: user.role,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE(request: Request) {
  const user = await getSessionUser(); if (!user) return unauthorized();
  const id = new URL(request.url).searchParams.get('device') ?? '';
  await env.DB.prepare('DELETE FROM trusted_devices WHERE id=? AND user_id=?').bind(id, user.userId).run();
  await audit({ action: 'device.remove', userId: user.userId, email: user.email, name: user.displayName, target: id, request, status: 200 });
  return Response.json({ ok: true });
}
