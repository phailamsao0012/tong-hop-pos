import { getSessionUser, unauthorized } from '@/lib/auth';
import { pancakeReference } from '@/lib/pancake-reference';
import { POS } from '@/lib/report-model';
import { DATE_RE, comparePeriod } from '@/lib/report-time';

// Số tham chiếu Pancake cho kỳ đang xem và kỳ liền trước (cùng số ngày), từng POS.
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized('Đăng nhập để xem báo cáo.');
  const params = new URL(request.url).searchParams;
  const start = params.get('start') ?? '', end = params.get('end') ?? '';
  if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end)
    return Response.json({ error: 'Khoảng ngày không hợp lệ.' }, { status: 400 });
  const valid = new Set<string>(POS.map((p) => p.id));
  const requested = (params.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !valid.has(id))) return Response.json({ error: 'Bộ lọc POS không hợp lệ.' }, { status: 400 });
  const posIds = requested.length ? requested : [...valid];
  const prev = comparePeriod(start, end, 'previous');
  let current, previous;
  try {
    [current, previous] = await Promise.all([pancakeReference(posIds, start, end), pancakeReference(posIds, prev.start, prev.end)]);
  } catch (error) {
    console.error('pancake-ref', error);
    return Response.json({ error: `Không tính được số tham chiếu: ${error instanceof Error ? error.message : 'lỗi không rõ'}` }, { status: 500 });
  }
  return Response.json({ start, end, prevStart: prev.start, prevEnd: prev.end, current, previous }, { headers: { 'Cache-Control': 'private, no-store' } });
}
