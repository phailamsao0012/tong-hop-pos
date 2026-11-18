import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth/auth';
import { todayVn } from '@/lib/shared/report-time';
import { staffTenure } from '@/lib/teams/tenure';
import { posPeopleFilter } from '@/lib/auth/pos-people';

// Thâm niên T0, T1… của mọi nhân viên (cạnh tên trong các bảng). Chỉ trả ngày vào và số tháng, không trả trường nhạy cảm.
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const today = todayVn(), keep = await posPeopleFilter(env.DB, user);
  const people = await staffTenure(env.DB, today);
  // Chỉ người ở POS người xem được cấp; không giữ ở trình duyệt (đổi tài khoản trên cùng máy không thấy số người trước).
  return Response.json({ today, people: keep ? Object.fromEntries(Object.entries(people).filter(([id]) => keep(id))) : people }, { headers: { 'Cache-Control': 'private, no-store' } });
}
