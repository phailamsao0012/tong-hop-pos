import { getSessionUser, unauthorized } from '@/lib/auth';
import { cskhLadder, ladderResponse } from '@/lib/purchase-ladder';
import { POS } from '@/lib/report-model';

// Bậc thang mua lại (T0 → T1 → T2…) của khách đang được phân công cho một nhân viên CSKH.
// ?step=k&listGroup=&mode=stopped|reached: danh sách khách của một ô (vd đã có T0 nhưng chưa mua T1).
export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized();
  const p = new URL(request.url).searchParams;
  const staffId = (p.get('assigned') ?? '').trim().slice(0, 100);
  if (!staffId || staffId === 'all' || staffId === '__none') return Response.json({ error: 'Chọn một nhân viên.' }, { status: 400 });
  const valid = new Set<string>(POS.map((x) => x.id));
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !valid.has(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  return Response.json(await ladderResponse(await cskhLadder({ staffId, posIds: requested.length ? requested : [...valid] }), p), { headers: { 'Cache-Control': 'private, no-store' } });
}
