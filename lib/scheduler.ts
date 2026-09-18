import { DurableObject } from 'cloudflare:workers';
import { DEFAULT_BUDGET, WRITE_LIMIT_ERROR, buildStatsMonth, runScheduledSync } from '@/lib/sync';
import { DAY_EXPR } from '@/lib/stats';
import { buildCustomerStatsMonth } from '@/lib/customer-stats';
import { runAlerts } from '@/lib/alerts';
import { setCommands, setWebhook, telegramCall } from '@/lib/telegram';

export const SYNC_INTERVAL_MS = 5 * 60000;
export const BACKFILL_INTERVAL_MS = 60000;
// Cron chỉ gọi khi lượt trước đã quá lâu (bộ hẹn giờ DO là nguồn chạy chính; tránh hai lượt đồng bộ chồng nhau).
const KICK_STALE_MS = 4 * 60000;
// Trần ghi D1 mỗi ngày (UTC) mà web tự đặt để nằm trong hạn mức gói Paid (50 triệu/tháng).
export const D1_DAILY_WRITE_LIMIT = 1500000;
// Tăng số này để xóa trạng thái "bị chặn ghi" đã lưu (ví dụ sau khi nâng gói).
const BLOCK_EPOCH = 3;
const WEBHOOK_ORIGIN = 'https://tong-hop-pos.megatech-pos.workers.dev';
// Tăng số này khi đổi cách tính stats_daily để dựng lại toàn bộ từ đơn đã lưu.
const STATS_EPOCH = 3;
const CUSTOMER_EPOCH = 2;

type State = {
  lastRunAt: number | null;
  lastError: string | null;
  backfillPending: boolean | null;
  writesDay: string | null;
  writesUsed: number;
  writeBlockedUntil: number | null;
  /** Các (POS:tháng) đã có đơn trước khi bảng số liệu ngày ra đời, còn phải dựng; null = chưa liệt kê. */
  statsPending: string[] | null;
  blockEpoch?: number;
  statsEpoch?: number;
  customerPending: string[] | null;
  customerEpoch?: number;
  /** Đã đăng ký webhook Telegram cho token này (lưu vài ký tự cuối token để nhận biết token đổi). */
  webhookFor?: string | null;
};

// DDL của bảng số liệu ngày (giống migration 0007, idempotent) để tự tạo khi migration chưa áp dụng được.
const STATS_DDL = [
  "CREATE TABLE IF NOT EXISTS `stats_daily` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`pos_id` text NOT NULL,\n\t`day` text NOT NULL,\n\t`seller_id` text DEFAULT '' NOT NULL,\n\t`orders` integer DEFAULT 0 NOT NULL,\n\t`deleted_orders` integer DEFAULT 0 NOT NULL,\n\t`gross` integer DEFAULT 0 NOT NULL,\n\t`discount` integer DEFAULT 0 NOT NULL,\n\t`net` integer DEFAULT 0 NOT NULL,\n\t`shipping_fee` integer DEFAULT 0 NOT NULL,\n\t`cod` integer DEFAULT 0 NOT NULL,\n\t`closed_orders` integer DEFAULT 0 NOT NULL,\n\t`closed_gross` integer DEFAULT 0 NOT NULL,\n\t`closed_discount` integer DEFAULT 0 NOT NULL,\n\t`closed_net` integer DEFAULT 0 NOT NULL,\n\t`closed_shipping_fee` integer DEFAULT 0 NOT NULL,\n\t`closed_quantity` integer DEFAULT 0 NOT NULL,\n\t`new_orders` integer DEFAULT 0 NOT NULL,\n\t`new_net` integer DEFAULT 0 NOT NULL,\n\t`confirmed_orders` integer DEFAULT 0 NOT NULL,\n\t`confirmed_net` integer DEFAULT 0 NOT NULL,\n\t`shipping_orders` integer DEFAULT 0 NOT NULL,\n\t`shipping_net` integer DEFAULT 0 NOT NULL,\n\t`delivered_orders` integer DEFAULT 0 NOT NULL,\n\t`delivered_net` integer DEFAULT 0 NOT NULL,\n\t`returned_orders` integer DEFAULT 0 NOT NULL,\n\t`returned_net` integer DEFAULT 0 NOT NULL,\n\t`cancelled_orders` integer DEFAULT 0 NOT NULL,\n\t`cancelled_net` integer DEFAULT 0 NOT NULL,\n\t`updated_at` text NOT NULL\n);",
  "CREATE INDEX IF NOT EXISTS `idx_stats_daily_pos_day` ON `stats_daily` (`pos_id`,`day`);",
  "CREATE TABLE IF NOT EXISTS `stats_daily_product` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`pos_id` text NOT NULL,\n\t`day` text NOT NULL,\n\t`product_id` text DEFAULT '' NOT NULL,\n\t`name` text DEFAULT '' NOT NULL,\n\t`orders` integer DEFAULT 0 NOT NULL,\n\t`quantity` integer DEFAULT 0 NOT NULL,\n\t`total` integer DEFAULT 0 NOT NULL,\n\t`closed_quantity` integer DEFAULT 0 NOT NULL,\n\t`closed_total` integer DEFAULT 0 NOT NULL,\n\t`delivered_quantity` integer DEFAULT 0 NOT NULL,\n\t`delivered_total` integer DEFAULT 0 NOT NULL,\n\t`returned_quantity` integer DEFAULT 0 NOT NULL,\n\t`updated_at` text NOT NULL\n);",
  "CREATE INDEX IF NOT EXISTS `idx_stats_daily_product_pos_day` ON `stats_daily_product` (`pos_id`,`day`);"
];

