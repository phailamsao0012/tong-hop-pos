import { env } from 'cloudflare:workers';
import { forbidden, getSessionUser, unauthorized } from '@/lib/auth/auth';
import { isOwner } from '@/lib/auth/access';
import { DATE_RE, todayVn } from '@/lib/shared/report-time';
import { longOrNow } from '@/lib/ops/long-response';
import { profilePeople, staffProfile } from '@/lib/reports/staff-profile';
import { staffProfilePeriod } from '@/lib/reports/staff-profile-period';

// Trang Hồ sơ nhân sự (lib/reports/staff-profile.ts): chỉ chủ hệ thống xem (anh Vũ 09/11/2026: "quyền xem mặc định chỉ tôi và anh Nghĩa").
// ?list=1 → danh sách người; ?id=… → hồ sơ một người.
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!isOwner(user)) return forbidden();
  const params = new URL(request.url).searchParams;
  if (params.get('list') === '1') return Response.json({ people: await profilePeople(env.DB) }, { headers: { 'Cache-Control': 'private, max-age=300' } });
  const id = (params.get('id') ?? '').trim().slice(0, 100);
  const pos = (params.get('pos') ?? '').split(',').map((p) => p.trim()).filter(Boolean).slice(0, 20);
  if (!id) return Response.json({ error: 'Thiếu mã nhân sự.' }, { status: 400 });
  // ?period=1&start=&end=: số của người này trong một kỳ (khối "Theo kỳ" đầu hồ sơ, gọi riêng để hồ sơ không chậm thêm).
  if (params.get('period') === '1') {
    const start = params.get('start') ?? '', end = params.get('end') ?? '';
    if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end || (Date.parse(end) - Date.parse(start)) / 86400000 > 370)
      return Response.json({ error: 'Khoảng ngày không hợp lệ.' }, { status: 400 });
    // Kỳ dài hơn 62 ngày: tính nền một lượt, nhớ 30 phút như báo cáo Marketing kỳ dài (lib/ops/long-job.ts).
    return longOrNow(request, user.userId, start, end, async () => ({ status: 200, body: await staffProfilePeriod(env.DB, id, start, end, todayVn(), pos) }));
  }
  return Response.json(await staffProfile(env.DB, id, todayVn(), pos), { headers: { 'Cache-Control': 'private, max-age=300' } });
}
