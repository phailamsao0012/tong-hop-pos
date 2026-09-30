import { getSessionUser, unauthorized } from '@/lib/auth';
import { MAX_DAYS, monthRange, periodTooLong, saleQuality } from '@/lib/sale-quality';
import { POS } from '@/lib/report-model';
import { DATE_RE } from '@/lib/report-time';

// Chất lượng khách của Sale theo kỳ ?start=&end= (bộ lọc ngày chung, tối đa MAX_DAYS ngày; ?month=YYYY-MM vẫn nhận);
// ?staffId= để xem từng khách của một Sale.
export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized();
  const p = new URL(request.url).searchParams;
  const month = p.get('month') ?? '';
  const range = /^\d{4}-\d{2}$/.test(month) ? monthRange(month) : { start: p.get('start') ?? '', end: p.get('end') ?? '' };
  if (!DATE_RE.test(range.start) || !DATE_RE.test(range.end) || range.start > range.end) return Response.json({ error: 'Khoảng ngày không hợp lệ.' }, { status: 400 });
  if (periodTooLong(range.start, range.end)) return Response.json({ error: `Kỳ dài quá ${MAX_DAYS} ngày, số khách cần đọc quá nhiều. Hãy chọn kỳ ngắn hơn (ví dụ Tháng trước hoặc 90 ngày qua).` }, { status: 400 });
  const valid = new Set<string>(POS.map((x) => x.id));
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !valid.has(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  if (p.get('team') === 'cskh') return Response.json({ error: 'Tài khoản chỉ xem bộ phận CSKH.' }, { status: 403 });
  const staffId = (p.get('staffId') ?? '').trim().slice(0, 100) || null;
  const report = await saleQuality({ posIds: requested.length ? requested : [...valid], ...range, staffId });
  return Response.json(report, { headers: { 'Cache-Control': 'private, no-store' } });
}
