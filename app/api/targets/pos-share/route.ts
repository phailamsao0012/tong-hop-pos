import { getSessionUser, unauthorized } from '@/lib/auth/auth';
import { POS } from '@/lib/shared/report-model';
import { goalShare } from '@/lib/kpi/goal-share';

// Tỉ lệ chia mục tiêu theo POS đang chọn, theo doanh thu tháng trước (lib/kpi/goal-share.ts).
export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized();
  const p = new URL(request.url).searchParams;
  const month = p.get('month') ?? '';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return Response.json({ error: 'Tháng không hợp lệ.' }, { status: 400 });
  const valid = new Set<string>(POS.map((x) => x.id));
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !valid.has(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  return Response.json(await goalShare(month, requested.length ? requested : [...valid]), { headers: { 'Cache-Control': 'private, max-age=300' } });
}
