-- Giá vốn và phí hãng ship; đơn cũ do bộ hẹn giờ điền từ raw_json.
ALTER TABLE `raw_pos_orders` ADD COLUMN `cost_total` integer;
ALTER TABLE `raw_pos_orders` ADD COLUMN `cost_missing` integer;
ALTER TABLE `raw_pos_orders` ADD COLUMN `carrier_fee` integer;
