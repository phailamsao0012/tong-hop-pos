// Gốc URL web cho nút "Mở web" trong tin Telegram và đường ảnh báo cáo gửi Zalo. Đổi tên miền thì đặt biến WEB_ORIGIN.
// 18/11/2026 (anh Vũ): mặc định đổi sang tên miền đang chạy posmegatech.com. Tên miền cũ tonghopposmegatech.io.vn chỉ còn
// chuyển hướng 307, Zalo không lấy được ảnh qua chuyển hướng (từ 22h 16/11 ảnh báo cáo chỉ còn tin chữ).
import { env } from 'cloudflare:workers';

export const DEFAULT_WEB_ORIGIN = 'https://posmegatech.com';
export const webOrigin = () => ((env as { WEB_ORIGIN?: string }).WEB_ORIGIN?.trim() || DEFAULT_WEB_ORIGIN).replace(/\/+$/, '');
