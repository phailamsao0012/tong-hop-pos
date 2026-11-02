import { getSessionUser, unauthorized } from '@/lib/auth/auth';
import { parseTrendsParams, trendsBody } from '@/lib/reports/trends-report';

// Xu hướng 10 tuần đến ngày cuối kỳ đang chọn, theo bộ phận / team / sản phẩm, và trạng thái đơn 14 ngày theo ngày tạo (lib/trends.ts).
export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized();
  const opts = parseTrendsParams(new URL(request.url).searchParams);
  if ('error' in opts) return Response.json(opts, { status: 400 });
  return Response.json(await trendsBody(opts), { headers: { 'Cache-Control': 'private, no-store' } });
}
