import { DurableObject } from 'cloudflare:workers';
import { runScheduledSync } from '@/lib/sync';

export const SYNC_INTERVAL_MS = 5 * 60000;
export const BACKFILL_INTERVAL_MS = 60000;

// Bộ hẹn giờ đồng bộ chạy bằng Durable Object alarm: tự đặt lại alarm mỗi 5 phút,
// không phụ thuộc Cron Trigger (đang không được gọi trên tài khoản Free mới).
export class SyncScheduler extends DurableObject<Cloudflare.Env> {
  /** Đảm bảo alarm đã được đặt; gọi từ bất kỳ request nào cũng an toàn. */
  async ensure() {
    const current = await this.ctx.storage.getAlarm();
    if (current === null) await this.ctx.storage.setAlarm(Date.now() + 5000);
    return { nextRunAt: current ?? Date.now() + 5000, lastRunAt: (await this.ctx.storage.get<number>('lastRunAt')) ?? null };
  }

  async status() {
    return {
      nextRunAt: await this.ctx.storage.getAlarm(),
      lastRunAt: (await this.ctx.storage.get<number>('lastRunAt')) ?? null,
      lastError: (await this.ctx.storage.get<string>('lastError')) ?? null,
      backfillPending: (await this.ctx.storage.get<boolean>('backfillPending')) ?? null,
    };
  }

  /** Chạy ngay một lượt đồng bộ (dùng cho nút "Đồng bộ tất cả"). */
  async runNow() {
    await this.run();
  }

  async alarm() {
    // Đặt lần kế tiếp trước khi chạy để chuỗi alarm không bị đứt khi lỗi.
    await this.ctx.storage.setAlarm(Date.now() + SYNC_INTERVAL_MS);
    const { backfillPending } = await this.run();
    // Còn lịch sử chưa lấy xong: chạy dày hơn (1 phút) cho tới khi đủ.
    if (backfillPending) await this.ctx.storage.setAlarm(Date.now() + BACKFILL_INTERVAL_MS);
  }

  private async run() {
    try {
      const result = await runScheduledSync(this.env, new Date());
      await this.ctx.storage.put({ lastRunAt: Date.now(), lastError: null, backfillPending: result.backfillPending });
      return result;
    } catch (error) {
      console.error('scheduler run failed', error);
      await this.ctx.storage.put({ lastRunAt: Date.now(), lastError: error instanceof Error ? error.message : String(error) });
      return { backfillPending: true };
    }
  }
}
