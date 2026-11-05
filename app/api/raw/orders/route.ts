import { env } from 'cloudflare:workers';
import { getSessionUser } from '@/lib/auth/auth';
import { POS } from '@/lib/shared/report-model';
import { DATE_RE } from '@/lib/shared/report-time';
import { checkSearchLimit } from '@/lib/shared/search-limit';
import { rawOrdersPage } from '@/lib/pancake/raw-orders';

// Đơn nguồn Pancake (lib/pancake/raw-orders.ts).
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: 'Đăng nhập để xem đơn nguồn.' }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const validPos = new Set<string>(POS.map((x) => x.id));
  const requested = [...(params.get('posIds') ?? '').split(','), params.get('posId') ?? ''].filter(Boolean);
  if (requested.some((id) => !validPos.has(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  const posIds = requested.length ? [...new Set(requested)] : POS.map((x) => x.id);
  const page = Number(params.get('page') ?? '1');
  if (!Number.isInteger(page) || page < 1 || page > 1000) return Response.json({ error: 'Trang không hợp lệ.' }, { status: 400 });
  const size = Math.min(100, Math.max(10, Number(params.get('size') ?? '25') || 25));
  const start = params.get('start') ?? '', end = params.get('end') ?? '';
  if ((start && !DATE_RE.test(start)) || (end && !DATE_RE.test(end)) || (start && end && start > end)) return Response.json({ error: 'Khoảng ngày không hợp lệ.' }, { status: 400 });
  const group = params.get('group') ?? '';
  const sellerId = (params.get('sellerId') ?? '').slice(0, 100);
  const q = (params.get('q') ?? '').trim().slice(0, 40);
  if (q) {
    const limited = await checkSearchLimit(env, user.userId);
    if (limited) return limited;
  }
  return Response.json(await rawOrdersPage(params, posIds, page, size, start, end, group, sellerId, q), { headers: { 'Cache-Control': 'no-store' } });
}
