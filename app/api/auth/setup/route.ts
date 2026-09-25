import { startSession } from '@/lib/login-session';
import { env } from 'cloudflare:workers';
import {
  hasAnyUser, hashPassword, normalizeEmail, passwordProblem,
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
  if (!email || !name) return Response.json({ error: 'Cần email hợp lệ và tên.' }, { status: 400 });
  const problem = await passwordProblem(body.password, email);
  if (problem || typeof body.password !== 'string') return Response.json({ error: problem ?? 'Mật khẩu không hợp lệ.' }, { status: 400 });
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await env.DB.prepare(
    'INSERT INTO users (id,email,name,password_hash,role,disabled,created_at,updated_at) VALUES (?,?,?,?,?,0,?,?)',
  ).bind(id, email, name, await hashPassword(body.password), 'owner', now, now).run();
  return new Response(JSON.stringify({ ok: true }), { headers: await startSession(request, { id, name, email }, 'setup', { trust: true }) });
}
