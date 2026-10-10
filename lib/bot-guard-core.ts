// Luật bảo vệ dữ liệu cá nhân cho bot Telegram (anh Vũ 10/10/2026: "phần pháp lý quan trọng, cần fix gấp").
// Phần thuần (không gọi D1, không gọi mạng) để test được: ai được tra khách, cách tìm khách, che số điện thoại, khoá khi nhập sai mã.

/** Chat nhóm (siêu nhóm, kênh) của Telegram có id âm; chat riêng với một người có id dương. */
export const isGroupChat = (chatId: string) => chatId.startsWith('-');

/**
 * Được tra hồ sơ khách qua bot khi: chat riêng (không phải nhóm, để kết quả không hiện cho cả nhóm)
 * và là chat nhận cảnh báo của tài khoản chủ hệ thống hoặc giám đốc (đúng phạm vi web đang cho xem hồ sơ khách mọi POS).
 */
export const canLookupCustomers = (chatId: string, trusted: boolean) => trusted && !isGroupChat(chatId);

export type CustomerQuery = { kind: 'phone'; digits: string } | { kind: 'name'; pattern: string } | { kind: 'invalid'; reason: string };
const PHONE_MIN_DIGITS = 9;
const NAME_MIN_CHARS = 3;
/** Thoát ký tự đại diện của LIKE (dùng kèm ESCAPE '\'). */
export const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Tìm khách chỉ theo SĐT gần đủ (từ 9 chữ số) hoặc tên từ 3 ký tự: không còn gõ một chữ số để ra danh sách khách chi nhiều nhất.
 * Tên có lẫn chữ số (vd "Lan 09") vẫn tìm theo tên, không đổi sang tìm SĐT theo mảnh số.
 */
export function parseCustomerQuery(query: string): CustomerQuery {
  const q = query.trim().replace(/\s+/g, ' ');
  const digits = q.replace(/\D/g, '');
  const onlyPhone = /^[+\d\s().-]+$/.test(q);
  if (onlyPhone) {
    if (digits.length < PHONE_MIN_DIGITS) return { kind: 'invalid', reason: `Gõ đủ số điện thoại (ít nhất ${PHONE_MIN_DIGITS} chữ số).` };
    // +84 / 84 đầu số → bỏ để khớp cả số lưu dạng 0xxx.
    const local = digits.startsWith('84') && digits.length >= 11 ? digits.slice(2) : digits.replace(/^0/, '');
    return { kind: 'phone', digits: local };
  }
  if (q.replace(/[\d\s]/g, '').normalize('NFC').length < NAME_MIN_CHARS) return { kind: 'invalid', reason: `Gõ tên khách từ ${NAME_MIN_CHARS} chữ trở lên, hoặc đủ số điện thoại.` };
  return { kind: 'name', pattern: `%${escapeLike(q)}%` };
}

/** Che SĐT khi bot liệt kê nhiều khách: chỉ để 3 số cuối. */
export const maskPhone = (phone: string) => {
  const d = String(phone ?? '');
  return d.length <= 3 ? '•••' : `${'•'.repeat(Math.min(7, d.length - 3))}${d.slice(-3)}`;
};

// ----- Khoá khi nhập sai mã ghép nối / mật khẩu bot -----
export type FailState = { n: number; since: number; lockedUntil?: number };
export const FAIL_LIMIT_CHAT = 5;
export const FAIL_LIMIT_ALL = 20;
export const FAIL_WINDOW_MS = 15 * 60000;
export const LOCK_CHAT_MS = 60 * 60000;
export const LOCK_ALL_MS = 60 * 60000;

/** Ghi thêm một lần sai: quá ngưỡng trong cửa sổ 15 phút thì khoá (1 chat: 5 lần; cả bot: 20 lần, chặn dò mã bằng nhiều tài khoản). */
export function addFailure(prev: FailState | null, now: number, limit: number, lockMs: number): FailState {
  const fresh = !prev || now - prev.since > FAIL_WINDOW_MS;
  const next: FailState = fresh ? { n: 1, since: now } : { ...prev, n: prev.n + 1 };
  if (next.n >= limit) next.lockedUntil = now + lockMs;
  return next;
}
export const isLocked = (s: FailState | null, now: number) => !!s?.lockedUntil && s.lockedUntil > now;
