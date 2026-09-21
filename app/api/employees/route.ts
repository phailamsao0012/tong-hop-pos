import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { parseTeam, teamFilter } from '@/lib/team';

// Danh sách nhân viên lấy từ Pancake (gộp cùng user_id ở nhiều POS).
export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized();
  const team = parseTeam(new URL(request.url).searchParams.get('team'));
  const rows = await env.DB.prepare(
    `SELECT user_id, MAX(name) AS name, MAX(department) AS department, GROUP_CONCAT(DISTINCT pos_id) AS pos_ids, MAX(is_active) AS active FROM pos_users WHERE name<>''${teamFilter('user_id', team)} GROUP BY user_id ORDER BY department, name`,
  ).all<{ user_id: string; name: string; department: string | null; pos_ids: string; active: number }>();
  // Bỏ tài khoản hệ thống Pancake (API_CONNECTION…) và tài khoản chỉ còn mã id thay tên (đã xoá / chưa đặt tên).
  const junk = (name: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(name) || /api[_ ]?connection|webhook/i.test(name);
  return Response.json(rows.results.filter((r) => !junk(r.name)).map((r) => ({
    id: r.user_id, name: r.name, department: r.department, posIds: r.pos_ids.split(','), active: !!r.active,
  })), { headers: { 'Cache-Control': 'private, max-age=300' } });
}
