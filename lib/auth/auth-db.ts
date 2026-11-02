import { env } from 'cloudflare:workers';

// Câu SQL của các route app/api/auth/* (cải tổ B3, 02/11/2026): route chỉ kiểm đầu vào, gọi hàm ở đây và trả JSON.
// Chuyển nguyên câu từ route sang, không đổi điều kiện hay cột trả về.

export type LoginUserRow = {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  disabled: number;
};
export type PasskeyRow = {
  id: string;
  user_id: string;
  public_key: string;
  counter: number;
  transports: string | null;
};
export type SessionRow = {
  id: string;
  user_id: string;
  name: string;
  email: string;
  created_at: string;
  expires_at: string;
  user_agent: string | null;
  client: string | null;
  method: string | null;
  ip: string | null;
  place: string | null;
  device: string | null;
  last_seen_at: string | null;
};

// ---- users ----
export const userByEmail = (email: string) =>
  env.DB.prepare(
    'SELECT id,email,name,password_hash,disabled FROM users WHERE email=?',
  )
    .bind(email)
    .first<LoginUserRow>();

export const userById = (id: string) =>
  env.DB.prepare(
    'SELECT id,email,name,password_hash,disabled FROM users WHERE id=?',
  )
    .bind(id)
    .first<LoginUserRow>();

export const passwordHashOf = async (userId: string) =>
  (
    await env.DB.prepare('SELECT password_hash FROM users WHERE id=?')
      .bind(userId)
      .first<{ password_hash: string }>()
  )?.password_hash ?? null;

/** Đặt mật khẩu mới và huỷ mọi phiên của người đó. updatedAt: đổi mật khẩu (có ghi updated_at); quên mật khẩu thì không ghi. */
export async function setPasswordDropSessions(
  userId: string,
  hash: string,
  updatedAt?: string,
) {
  await env.DB.batch([
    updatedAt
      ? env.DB.prepare(
          'UPDATE users SET password_hash=?,updated_at=? WHERE id=?',
        ).bind(hash, updatedAt, userId)
      : env.DB.prepare('UPDATE users SET password_hash=? WHERE id=?').bind(
          hash,
          userId,
        ),
    env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(userId),
  ]);
}

export async function insertOwner(
  id: string,
  email: string,
  name: string,
  hash: string,
  now: string,
) {
  await env.DB.prepare(
    'INSERT INTO users (id,email,name,password_hash,role,disabled,created_at,updated_at) VALUES (?,?,?,?,?,0,?,?)',
  )
    .bind(id, email, name, hash, 'owner', now, now)
    .run();
}

// ---- duyệt đăng nhập trên app (QR) ----
export const pendingApproveRequest = (id: string, now: string) =>
  env.DB.prepare(
    "SELECT r.user_id,r.poll_hash,u.email FROM login_requests r JOIN users u ON u.id=r.user_id WHERE r.id=? AND r.kind='approve' AND r.status='pending' AND r.expires_at>?",
  )
    .bind(id, now)
    .first<{ user_id: string; poll_hash: string; email: string }>();

// ---- passkey ----
export const passkeysForExclude = async (userId: string) =>
  (
    await env.DB.prepare('SELECT id,transports FROM passkeys WHERE user_id=?')
      .bind(userId)
      .all<{ id: string; transports: string | null }>()
  ).results;

export async function insertPasskey(p: {
  id: string;
  userId: string;
  publicKey: string;
  counter: number;
  transports: string;
  deviceType: string;
  backedUp: boolean;
  name: string;
  createdAt: string;
}) {
  await env.DB.prepare(
    'INSERT INTO passkeys (id,user_id,public_key,counter,transports,device_type,backed_up,name,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
  )
    .bind(
      p.id,
      p.userId,
      p.publicKey,
      p.counter,
      p.transports,
      p.deviceType,
      p.backedUp ? 1 : 0,
      p.name,
      p.createdAt,
    )
    .run();
}

export const activePasskey = (id: string) =>
  env.DB.prepare(
    'SELECT p.id,p.user_id,p.public_key,p.counter,p.transports FROM passkeys p JOIN users u ON u.id=p.user_id WHERE p.id=? AND u.disabled=0',
  )
    .bind(id)
    .first<PasskeyRow>();

export const passkeyOfLockedUser = async (id: string) =>
  !!(await env.DB.prepare(
    'SELECT 1 AS x FROM passkeys p JOIN users u ON u.id=p.user_id WHERE p.id=? AND u.disabled=1',
  )
    .bind(id)
    .first());

export async function markPasskeyUsed(
  id: string,
  userId: string,
  counter: number,
  now: string,
) {
  await env.DB.batch([
    env.DB.prepare(
      'UPDATE passkeys SET counter=?,last_used_at=? WHERE id=?',
    ).bind(counter, now, id),
    env.DB.prepare('UPDATE users SET last_login_at=? WHERE id=?').bind(
      now,
      userId,
    ),
  ]);
}

