-- Liên kết web vệ tinh nhân sự (crm): ngày tạo tài khoản nhân viên trên POS (ngày vào làm) và mã chuyển đăng nhập một lần.
ALTER TABLE pos_users ADD COLUMN source_created_at TEXT;
CREATE TABLE IF NOT EXISTS hr_handoffs (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
