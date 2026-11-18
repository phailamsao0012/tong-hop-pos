// Lọc người theo POS người xem (plan sửa web 1.4, Đầu não kiểm 17–18/11/2026): danh sách nhân viên, thâm niên, ca làm việc,
// trạng thái nghỉ… chỉ gồm người có tài khoản POS ở POS người xem được cấp. null = không giới hạn POS (chủ hệ thống, người được mọi POS).
import { allowedPos, type Access } from '@/lib/auth/access';

export async function posPeopleFilter(db: D1Database, user: Pick<Access, 'posIds' | 'role' | 'views' | 'team'>): Promise<((id: string) => boolean) | null> {
  if (user.posIds === null) return null;
  const rows = await db.prepare('SELECT DISTINCT user_id FROM pos_users WHERE pos_id IN (SELECT value FROM json_each(?))')
    .bind(JSON.stringify(allowedPos(user as Access))).all<{ user_id: string }>();
  const ids = new Set(rows.results.map((r) => String(r.user_id)));
  return (id: string) => ids.has(id);
}

/** POS xin xem (?posIds=…) phải nằm trong POS được cấp; trống = mọi POS được cấp. Trả null khi xin POS ngoài phạm vi. */
export function grantedPosIds(user: Pick<Access, 'posIds'>, requested: string[]): string[] | null {
  const allowed = allowedPos(user as Access);
  if (requested.some((id) => !allowed.includes(id))) return null;
  return requested.length ? requested : allowed;
}
