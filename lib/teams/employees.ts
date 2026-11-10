// Tách khỏi app/api/employees/route.ts (cải tổ B5, 05/11/2026): chỉ dời chỗ, câu SQL giữ nguyên.
import { env } from 'cloudflare:workers';
import { PRESENT_ON_POS, WORKING, teamFilter, type Team } from '@/lib/teams/team';

// Danh sách nhân viên lấy từ Pancake (gộp cùng user_id ở nhiều POS); người đã nghỉ theo web nhân sự không hiện.
export const listEmployees = (team: Team) => env.DB.prepare(
    // Người đã bị xoá / khoá khỏi mọi POS không còn trong danh sách (anh Vũ 02/11/2026); posIds chỉ gồm POS người đó còn tài khoản.
    `SELECT p.user_id AS user_id, MAX(p.name) AS name, MAX(p.department) AS department, GROUP_CONCAT(DISTINCT CASE WHEN ${PRESENT_ON_POS} THEN p.pos_id END) AS pos_ids, MAX(p.is_active) AS active
     FROM pos_users p LEFT JOIN pos_shops s ON s.id=p.pos_id WHERE p.name<>'' AND ${WORKING.replace('user_id', 'p.user_id')}${teamFilter('p.user_id', team, false)}
     GROUP BY p.user_id HAVING SUM(CASE WHEN ${PRESENT_ON_POS} THEN 1 ELSE 0 END)>0 ORDER BY 3, 2`,
  ).all<{ user_id: string; name: string; department: string | null; pos_ids: string | null; active: number }>();