const utcDay = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
const nextUtcMidnight = (t = Date.now()) => Date.parse(`${utcDay(t)}T00:00:00Z`) + 86400000;

// Bộ hẹn giờ đồng bộ chạy bằng Durable Object alarm: tự đặt lại alarm mỗi 5 phút
// (1 phút khi còn lịch sử), không phụ thuộc Cron Trigger. Theo dõi hạn mức ghi D1 theo ngày.
export class SyncScheduler extends DurableObject<Cloudflare.Env> {
  private async state(): Promise<State> {
    const s = await this.ctx.storage.get<Partial<State>>('state');
    const state: State = {
      lastRunAt: null, lastError: null, backfillPending: null, writesDay: null, writesUsed: 0, writeBlockedUntil: null, statsPending: null, customerPending: null, ...s,
    };
    if (state.writesDay !== utcDay()) { state.writesDay = utcDay(); state.writesUsed = 0; state.writeBlockedUntil = null; }
    if (state.blockEpoch !== BLOCK_EPOCH) { state.blockEpoch = BLOCK_EPOCH; state.writeBlockedUntil = null; state.writesUsed = 0; }
    if (state.statsEpoch !== STATS_EPOCH) { state.statsEpoch = STATS_EPOCH; state.statsPending = null; }
    if (state.customerEpoch !== CUSTOMER_EPOCH) { state.customerEpoch = CUSTOMER_EPOCH; state.customerPending = null; }
    return state;
  }

  /** Đảm bảo alarm đã được đặt; gọi từ bất kỳ request nào cũng an toàn. */
  async ensure() {
    const current = await this.ctx.storage.getAlarm();
    if (current === null) await this.ctx.storage.setAlarm(Date.now() + 5000);
  }

  async status() {
    const s = await this.state();
    return {
      nextRunAt: await this.ctx.storage.getAlarm(),
      lastRunAt: s.lastRunAt, lastError: s.lastError, backfillPending: s.backfillPending,
      writesUsed: s.writesUsed, writeLimit: D1_DAILY_WRITE_LIMIT, writesDay: s.writesDay,
      writeBlockedUntil: s.writeBlockedUntil,
      backfillCap: DEFAULT_BUDGET.backfillCap,
      statsPending: s.statsPending?.length ?? 0,
      customerPending: s.customerPending?.length ?? 0,
    };
  }

  /** Chạy ngay một lượt đồng bộ (nút "Đồng bộ tất cả ngay"). */
  async runNow() {
    return this.run();
  }

