import { getSessionUser, unauthorized } from '@/lib/auth/auth';
import { POS } from '@/lib/shared/report-model';
import { cskhBadge } from '@/lib/reports/cskh-badge';

// Hai con số nhỏ hiện dưới nhóm CSKH trên menu: cuộc gọi (ghi chú) hôm nay và khách quá 20 ngày chưa note (của nhân viên CSKH).
// Theo POS đang chọn (quy tắc POS, anh Vũ 12/11/2026); thiếu posIds = mọi POS.
export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized();
  const valid = new Set<string>(POS.map((x) => x.id));
  const requested = (new URL(request.url).searchParams.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !valid.has(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  return Response.json(await cskhBadge(requested.length === valid.size ? [] : requested), { headers: { 'Cache-Control': 'private, max-age=60' } });
}
