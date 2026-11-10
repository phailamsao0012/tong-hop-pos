import { getSessionUser } from '@/lib/auth/auth';
import { POS } from '@/lib/shared/report-model';
import { liveReport } from '@/lib/reports/live-report';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

// Số chốt nóng theo khoảng ngày (lib/reports/live-report.ts).
export async function GET(request: Request) {
  if (!(await getSessionUser()))
    return Response.json({ error: 'Đăng nhập để xem báo cáo.' }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const start = params.get('start') ?? '';
  const end = params.get('end') ?? '';
  if (!datePattern.test(start) || !datePattern.test(end) || start > end)
    return Response.json({ error: 'Khoảng ngày báo cáo không hợp lệ.' }, { status: 400 });
  const endDate = new Date(`${end}T00:00:00Z`);
  endDate.setUTCDate(endDate.getUTCDate() + 1);
  const endExclusive = endDate.toISOString().slice(0, 10);

  const requestedPos = (params.get('posIds') ?? '').split(',').filter(Boolean);
  const validPos = new Set(POS.map((pos) => pos.id));
  const posIds = requestedPos.length ? requestedPos : POS.map((pos) => pos.id);
  if (posIds.some((id) => !validPos.has(id as typeof POS[number]['id'])))
    return Response.json({ error: 'Bộ lọc POS không hợp lệ.' }, { status: 400 });

  const employeeIds = (params.get('employeeIds') ?? '').split(',').filter(Boolean);
  if (employeeIds.length > 50 || employeeIds.some((id) => id.length > 100))
    return Response.json({ error: 'Bộ lọc nhân viên không hợp lệ.' }, { status: 400 });

  const includeHours = params.get('includeHours') === '1';
  const includeMonthly = params.get('includeMonthly') === '1';
  const onlyMonthly = params.get('onlyMonthly') === '1';

  return Response.json(await liveReport({ posIds, employeeIds, start, end, endExclusive, includeHours, includeMonthly, onlyMonthly }), { headers: { 'Cache-Control': 'private, no-store' } });
}
