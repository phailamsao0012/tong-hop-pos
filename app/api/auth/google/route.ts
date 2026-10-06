import { env } from 'cloudflare:workers';
import { normalizeEmail } from '@/lib/auth';
import { googleAuthUrl, verifyGoogleIdToken } from '@/lib/google-id';
import { startSession } from '@/lib/login-session';
import { createChallenge, mfaState, randomToken } from '@/lib/mfa';
import { safeNext } from '@/lib/hr-link';
import { audit } from '@/lib/audit';

// Đăng nhập bằng Google (06/10/2026). GET: phát nonce + state (cookie 10 phút) rồi chuyển sang trang chọn tài khoản Google.
// POST: trang /login gửi lại ID token Google trả về; khớp email với tài khoản web tổng có sẵn (không tạo tài khoản mới,
// vai trò giữ nguyên). Ai đã bật mã ứng dụng (TOTP) vẫn phải nhập mã như khi đăng nhập bằng mật khẩu.
const COOKIE = 'thp_google';
const cookieOf = (request: Request) => request.headers.get('cookie')?.split(';').map((p) => p.trim()).find((p) => p.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) ?? '';
const setCookie = (value: string, maxAge: number) => `${COOKIE}=${value}; Path=/api/auth/google; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
const clientId = () => env.GOOGLE_CLIENT_ID?.trim() ?? '';
const redirectUri = (request: Request) => `${new URL(request.url).origin}/login`;

export async function GET(request: Request) {
  if (!clientId()) return Response.json({ error: 'Chưa bật đăng nhập Google.' }, { status: 404 });
  const nonce = randomToken(18), state = randomToken(18);
  const next = safeNext(new URL(request.url).searchParams.get('next'));
  const headers = new Headers({ Location: googleAuthUrl(clientId(), redirectUri(request), nonce, state) });
  headers.append('Set-Cookie', setCookie(`${nonce}.${state}.${encodeURIComponent(next)}`, 600));
  return new Response(null, { status: 302, headers });
}

export async function POST(request: Request) {
  let body: { credential?: unknown; state?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'JSON không hợp lệ.' }, { status: 400 }); }
  const [nonce = '', state = '', ...rest] = cookieOf(request).split('.');
  const nextRaw = rest.join('.');
  const clear = setCookie('', 0);
  const fail = (error: string, status: number) => new Response(JSON.stringify({ error }), { status, headers: { 'Content-Type': 'application/json', 'Set-Cookie': clear } });
  if (!clientId()) return fail('Chưa bật đăng nhập Google.', 404);
  if (!nonce || !state || body.state !== state) return fail('Phiên chọn tài khoản Google đã hết hạn. Bấm lại nút Google.', 400);
  const claims = await verifyGoogleIdToken(typeof body.credential === 'string' ? body.credential : '', clientId(), { nonce });
  if (!claims) { await audit({ action: 'login.fail', detail: 'Google: token không hợp lệ', request, status: 401 }); return fail('Google không xác nhận được tài khoản. Thử lại.', 401); }
  const email = normalizeEmail(claims.email);
  const user = email ? await env.DB.prepare('SELECT id,email,name,disabled FROM users WHERE email=?').bind(email).first<{ id: string; email: string; name: string; disabled: number }>() : null;
  if (!user) { await audit({ action: 'login.fail', email: email ?? undefined, detail: 'Google: email chưa có tài khoản', request, status: 403 }); return fail(`Tài khoản Google ${claims.email} chưa có trên web tổng. Nhờ chủ hệ thống tạo tài khoản đúng email này.`, 403); }
  if (user.disabled) { await audit({ action: 'login.fail', userId: user.id, email: user.email, name: user.name, detail: 'Google: tài khoản đã khóa', request, status: 403 }); return fail('Tài khoản đã bị khóa.', 403); }
  const next = safeNext(decodeURIComponent(nextRaw));
  if ((await mfaState(user.id)).totpEnabled) {
    const challengeId = await createChallenge(user.id, 'totp', 'google');
    return new Response(JSON.stringify({ step: 'totp', challengeId, next }), { headers: { 'Content-Type': 'application/json', 'Set-Cookie': clear } });
  }
  await audit({ action: 'login', userId: user.id, email: user.email, name: user.name, detail: 'Google', request, status: 200 });
  const headers = await startSession(request, user, 'google', { trust: true });
  headers.append('Set-Cookie', clear);
  return new Response(JSON.stringify({ step: 'done', next }), { headers });
}
