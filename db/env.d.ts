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
    /** Bí mật Apps Script gửi kèm (header X-Recruit-Secret) khi đẩy dữ liệu tuyển dụng từ Google Sheets. */
    RECRUIT_WEBHOOK_SECRET?: string;
    /** Bí mật chung với web nhân sự (header X-HR-Secret), đặt giống nhau ở cả hai web. */
    HR_SHARED_SECRET?: string;
    /** Địa chỉ web nhân sự, vd. https://crm.tonghopposmegatech.io.vn. */
    CRM_URL?: string;
    /** Service Binding tới Worker megatech-crm (web nhân sự); không có thì gọi qua CRM_URL. */
    HR?: Fetcher;
    /** Chỉ có khi chạy wrangler dev --var LOCAL_DEV:1: bỏ ép https để thử qua http://localhost. */
    LOCAL_DEV?: string;
    /** Cloudflare Workers AI (tóm tắt sáng, giai đoạn 6b). */
    AI?: Ai;
    /** "1" ở Worker bản demo (tong-hop-pos-demo): Pancake và web nhân sự giả, tài khoản demo, xem lib/demo/mode.ts. */
    DEMO_MODE?: string;
    /** "1": sau đồng bộ trả ngay bản báo cáo gần nhất, tính lại ngầm một lượt (worker.ts cachedReport). Hiện chỉ bật ở bản demo. */
    THP_SWR?: string;
    /** OAuth client ID (loại Web) trên Google Cloud cho nút Đăng nhập bằng Google; trống thì ẩn nút. Không phải bí mật. */
    GOOGLE_CLIENT_ID?: string;
  }
}
