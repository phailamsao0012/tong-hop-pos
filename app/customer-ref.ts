// Mở hồ sơ khách khi SĐT đã bị che theo vai trò (lib/auth/phone-privacy.ts): máy chủ trả kèm `phoneRef`, giao diện dùng mã này
// thay cho số thật. Chủ hệ thống / giám đốc không có phoneRef thì vẫn dùng SĐT như cũ.
export type CustomerRef = { posId: string; phone: string; phoneRef?: string };

/** Tham số URL cho /api/reports/customers/detail. */
export const customerDetailQuery = (c: CustomerRef) =>
  c.phoneRef ? `ref=${encodeURIComponent(c.phoneRef)}` : `posId=${encodeURIComponent(c.posId)}&phone=${encodeURIComponent(c.phone)}`;

/** Khoá nhận diện một khách trong danh sách (SĐT đã che có thể trùng 3 số cuối). */
export const customerKeyOf = (c: CustomerRef) => c.phoneRef ?? `${c.posId}:${c.phone}`;

/** SĐT đã bị che (không gọi / nhắn / sao chép được). */
export const phoneMasked = (phone: string | null | undefined) => !!phone && phone.includes('•');
