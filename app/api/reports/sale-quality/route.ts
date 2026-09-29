import { getSessionUser, unauthorized } from '@/lib/auth';
import { saleQuality } from '@/lib/sale-quality';
import { POS } from '@/lib/report-model';

// Chất lượng khách của Sale: một tháng mỗi lần (giới hạn lượng đơn phải đọc); ?staffId= để xem từng khách của một Sale.
export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized();
  const p = new URL(request.url).searchParams;
  const month = p.get('month') ?? '';
  if (!/^\d{4}-\d{2}$/.test(month)) return Response.json({ error: 'Tháng không hợp lệ.' }, { status: 400 });
  const valid = new Set<string>(POS.map((x) => x.id));
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !valid.has(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  if (p.get('team') === 'cskh') return Response.json({ error: 'Tài khoản chỉ xem bộ phận CSKH.' }, { status: 403 });
  const staffId = (p.get('staffId') ?? '').trim().slice(0, 100) || null;
  const report = await saleQuality({ posIds: requested.length ? requested : [...valid], month, staffId });
  return Response.json(report, { headers: { 'Cache-Control': 'private, no-store' } });
}
