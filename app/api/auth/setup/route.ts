import { env } from 'cloudflare:workers';
import {
  createSession, hasAnyUser, hashPassword, normalizeEmail, sessionCookie, validPassword,
} from '@/lib/auth';

// Tạo tài khoản quản trị đầu tiên. Chỉ hoạt động khi chưa có người dùng nào.
export async function GET() {
  return Response.json({ needsSetup: !(await hasAnyUser()) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  if (await hasAnyUser())
    return Response.json({ error: 'Web đã có tài khoản; đăng nhập để tiếp tục.' }, { status: 409 });
  let body: { email?: unknown; name?: unknown; password?: unknown };
  try { body = await request.json(); }
  catch { return Response.json({ error: 'JSON không hợp lệ.' }, { status: 400 }); }
  const email = normalizeEmail(body.email);
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 100) : '';
  if (!email || !name || !validPassword(body.password))
    return Response.json({ error: 'Cần email hợp lệ, tên và mật khẩu từ 8 ký tự.' }, { status: 400 });
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await env.DB.prepare(
    'INSERT INTO users (id,email,name,password_hash,role,disabled,created_at,updated_at) VALUES (?,?,?,?,?,0,?,?)',
  ).bind(id, email, name, await hashPassword(body.password), 'owner', now, now).run();
  const { token, expires } = await createSession(id, request.headers.get('user-agent'));
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': sessionCookie(token, expires) } });
}
