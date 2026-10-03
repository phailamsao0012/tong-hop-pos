-- Chia số thử nghiệm (03/10/2026): web tổng tự chia đơn mới chưa có người bán cho các sale đang bật (theo vòng),
-- ghi người nhận vào đơn trên Pancake. Bật theo từng POS: off (tắt) / dry (chạy thử, chỉ ghi nhật ký) / live (ghi thật).
CREATE TABLE IF NOT EXISTS dispatch_pos (
  pos_id TEXT PRIMARY KEY NOT NULL, mode TEXT NOT NULL DEFAULT 'off', since TEXT, last_run_at TEXT, last_error TEXT,
  waiting INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, updated_by TEXT
);
CREATE TABLE IF NOT EXISTS dispatch_staff (
  user_id TEXT PRIMARY KEY NOT NULL, is_on INTEGER NOT NULL DEFAULT 0, on_since TEXT, last_assigned_at TEXT, updated_at TEXT NOT NULL, updated_by TEXT
);
CREATE TABLE IF NOT EXISTS dispatch_log (
  id TEXT PRIMARY KEY NOT NULL, at TEXT NOT NULL, pos_id TEXT NOT NULL, order_id TEXT NOT NULL, order_at TEXT, customer TEXT,
  seller_id TEXT, seller_name TEXT, mode TEXT NOT NULL, result TEXT NOT NULL, detail TEXT
);
CREATE INDEX IF NOT EXISTS idx_dispatch_log_at ON dispatch_log (at);
CREATE INDEX IF NOT EXISTS idx_dispatch_log_order ON dispatch_log (pos_id, order_id);
