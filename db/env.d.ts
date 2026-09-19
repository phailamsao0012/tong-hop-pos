declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    SYNC_SCHEDULER: DurableObjectNamespace<import('../lib/scheduler').SyncScheduler>;
    PANCAKE_POS_API_KEY?: string;
    // Bí mật ký phiên đăng nhập và băm mật khẩu (wrangler secret put AUTH_SECRET).
    AUTH_SECRET?: string;
    // Bí mật cho Telegram bot (bước sau).
    TELEGRAM_BOT_TOKEN?: string;
    // Bí mật xác thực webhook Telegram (header X-Telegram-Bot-Api-Secret-Token).
    TELEGRAM_WEBHOOK_SECRET?: string;
    /** Khóa API Brevo để gửi mã OTP; MAIL_FROM là địa chỉ gửi đã xác minh trên Brevo. */
    BREVO_API_KEY?: string;
    MAIL_FROM?: string;
    REPORT_TIMEZONE?: string;
  }
}
