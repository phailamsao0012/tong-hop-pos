// Tổng quan kiểu mới (cờ THP_UI_MOI, bản demo giao diện). Route mỏng: kiểm đăng nhập, quyền, bộ lọc rồi gọi lib/reports/overview-moi.ts.
import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth/auth';
import { canView } from '@/lib/auth/access';
import { overviewMoi } from '@/lib/reports/overview-moi';
import { POS } from '@/lib/shared/report-model';
import { DATE_RE, todayVn } from '@/lib/shared/report-time';
import { parseTeam } from '@/lib/teams/team';

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized('Đăng nhập để xem báo cáo.');
  if (env.THP_UI_MOI !== '1') return Response.json({ error: 'Trang này chỉ có ở bản thử giao diện mới.' }, { status: 404 });
  if (!canView(user, 'overview')) return Response.json({ error: 'Tài khoản của bạn không được cấp quyền xem phần này.' }, { status: 403 });
  const p = new URL(request.url).searchParams;
  const start = p.get('start') ?? '', end = p.get('end') ?? '';
  if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end) return Response.json({ error: 'Khoảng ngày không hợp lệ.' }, { status: 400 });
  if ((Date.parse(end) - Date.parse(start)) / 86400000 > 185) return Response.json({ error: 'Chọn kỳ tối đa 6 tháng.' }, { status: 400 });
  const valid = new Set<string>(POS.map((x) => x.id));
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !valid.has(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  const body = await overviewMoi({
    posIds: requested.length ? requested : [...valid], start, end, today: todayVn(), team: parseTeam(p.get('team')),
    withCost: canView(user, 'mkt-roas'),
  });
  return Response.json(body, { headers: { 'Cache-Control': 'private, no-store' } });
}
