import { getSessionUser, unauthorized } from '@/lib/auth/auth';
import { POS } from '@/lib/shared/report-model';
import { goalShare } from '@/lib/kpi/goal-share';
import { grantedPosIds } from '@/lib/auth/pos-people';

// Tỉ lệ chia mục tiêu theo POS đang chọn, theo doanh thu tháng trước (lib/kpi/goal-share.ts).
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const p = new URL(request.url).searchParams;
  const month = p.get('month') ?? '';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return Response.json({ error: 'Tháng không hợp lệ.' }, { status: 400 });
  const valid = new Set<string>(POS.map((x) => x.id));
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !valid.has(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  // POS xin xem phải nằm trong POS được cấp, kể cả giám đốc (1.4, Đầu não kiểm 17–18/11); trống = POS được cấp.
  const posIds = grantedPosIds(user, requested);
  if (!posIds) return Response.json({ error: 'POS này không thuộc phạm vi của bạn.' }, { status: 403 });
  return Response.json(await goalShare(month, posIds), { headers: { 'Cache-Control': 'private, no-store' } });
}