export async function deletePasskey(id: string, userId: string) {
  await env.DB.prepare('DELETE FROM passkeys WHERE id=? AND user_id=?')
    .bind(id, userId)
    .run();
}

// ---- trạng thái bảo mật ----
export async function securityOverview(userId: string, now: string) {
  const [mfa, keys, devices] = await env.DB.batch([
    env.DB.prepare('SELECT totp_enabled_at FROM user_mfa WHERE user_id=?').bind(
      userId,
    ),
    env.DB.prepare(
      'SELECT id,name,device_type,backed_up,created_at,last_used_at FROM passkeys WHERE user_id=? ORDER BY created_at',
    ).bind(userId),
    env.DB.prepare(
      'SELECT id,created_at,last_used_at,user_agent,expires_at FROM trusted_devices WHERE user_id=? AND expires_at>? ORDER BY last_used_at DESC',
    ).bind(userId, now),
  ]);
  return {
    totpEnabled: !!(
      mfa.results[0] as { totp_enabled_at: string | null } | undefined
    )?.totp_enabled_at,
    passkeys: keys.results,
    devices: devices.results as { id: string }[],
  };
}

export async function deleteTrustedDevice(id: string, userId: string) {
  await env.DB.prepare('DELETE FROM trusted_devices WHERE id=? AND user_id=?')
    .bind(id, userId)
    .run();
}

// ---- mã ứng dụng (TOTP) ----
export const totpRow = (userId: string) =>
  env.DB.prepare(
    'SELECT totp_secret,totp_enabled_at FROM user_mfa WHERE user_id=?',
  )
    .bind(userId)
    .first<{ totp_secret: string | null; totp_enabled_at: string | null }>();

export async function saveTotpSecret(
  userId: string,
  secretEnc: string,
  now: string,
) {
  await env.DB.prepare(
    'INSERT INTO user_mfa (user_id,totp_secret,totp_enabled_at,updated_at) VALUES (?,?,NULL,?) ON CONFLICT(user_id) DO UPDATE SET totp_secret=excluded.totp_secret,totp_enabled_at=NULL,updated_at=excluded.updated_at',
  )
    .bind(userId, secretEnc, now)
    .run();
}

export async function enableTotp(userId: string, now: string) {
  await env.DB.prepare(
    'UPDATE user_mfa SET totp_enabled_at=?,updated_at=? WHERE user_id=?',
  )
    .bind(now, now, userId)
    .run();
}

export async function disableTotp(userId: string, now: string) {
  await env.DB.prepare(
    'UPDATE user_mfa SET totp_secret=NULL,totp_enabled_at=NULL,updated_at=? WHERE user_id=?',
  )
    .bind(now, userId)
    .run();
}

// ---- phiên đăng nhập ----
export async function listSessions(now: string, userId: string | null) {
  return (
    await env.DB.prepare(`SELECT s.id,s.user_id,u.name,u.email,s.created_at,s.expires_at,s.user_agent,s.client,s.method,s.ip,s.place,s.device,s.last_seen_at
    FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.expires_at>? ${userId === null ? '' : 'AND s.user_id=?'} ORDER BY COALESCE(s.last_seen_at,s.created_at) DESC LIMIT 500`)
      .bind(now, ...(userId === null ? [] : [userId]))
      .all<SessionRow>()
  ).results;
}

/**
 * Xoá phiên theo một trong ba cách. `guardFor`: id chủ hệ thống không phải chủ gốc — khi có thì không xoá phiên của
 * chủ hệ thống khác (trừ của chính mình). Trả số phiên đã xoá.
 */
export async function revokeSessions(
  q:
    | { others: { userId: string; keep: string } }
    | { userAll: { userId: string; keep: string } }
    | { one: { id: string; ownerOf?: string } },
  guardFor: string | null,
) {
  const guard =
    guardFor === null
      ? ''
      : " AND (user_id=? OR user_id NOT IN (SELECT id FROM users WHERE role='owner'))";
  const g = guardFor === null ? [] : [guardFor];
  let res;
  if ('others' in q)
    res = await env.DB.prepare('DELETE FROM sessions WHERE user_id=? AND id<>?')
      .bind(q.others.userId, q.others.keep)
      .run();
  else if ('userAll' in q)
    res = await env.DB.prepare(
      `DELETE FROM sessions WHERE user_id=? AND id<>?${guard}`,
    )
      .bind(q.userAll.userId, q.userAll.keep, ...g)
      .run();
  else if (q.one.ownerOf !== undefined)
    res = await env.DB.prepare('DELETE FROM sessions WHERE id=? AND user_id=?')
      .bind(q.one.id, q.one.ownerOf)
      .run();
  else
    res = await env.DB.prepare(`DELETE FROM sessions WHERE id=?${guard}`)
      .bind(q.one.id, ...g)
      .run();
  return res.meta.changes ?? 0;
}
