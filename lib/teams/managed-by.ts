// Số người Leader / Mentor đang quản lý (anh Vũ 04/11/2026), dùng ở Theo team, KPI team và Chia team (app/manager-chip.tsx).
/** Gom người theo người quản lý: mỗi team cho tên quản lý và tên thành viên; một người cầm nhiều team thì cộng hết, bỏ trùng. */
export function managedBy<T>(teams: T[], manager: (t: T) => string | null | undefined, members: (t: T) => string[]) {
  const map = new Map<string, string[]>();
  for (const t of teams) {
    const m = manager(t);
    if (!m) continue;
    map.set(m, [...new Set([...(map.get(m) ?? []), ...members(t)])]);
  }
  return map;
}
