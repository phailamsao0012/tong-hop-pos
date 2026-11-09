import { env } from 'cloudflare:workers';
import { forbidden, getSessionUser, unauthorized } from '@/lib/auth/auth';
import { isOwner } from '@/lib/auth/access';
import { todayVn } from '@/lib/shared/report-time';
import { profilePeople, staffProfile } from '@/lib/reports/staff-profile';

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
  return Response.json(await staffProfile(env.DB, id, todayVn(), pos), { headers: { 'Cache-Control': 'private, max-age=300' } });
}
