// Thời gian tự khoá màn hình đã chọn trên một máy (app/idle-lock.tsx). Hàm thuần để test.
// Anh Vũ 27/11/2026 8h40 "tat pass khoa man hinh ngay cho t": chủ hệ thống mặc định KHÔNG tự khoá (0) khi máy chưa chọn;
// người khác mặc định 30 phút. Giá trị lạ, hoặc "không tự khoá" của người không phải chủ hệ thống → 30 phút.
export const IDLE_MINUTES = 30;
export const IDLE_OPTIONS: { value: number; label: string; ownerOnly?: boolean }[] = [
  { value: 30, label: '30 phút' }, { value: 60, label: '1 giờ' }, { value: 240, label: '4 giờ' }, { value: 480, label: '8 giờ' }, { value: 0, label: 'Không tự khóa', ownerOnly: true },
];
export function pickIdleMinutes(stored: string | null, owner: boolean) {
  if (stored === null) return owner ? 0 : IDLE_MINUTES;
  const v = Number(stored);
  const opt = IDLE_OPTIONS.find((o) => o.value === v);
  return opt && (!opt.ownerOnly || owner) ? v : IDLE_MINUTES;
}
