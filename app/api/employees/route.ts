import { getSessionUser, unauthorized } from '@/lib/auth/auth';
import { allowedPos } from '@/lib/auth/access';
import { parseTeam } from '@/lib/teams/team';
import { listEmployees } from '@/lib/teams/employees';

// Danh sách nhân viên lấy từ Pancake (gộp cùng user_id ở nhiều POS); người đã nghỉ theo web nhân sự không hiện.
// Chỉ người có tài khoản ở POS người xem được cấp, và chỉ kèm các POS đó (plan sửa web 1.4, 18/11/2026: trước đây trả mọi POS).
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const allowed = user.posIds === null ? null : new Set(allowedPos(user));
  const team = parseTeam(new URL(request.url).searchParams.get('team'));
  const rows = await listEmployees(team);
  // Bỏ tài khoản hệ thống Pancake (API_CONNECTION…) và tài khoản chỉ còn mã id thay tên (đã xoá / chưa đặt tên).
  const junk = (name: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(name) || /api[_ ]?connection|webhook/i.test(name);
  return Response.json(rows.results.filter((r) => !junk(r.name)).map((r) => ({
    id: r.user_id, name: r.name, department: r.department, posIds: (r.pos_ids ?? '').split(',').filter((p) => p && (!allowed || allowed.has(p))), active: !!r.active,
  })).filter((r) => !allowed || r.posIds.length > 0), { headers: { 'Cache-Control': 'private, max-age=300' } });
}
