-- Trong số đơn chia mỗi ngày, bao nhiêu đơn nay đã chốt (tỷ lệ chốt ÷ số chia không vượt 100%, 29/09/2026).
-- Cột cũng tự thêm lúc chạy (lib/stats.ts ensureStatsSchema); STATS_EPOCH 6 dựng lại số liệu cũ.
ALTER TABLE stats_daily ADD COLUMN assigned_closed_orders INTEGER NOT NULL DEFAULT 0;
