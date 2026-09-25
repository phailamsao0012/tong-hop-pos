-- Đăng nhập bằng QR / duyệt trên app và thông tin phiên (lib/auth-schema.ts tự tạo khi chạy; file này để ghi lại).
CREATE TABLE IF NOT EXISTS login_requests (
  id TEXT PRIMARY KEY, poll_hash TEXT NOT NULL, kind TEXT NOT NULL, user_id TEXT, number INTEGER NOT NULL, choices TEXT NOT NULL,
  status TEXT NOT NULL, remember INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, decided_at TEXT,
  decided_by TEXT, requester_ua TEXT, requester_ip TEXT, requester_place TEXT, requester_device TEXT);
CREATE INDEX IF NOT EXISTS idx_login_requests_user ON login_requests (user_id,status);
-- Cột mới của sessions (client, method, ip, place, device, last_seen_at) do lib/auth-schema.ts thêm khi chạy
-- (kiểm tra PRAGMA trước), không đặt ALTER ở đây để chạy lại migration không lỗi trùng cột.
