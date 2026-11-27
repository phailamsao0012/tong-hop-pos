// Test tự ghi thẳng bảng stats_daily (số giả) hoặc kiểm câu đọc bảng tính sẵn: đánh dấu bảng đã dựng lại theo ngày tạo đơn
// (revenueStatsReady, 27/11/2026). Chưa đánh dấu thì nơi đọc tính lại từ đơn gốc (statsDailySource), không đọc số giả của test.
import type { DatabaseSync } from 'node:sqlite';
import { SEGMENT_READY_KEY, SEGMENT_READY_VALUE, resetSegmentReadyMemo } from '../../lib/reports/stats';

export function markRevenueReady(raw: DatabaseSync) {
  raw.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .run(SEGMENT_READY_KEY, SEGMENT_READY_VALUE, '2026-01-01T00:00:00Z');
  resetSegmentReadyMemo();
}
