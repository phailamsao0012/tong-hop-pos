-- Chi phí quảng cáo nhập tay / Excel theo marketer (26/09/2026). Bảng cũng tự tạo lúc chạy (lib/ad-costs.ts).
CREATE TABLE IF NOT EXISTS ad_costs (
  id TEXT PRIMARY KEY, day TEXT NOT NULL, marketer_id TEXT NOT NULL, amount INTEGER NOT NULL, campaign TEXT, note TEXT,
  created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_ad_costs_day ON ad_costs (day, marketer_id);
