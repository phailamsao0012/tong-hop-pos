import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth';

// Danh sách nhân viên lấy từ Pancake (gộp cùng user_id ở nhiều POS).
export async function GET() {
  if (!(await getSessionUser())) return unauthorized();
  const rows = await env.DB.prepare(
    "SELECT user_id, MAX(name) AS name, MAX(department) AS department, GROUP_CONCAT(DISTINCT pos_id) AS pos_ids, MAX(is_active) AS active FROM pos_users WHERE name<>'' GROUP BY user_id ORDER BY department, name",
  ).all<{ user_id: string; name: string; department: string | null; pos_ids: string; active: number }>();
  return Response.json(rows.results.map((r) => ({
    id: r.user_id, name: r.name, department: r.department, posIds: r.pos_ids.split(','), active: !!r.active,
  })), { headers: { 'Cache-Control': 'private, max-age=300' } });
}
