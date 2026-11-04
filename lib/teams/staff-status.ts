// Trạng thái từng người do chủ hệ thống đặt tay (anh Vũ 04/11/2026): tên thường = đang làm, tên vàng = tạm nghỉ, tên đỏ = đã nghỉ.
// Chỉ đổi màu tên, không đổi số. Lưu một dòng app_settings (khoá STAFF_STATUS_KEY), không cần migration.
export const STAFF_STATUS_KEY = 'staff_status_v1';
export const STAFF_STATUSES = { working: 'Đang làm', paused: 'Tạm nghỉ', left: 'Đã nghỉ' } as const;
export type StaffStatus = keyof typeof STAFF_STATUSES;
/** Chỉ lưu người khác "Đang làm"; mã POS tối đa 100 ký tự, tối đa 2000 người. */
export function cleanStatusMap(v: unknown): Record<string, Exclude<StaffStatus, 'working'>> {
  const out: Record<string, Exclude<StaffStatus, 'working'>> = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [id, s] of Object.entries(v as Record<string, unknown>).slice(0, 2000)) {
    if (id && id.length <= 100 && (s === 'paused' || s === 'left')) out[id] = s;
  }
  return out;
}
export function parseStatusJson(json: string | null | undefined) {
  try { return cleanStatusMap(json ? JSON.parse(json) : {}); } catch { return {}; }
}
/** Áp các thay đổi {id: trạng thái} lên bản cũ; "working" là xoá khỏi danh sách. */
export function applyStatusChanges(prev: Record<string, Exclude<StaffStatus, 'working'>>, changes: unknown) {
  const next = { ...prev };
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return next;
  for (const [id, s] of Object.entries(changes as Record<string, unknown>).slice(0, 2000)) {
    if (!id || id.length > 100) continue;
    if (s === 'working') delete next[id];
    else if (s === 'paused' || s === 'left') next[id] = s;
  }
  return cleanStatusMap(next);
}
