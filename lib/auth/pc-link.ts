// Đăng nhập bản PC qua web chính (anh Vũ chọn "Hỏi web chính" 07/11/2026): bản PC không kiểm được mật khẩu vì không có
// chìa AUTH_SECRET của web chính. Người dùng bấm nút ở trang đăng nhập PC → đăng nhập web chính như thường → web chính
// cấp mã dùng một lần (2 phút, bảng hr_handoffs) và chuyển về PC → PC hỏi web chính mã thuộc tài khoản nào rồi mở phiên.
// Logic thuần ở đây để test được; địa chỉ cố định nên không chuyển hướng tới nơi lạ.
export const MAIN_ORIGIN = 'https://tonghopposmegatech.io.vn';
export const PC_ORIGIN = 'https://pc.tonghopposmegatech.io.vn';

/** Nút trên trang đăng nhập bản PC trỏ về đây (web chính). */
export const mainHandoffUrl = () => `${MAIN_ORIGIN}/api/auth/pc-handoff`;
/** Web chính chuyển người dùng về đây (bản PC) kèm mã. */
export const pcClaimUrl = (code: string) => `${PC_ORIGIN}/api/auth/pc-claim?code=${encodeURIComponent(code)}`;
/** PC hỏi web chính ở đây. */
export const mainRedeemUrl = () => `${MAIN_ORIGIN}/api/auth/pc-redeem`;

/** Mã 24 byte ngẫu nhiên, dạng base64url (32 ký tự). */
export function newPcCode() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export const validPcCode = (code: unknown): code is string => typeof code === 'string' && /^[A-Za-z0-9_-]{32}$/.test(code);

/** Mã còn hạn chưa (hàng vừa xoá khỏi hr_handoffs). */
export const handoffAlive = (row: { user_id: string; expires_at: string } | null | undefined, now: number) =>
  !!row && Date.parse(row.expires_at) > now ? row.user_id : null;

/** Lỗi hiện trên trang đăng nhập PC khi quay về không vào được. */
export const PC_LOGIN_ERRORS: Record<string, string> = {
  'het-han': 'Mã đăng nhập đã hết hạn hoặc đã dùng. Bấm lại nút đăng nhập.',
  'khong-noi': 'Không hỏi được web chính. Kiểm tra mạng của máy PC rồi thử lại.',
  'chua-chep': 'Tài khoản chưa chép về bản PC hoặc đã bị khóa. Chờ 10 phút rồi thử lại.',
};
export const pcLoginError = (key: string | undefined) => (key && Object.hasOwn(PC_LOGIN_ERRORS, key) ? PC_LOGIN_ERRORS[key] : undefined);
