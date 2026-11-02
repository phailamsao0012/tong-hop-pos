// Gốc URL web để nút "Mở web" trong tin Telegram trỏ về. Đổi tên miền (hoặc chuyển web sang PC) thì đặt biến WEB_ORIGIN.
import { env } from 'cloudflare:workers';

export const DEFAULT_WEB_ORIGIN = 'https://tonghopposmegatech.io.vn';
export const webOrigin = () => ((env as { WEB_ORIGIN?: string }).WEB_ORIGIN?.trim() || DEFAULT_WEB_ORIGIN).replace(/\/+$/, '');
