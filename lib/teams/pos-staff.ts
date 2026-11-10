// Danh sách nhân viên theo POS đang chọn (anh Vũ 31/10/2026): chọn Siêu Vô Gạo thì ô chọn người chỉ còn người có tài khoản
// trên POS đó (theo danh sách người dùng Pancake, pos_users). Người ở 2 POS thì chọn POS nào cũng hiện.
// Chọn đủ mọi POS (hoặc chưa chọn) thì giữ nguyên danh sách. Người không rõ POS bị ẩn khi đang lọc POS
// (anh Vũ 03/11/2026: "CẤM không được có thêm nhân sự của pos khác").
export function staffInPos<T extends { posIds?: string[] | null }>(list: T[], selected: string[], allPosIds: string[]): T[] {
  const pick = new Set(selected);
  if (!pick.size || allPosIds.every((id) => pick.has(id))) return list;
  return list.filter((s) => !!s.posIds?.some((id) => pick.has(id)));
}

/** Hàm lọc theo mã người cho các bảng không mang sẵn posIds (team, KPI, tăng trưởng…), áp toàn web (anh Vũ 02/11/2026:
 *  "chọn pos nào sẽ ra nhân sự của pos đó, áp cho toàn web, toàn mục"). Chọn đủ POS thì null (không lọc).
 *  Người không có trong danh sách (đã nghỉ, tài khoản lạ) bị ẩn khi đang lọc POS, như staffInPos. */
export function posStaffFilter(list: { id: string; posIds?: string[] | null }[], selected: string[], allPosIds: string[]): ((id: string) => boolean) | null {
  const pick = new Set(selected);
  if (!pick.size || allPosIds.every((id) => pick.has(id))) return null;
  const known = new Map(list.map((s) => [s.id, s.posIds ?? []]));
  return (id) => !!known.get(id)?.some((p) => pick.has(p));
}