  /** Cron Trigger gọi mỗi 5 phút: chỉ là "chó canh" — chạy khi alarm không tự chạy được (lượt trước quá cũ), không bao giờ chạy chồng. */
  async kick() {
    await this.ensure();
    const s = await this.state();
    if (this.running || (s.lastRunAt && Date.now() - s.lastRunAt < KICK_STALE_MS)) return { skipped: true };
    return this.run();
  }

  async alarm() {
    // Đặt lần kế tiếp trước khi chạy để chuỗi alarm không bị đứt khi lỗi.
    await this.ctx.storage.setAlarm(Date.now() + SYNC_INTERVAL_MS);
    const { backfillPending, blocked } = await this.run();
    // Còn lịch sử chưa lấy xong và chưa hết hạn mức: chạy dày hơn (1 phút).
    if (backfillPending && !blocked) await this.ctx.storage.setAlarm(Date.now() + BACKFILL_INTERVAL_MS);
  }

  /** Dựng số liệu ngày cho các tháng đã có đơn từ trước (một lần), vài tháng mỗi lượt trong hạn mức. */
  private async buildPendingStats(s: State) {
    const db = this.env.DB;
    let writes = 0;
    const listMonths = async () => {
      const rows = await db.prepare(`SELECT pos_id, substr(${DAY_EXPR},1,7) AS month FROM raw_pos_orders GROUP BY pos_id, month ORDER BY month DESC`)
        .all<{ pos_id: string; month: string }>();
      return rows.results.map((r) => `${r.pos_id}:${r.month}`);
    };
    if (s.statsPending === null) s.statsPending = await listMonths();
    if (s.customerPending === null) s.customerPending = await listMonths();
    const started = Date.now();
    const ok = () => Date.now() - started < 25000 && s.writesUsed + writes < DEFAULT_BUDGET.backfillCap;
    while (s.statsPending.length && ok()) {
      const [posId, month] = s.statsPending[0].split(':');
      writes += await buildStatsMonth(db, posId, month);
      s.statsPending.shift();
      await this.ctx.storage.put('state', { ...s, writesUsed: s.writesUsed + writes });
    }
    while (s.customerPending.length && ok()) {
      const [posId, month] = s.customerPending[0].split(':');
      writes += await buildCustomerStatsMonth(db, posId, month);
      s.customerPending.shift();
      await this.ctx.storage.put('state', { ...s, writesUsed: s.writesUsed + writes });
    }
    return writes;
  }

  /** Tự đăng ký webhook + danh sách lệnh cho bot khi có token (một lần cho mỗi token). */
  private async ensureWebhook(s: State) {
    const token = this.env.TELEGRAM_BOT_TOKEN?.trim(), secret = this.env.TELEGRAM_WEBHOOK_SECRET?.trim();
    if (!token || !secret) return;
    const marker = `v5:${token.slice(-6)}`;
    if (s.webhookFor === marker) return;
    try {
      await setWebhook(token, `${WEBHOOK_ORIGIN}/api/telegram/webhook`, secret);
      await setCommands(token, [
        { command: 'start', description: 'Bắt đầu · menu chính' },
        { command: 'baocao', description: 'Tổng quan: đơn, chốt, doanh thu (kỳ, POS)' },
        { command: 'pos', description: 'Số liệu từng POS' },
        { command: 'nhanvien', description: 'Mọi số liệu của một nhân viên' },
        { command: 'top', description: 'Xếp hạng nhân viên' },
        { command: 'chotnong', description: 'Tỷ lệ chốt nóng theo SĐT' },
        { command: 'sanpham', description: 'Sản phẩm bán chạy' },
        { command: 'mualai', description: 'Mua lại & Upsell' },
        { command: 'bieudo', description: 'Ảnh biểu đồ doanh thu, đơn chốt, POS, nhân viên' },
        { command: 'khach', description: 'Hồ sơ khách theo SĐT/tên' },
        { command: 'dongbo', description: 'Trạng thái đồng bộ' },
        { command: 'help', description: 'Hướng dẫn lệnh' },
      ]);
      await telegramCall(token, 'setChatMenuButton', { menu_button: { type: 'commands' } }).catch(() => undefined);
      await telegramCall(token, 'setMyName', { name: 'MEGATECH POS' }).catch(() => undefined);
      await telegramCall(token, 'setMyShortDescription', { short_description: 'Báo cáo bán hàng 6 POS của MEGATECH: doanh thu, đơn chốt, tỷ lệ chốt, nhân viên, khách hàng, biểu đồ.' }).catch(() => undefined);
      await telegramCall(token, 'setMyDescription', { description: 'MEGATECH · Tổng hợp POS\n\nXem nhanh doanh thu, đơn chốt, tỷ lệ chốt nóng, xếp hạng nhân viên, khách hàng, mua lại và biểu đồ của 6 POS Pancake — ngay trong Telegram.\n\nBấm Bắt đầu để mở menu. Chỉ tài khoản được cấp quyền mới xem được số liệu.' }).catch(() => undefined);
      s.webhookFor = marker;
    } catch (error) { console.error('setWebhook failed', error); }
  }

