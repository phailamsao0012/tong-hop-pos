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
    REPORT_TIMEZONE?: string;
  }
}
