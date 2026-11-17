// Lọc trang Marketing theo Team Sale (anh Vũ 12/11/2026): "đội sale nào chốt cho team mkt nào".
// Đơn tính cho team của NGƯỜI BẤM XÁC NHẬN đơn (first_confirmed_by); đơn chưa xác nhận (chỉ dùng cho số về / đơn tạo) tính theo Sale được gán.
// Team lấy từ web nhân sự (cùng unitSubquery với nút Team đầu trang).
import { HR_UNIT_RE, unitSubquery } from '@/lib/teams/team';

/** Người "chốt" của đơn: người xác nhận đầu tiên, chưa có thì Sale được gán. */
export const CLOSER_SQL = "COALESCE(NULLIF(o.first_confirmed_by,''),o.seller_id)";

export function saleTeamSql(saleTeam: string | null | undefined): { closer: string; lead: string } | null {
  const id = (saleTeam ?? '').trim();
  if (!id || id === '__all' || !HR_UNIT_RE.test(id)) return null;
  const sub = unitSubquery({ id, name: '', dept: 'sale' });
  return { closer: `${CLOSER_SQL} IN ${sub}`, lead: `o.seller_id IN ${sub}` };
}
