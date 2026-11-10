import { getSessionUser, unauthorized } from '@/lib/auth/auth';
import { cskhBadge } from '@/lib/reports/cskh-badge';

// Hai con số nhỏ hiện dưới nhóm CSKH trên menu: cuộc gọi (ghi chú) hôm nay và khách quá 20 ngày chưa note (của nhân viên CSKH).
export async function GET() {
  if (!(await getSessionUser())) return unauthorized();
  return Response.json(await cskhBadge(), { headers: { 'Cache-Control': 'private, max-age=60' } });
}
