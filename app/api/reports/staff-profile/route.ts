import { env } from 'cloudflare:workers';
import { forbidden, getSessionUser, unauthorized } from '@/lib/auth/auth';
import { isOwner } from '@/lib/auth/access';
import { ownPosUserIds, targetStaff } from '@/lib/kpi/targets';
import { todayVn } from '@/lib/shared/report-time';
import { staffProfile } from '@/lib/reports/staff-profile';

// Hồ sơ làm việc của một nhân sự (lib/reports/staff-profile.ts). Chủ hệ thống, giám đốc xem mọi người; Leader / Mentor xem người
// mình quản lý; nhân viên chỉ xem chính mình.
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const params = new URL(request.url).searchParams;
  const id = (params.get('id') ?? '').trim().slice(0, 100);
  const pos = (params.get('pos') ?? '').split(',').map((p) => p.trim()).filter(Boolean).slice(0, 20);
  if (!id) return Response.json({ error: 'Thiếu mã nhân sự.' }, { status: 400 });
  if (!isOwner(user) && user.role !== 'director') {
    const allowed = user.role === 'staff' ? await ownPosUserIds(env.DB, user.email) : await targetStaff(env.DB, user);
    if (!allowed?.includes(id)) return forbidden();
  }
  return Response.json(await staffProfile(env.DB, id, todayVn(), pos), { headers: { 'Cache-Control': 'private, max-age=300' } });
}
