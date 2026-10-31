import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { todayVn } from '@/lib/report-time';
import { staffTenure } from '@/lib/tenure';

// Thâm niên T0, T1… của mọi nhân viên (cạnh tên trong các bảng). Chỉ trả ngày vào và số tháng, không trả trường nhạy cảm.
export async function GET() {
  if (!(await getSessionUser())) return unauthorized();
  const today = todayVn();
  return Response.json({ today, people: await staffTenure(env.DB, today) }, { headers: { 'Cache-Control': 'private, max-age=3600' } });
}
