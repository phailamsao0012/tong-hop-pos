import { getSessionUser, unauthorized } from '@/lib/auth';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  return Response.json(user, { headers: { 'Cache-Control': 'no-store' } });
}
