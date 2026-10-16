-- Cột hẹp cho báo cáo vận hành; bộ hẹn giờ điền đơn cũ, không điền trong migration.
ALTER TABLE `raw_pos_orders` ADD COLUMN `carrier_name` text;
ALTER TABLE `raw_pos_orders` ADD COLUMN `province_name` text;
ALTER TABLE `raw_pos_orders` ADD COLUMN `partner_status` text;
ALTER TABLE `raw_pos_orders` ADD COLUMN `first_undeliverable_at` text;
ALTER TABLE `raw_pos_orders` ADD COLUMN `returned_reason` text;
