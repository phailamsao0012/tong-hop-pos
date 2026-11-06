import { mentorReport } from '@/lib/teams/staff-scope';
import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized, type SessionUser } from '@/lib/auth/auth';
import { NON_OWNER_MAX_ROWS, canExport } from '@/lib/auth/access';
import { POS } from '@/lib/shared/report-model';
import { DATE_RE, todayVn } from '@/lib/shared/report-time';
import { parseTeam } from '@/lib/teams/team';
import { checkSearchLimit } from '@/lib/shared/search-limit';
import { customersList, periodTop } from '@/lib/reports/customers-list';

// Danh sách khách theo POS × SĐT (lib/reports/customers-list.ts).
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (user.role === 'mentor' && !user.teamScope) return mentorReport(env.DB, user, request);
  return customersRoute(request, user);
}

async function customersRoute(request: Request, user: SessionUser) {
  const p = new URL(request.url).searchParams;
  const validPos = new Set<string>(POS.map((x) => x.id));
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !validPos.has(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  const posIds = requested.length ? requested : POS.map((x) => x.id);
  const q = (p.get('q') ?? '').trim().slice(0, 60);
  if (q) {
    const limited = await checkSearchLimit(env, user.userId);
    if (limited) return limited;
  }
  const group = p.get('group') ?? 'all';
  const sellerId = (p.get('sellerId') ?? '').slice(0, 100);
  const page = Math.max(1, Math.min(500, Number(p.get('page') ?? '1') || 1));
  // size: 50 theo trang; "Xem toàn bộ" tới 5.000; xuất Excel tới 20.000.
  const size = Math.max(1, Math.min(20000, Number(p.get('size') ?? 50) || 50));
  // Tải lớn (xuất Excel tới 20.000 khách) chỉ chủ hệ thống; vai trò khác tối đa NON_OWNER_MAX_ROWS một lượt.
  if (size > NON_OWNER_MAX_ROWS && !canExport(user)) return Response.json({ error: 'Nhân viên không được tải toàn bộ danh sách khách.' }, { status: 403 });
  const today = todayVn();
  const sort = p.get('sort') ?? 'recent';
  const team = parseTeam(p.get('team'));
  const start = p.get('start') ?? '', end = p.get('end') ?? '';
  // Có kỳ → "Top khách trong kỳ": gộp đơn thành công tạo trong kỳ theo (POS, SĐT), đọc theo chỉ mục (pos_id, created_at).
  if (start || end) {
    if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end) return Response.json({ error: 'Khoảng ngày không hợp lệ.' }, { status: 400 });
    return Response.json(await periodTop({ posIds, q, sellerId, page, size, sort, start, end, today, team }), { headers: { 'Cache-Control': 'private, no-store' } });
  }
  return Response.json(await customersList(p, posIds, q, group, sellerId, page, size, today, sort, team), { headers: { 'Cache-Control': 'private, no-store' } });
}
