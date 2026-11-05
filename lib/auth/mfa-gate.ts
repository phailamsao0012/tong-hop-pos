// MFA bắt buộc (chủ hệ thống, giám đốc; lib/auth/mfa.ts mfaRequiredFor): chưa bật thì chỉ được dùng phần đăng nhập / bảo mật
// (/api/auth/*, để tự bật MFA), mọi API dữ liệu khác bị chặn ở máy chủ, không chỉ ở giao diện (dashboard.tsx `gated`).
export const MFA_BLOCKED_ERROR = 'Tài khoản cần bật xác thực hai lớp (Bảo mật tài khoản) trước khi xem dữ liệu.';

/** Phiên này có bị chặn API dữ liệu vì chưa bật MFA bắt buộc không. */
export const mfaBlocks = (u: { mfaRequired: boolean; mfaEnabled: boolean }) => u.mfaRequired && !u.mfaEnabled;
