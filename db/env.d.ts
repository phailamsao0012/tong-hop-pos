declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    PANCAKE_POS_API_KEY?: string;
    // Bí mật ký phiên đăng nhập và băm mật khẩu (wrangler secret put AUTH_SECRET).
    AUTH_SECRET?: string;
    // Bí mật cho Telegram bot (bước sau).
    TELEGRAM_BOT_TOKEN?: string;
    REPORT_TIMEZONE?: string;
  }
}
