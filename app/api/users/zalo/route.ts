import { env } from 'cloudflare:workers';
import { forbidden, getSessionUser, unauthorized } from '@/lib/auth/auth';
import { isOwner } from '@/lib/auth/access';
import { teamZaloStates } from '@/lib/zalo/team-link';

// Trạng thái nối Zalo cho danh sách Tài khoản (chỉ chủ hệ thống, anh Vũ 07/11/2026). Nối thì gọi POST /api/web-teams/zalo không kèm teamId.
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!isOwner(user)) return forbidden();
  return Response.json({ zalo: await teamZaloStates(env.DB) }, { headers: { 'Cache-Control': 'no-store' } });
}

