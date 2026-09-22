-- Source-scoped CSKH history/cohorts must avoid reading large raw_json payloads.
CREATE INDEX IF NOT EXISTS idx_raw_orders_pos_status_origin
ON raw_pos_orders (pos_id,status_code,seller_id,marketer_id,phone,created_at,tags_json);