  private async ensureSchema() {
    const exists = await this.env.DB.prepare("SELECT 1 AS x FROM sqlite_master WHERE type='table' AND name='stats_daily'").first();
    if (exists) return;
    for (const sql of STATS_DDL) await this.env.DB.prepare(sql).run();
  }

  /** Lượt đồng bộ đang chạy (nếu có) — mọi lời gọi khác (alarm, cron, nút bấm) dùng chung, không chạy chồng lên D1. */
  private running: Promise<{ backfillPending: boolean; blocked: boolean }> | null = null;

  private run() {
    if (!this.running) this.running = this.runOnce().finally(() => { this.running = null; });
    return this.running;
  }

  private async runOnce() {
    const s = await this.state();
    // Hết hạn mức ghi trong ngày: vẫn lấy đơn mới/vừa sửa (ít ghi, quan trọng nhất), bỏ qua lịch sử và dựng số liệu.
    const blocked = !!(s.writeBlockedUntil && s.writeBlockedUntil > Date.now());
    try {
      await this.ensureSchema();
      const result = blocked
        ? await runScheduledSync(this.env, new Date(), 30000, { writesUsed: 0, backfillCap: 0, hardCap: 200000 })
        : await runScheduledSync(this.env, new Date(), 50000, { ...DEFAULT_BUDGET, writesUsed: s.writesUsed });
      s.writesUsed += result.writes;
      s.lastRunAt = Date.now();
      if (blocked) { await this.ctx.storage.put('state', s); return { backfillPending: true, blocked: true }; }
      s.lastError = null;
      s.backfillPending = result.backfillPending;
      if (!result.writeLimitHit) s.writesUsed += await this.buildPendingStats(s);
      await this.ensureWebhook(s);
      // Cảnh báo Telegram sau khi dữ liệu đã cập nhật.
      try { await runAlerts(this.env, new Date()); } catch (error) { console.error('alerts failed', error); }
      if (result.writeLimitHit) {
        s.writeBlockedUntil = nextUtcMidnight();
        s.lastError = 'Hết hạn mức ghi D1 trong ngày; tự chạy lại sau 07:00 sáng (giờ VN).';
      }
      await this.ctx.storage.put('state', s);
      return { backfillPending: result.backfillPending, blocked: !!result.writeLimitHit };
    } catch (error) {
      console.error('scheduler run failed', error);
      s.lastRunAt = Date.now();
      s.lastError = error instanceof Error ? error.message : String(error);
      const blocked = WRITE_LIMIT_ERROR.test(s.lastError);
      if (blocked) {
        s.writeBlockedUntil = nextUtcMidnight();
        s.lastError = 'Hết hạn mức ghi D1 trong ngày; tự chạy lại sau 07:00 sáng (giờ VN).';
      }
      await this.ctx.storage.put('state', s);
      return { backfillPending: true, blocked };
    }
  }
}
