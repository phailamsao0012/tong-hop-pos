import { clearSessionCookie, destroySession } from '@/lib/auth';

export async function POST(request: Request) {
  await destroySession(request.headers.get('cookie'));
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': clearSessionCookie() } });
}
