// Tính lại bảng tính sẵn stats_daily_segment theo bộ thẻ mới (plan docs/plans/2026-11-27-the-san-pham-moi, bước 3).
// Từng (POS, tháng), mới trước cũ sau, có nghỉ giữa các tháng; dừng khi stop() trả true (lệnh chạy tay đo web thật chậm).
// Xong mọi tháng mới ghi mốc sẵn sàng epoch mới (SEGMENT_READY_KEY = SEGMENT_EPOCH) — trước đó báo cáo đọc đơn gốc.
// Bộ hẹn giờ (lib/ops/scheduler.ts) cũng tự làm việc này khi epoch đổi; hàm này để chạy chủ động ban đêm.
import { SEGMENT_EPOCH, SEGMENT_READY_KEY, backfillSegmentMonth, ensureSegmentSchema, resetSegmentReadyMemo, segmentMonths } from '@/lib/reports/stats';

export type RecomputeStep = { key: string; ms: number; writes: number };
export type RecomputeResult = { steps: RecomputeStep[]; total: number; done: number; ready: boolean; stopped: boolean };

export async function recomputeSegments(db: D1Database, opts: {
  pauseMs?: number; stop?: () => boolean | Promise<boolean>; sleep?: (ms: number) => Promise<void>;
  onStep?: (s: RecomputeStep, i: number, total: number) => void; months?: string[];
} = {}): Promise<RecomputeResult> {
  await ensureSegmentSchema(db);
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const list = opts.months ?? await segmentMonths(db);
  const steps: RecomputeStep[] = [];
  let stopped = false;
  for (const [i, key] of list.entries()) {
    if (await opts.stop?.()) { stopped = true; break; }
    if (i && opts.pauseMs) await sleep(opts.pauseMs);
    const [posId, month] = key.split(':');
    const t0 = Date.now();
    const writes = await backfillSegmentMonth(db, posId, month);
    const step = { key, ms: Date.now() - t0, writes };
    steps.push(step);
    opts.onStep?.(step, i, list.length);
  }
  const ready = !stopped && steps.length === list.length && !opts.months;
  if (ready) {
    await db.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at')
      .bind(SEGMENT_READY_KEY, String(SEGMENT_EPOCH), new Date().toISOString()).run();
    resetSegmentReadyMemo();
  }
  return { steps, total: list.length, done: steps.length, ready, stopped };
}
