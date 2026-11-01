// Danh sách nhân viên theo POS đang chọn (anh Vũ 31/10/2026): chọn Siêu Vô Gạo thì ô chọn người chỉ còn người có tài khoản
// trên POS đó (theo danh sách người dùng Pancake, pos_users). Người ở 2 POS thì chọn POS nào cũng hiện.
// Chọn đủ mọi POS (hoặc chưa chọn) thì giữ nguyên danh sách. Người không rõ POS (không có posIds) vẫn giữ để không mất ai.
export function staffInPos<T extends { posIds?: string[] | null }>(list: T[], selected: string[], allPosIds: string[]): T[] {
  const pick = new Set(selected);
  if (!pick.size || allPosIds.every((id) => pick.has(id))) return list;
  return list.filter((s) => !s.posIds?.length || s.posIds.some((id) => pick.has(id)));
}
