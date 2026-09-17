import { DurableObject } from 'cloudflare:workers';
import { DEFAULT_BUDGET, runScheduledSync } from '@/lib/sync';

export const SYNC_INTERVAL_MS = 5 * 60000;
export const BACKFILL_INTERVAL_MS = 60000;
// D1 gói Free: 100.000 dòng ghi / ngày (theo ngày UTC).
export const D1_DAILY_WRITE_LIMIT = 100000;

type State = {
  lastRunAt: number | null;
  lastError: string | null;
  backfillPending: boolean | null;
  writesDay: string | null;
  writesUsed: number;
  writeBlockedUntil: number | null;
};

const utcDay = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
const nextUtcMidnight = (t = Date.now()) => Date.parse(`${utcDay(t)}T00:00:00Z`) + 86400000;

// Bộ hẹn giờ đồng bộ chạy bằng Durable Object alarm: tự đặt lại alarm mỗi 5 phút
// (1 phút khi còn lịch sử), không phụ thuộc Cron Trigger. Theo dõi hạn mức ghi D1 theo ngày.
export class SyncScheduler extends DurableObject<Cloudflare.Env> {
  private async state(): Promise<State> {
    const s = await this.ctx.storage.get<Partial<State>>('state');
    const state: State = {
      lastRunAt: null, lastError: null, backfillPending: null, writesDay: null, writesUsed: 0, writeBlockedUntil: null, ...s,
    };
    if (state.writesDay !== utcDay()) { state.writesDay = utcDay(); state.writesUsed = 0; state.writeBlockedUntil = null; }
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
    };
  }

  /** Chạy ngay một lượt đồng bộ (nút "Đồng bộ tất cả ngay"). */
  async runNow() {
    return this.run();
  }

  async alarm() {
    // Đặt lần kế tiếp trước khi chạy để chuỗi alarm không bị đứt khi lỗi.
    await this.ctx.storage.setAlarm(Date.now() + SYNC_INTERVAL_MS);
    const { backfillPending, blocked } = await this.run();
    // Còn lịch sử chưa lấy xong và chưa hết hạn mức: chạy dày hơn (1 phút).
    if (backfillPending && !blocked) await this.ctx.storage.setAlarm(Date.now() + BACKFILL_INTERVAL_MS);
  }

  private async run() {
    const s = await this.state();
    if (s.writeBlockedUntil && s.writeBlockedUntil > Date.now())
      return { backfillPending: true, blocked: true, skipped: 'write_limit' as const };
    try {
      const result = await runScheduledSync(this.env, new Date(), 50000, { ...DEFAULT_BUDGET, writesUsed: s.writesUsed });
      s.writesUsed += result.writes;
      s.lastRunAt = Date.now();
      s.lastError = null;
      s.backfillPending = result.backfillPending;
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
      await this.ctx.storage.put('state', s);
      return { backfillPending: true, blocked: false };
    }
  }
}
