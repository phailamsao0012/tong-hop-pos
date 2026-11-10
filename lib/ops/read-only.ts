// Bản PC chạy song song (anh Vũ "ok song song" 04/11/2026, docs/plans/2026-11-04-pc-song-song/plan.md): THP_READ_ONLY="1" chỉ đặt ở PC.
// Web chính (Cloudflare) là nơi ghi duy nhất; PC chép bảng người dùng về định kỳ nên mọi lệnh sửa ở PC bị chặn,
// và PC không nhắn Telegram / Zalo / thư, không ghi lên Pancake (tránh tin trùng, tránh lệch dữ liệu).
import { env } from 'cloudflare:workers';

export const isReadOnly = () => env.THP_READ_ONLY === '1';
export const READ_ONLY_MESSAGE = 'Bản PC chỉ để xem, vào tonghopposmegatech.io.vn để sửa.';

/** Lệnh vẫn cho chạy ở bản chỉ xem: đăng nhập / đăng xuất, gom báo cáo (POST nhưng chỉ đọc), ghi lượt xem trang (chỉ ở PC). */
const ALLOWED = ['/api/auth/', '/api/reports/batch', '/api/activity'];
/** null = được phép. Đọc (GET/HEAD) luôn được; webhook Telegram/Zalo/Sheets/tuyển dụng cũng chặn vì chúng chỉ trỏ về web chính. */
export function readOnlyBlocked(method: string, path: string): string | null {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return null;
  if (!path.startsWith('/api/')) return null;
  return ALLOWED.some((p) => (p.endsWith('/') ? path.startsWith(p) : path === p)) ? null : READ_ONLY_MESSAGE;
}

/** Gọi ra ngoài (Telegram, Zalo, thư, ghi Pancake): ném lỗi ở bản chỉ xem để không bao giờ gửi trùng với web chính. */
export function guardReadOnly(what: string) {
  if (isReadOnly()) throw new Error(`bản chỉ xem: không ${what}`);
}
