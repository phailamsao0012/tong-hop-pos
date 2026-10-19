import { env } from 'cloudflare:workers';
import { forbidden, getSessionUser, unauthorized } from '@/lib/auth';
import { canView, isOwner } from '@/lib/access';
import { forecastForDisplay, readForecast } from '@/lib/forecast-run';
import { DATE_RE, todayVn } from '@/lib/report-time';

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!canView(user, 'center')) return forbidden('Tài khoản không có quyền xem Điều hành.');
  const date = new URL(request.url).searchParams.get('date') ?? todayVn();
  if (!DATE_RE.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date)
    return Response.json({ error: 'Ngày không hợp lệ.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  return Response.json(forecastForDisplay(await readForecast(env.DB, date), date, isOwner(user)), { headers: { 'Cache-Control': 'no-store' } });
}
