// Danh sách người cho trang Hồ sơ nhân sự (anh Vũ 09/11/2026: trang hồ sơ riêng, chỉ anh và anh Nghĩa xem). Logic thuần để test được;
// câu SQL lấy danh sách ở lib/reports/staff-profile.ts (profilePeople).
export type ProfilePerson = { id: string; name: string; dept: 'sale' | 'cskh' | 'mkt' };
export type ProfileDeptFilter = 'all' | ProfilePerson['dept'];

/** Bỏ dấu, chữ thường: gõ "quynh" vẫn ra "Quỳnh". */
export const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();

/** Lọc theo bộ phận và ô tìm; người đã nghỉ xuống cuối, còn lại theo tên. */
export function filterPeople(people: ProfilePerson[], q: string, dept: ProfileDeptFilter, left: (id: string) => boolean = () => false) {
  const needle = fold(q);
  return people
    .filter((p) => (dept === 'all' || p.dept === dept) && (!needle || fold(p.name).includes(needle)))
    .sort((a, b) => Number(left(a.id)) - Number(left(b.id)) || a.name.localeCompare(b.name, 'vi'));
}
