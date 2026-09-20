CREATE INDEX IF NOT EXISTS `idx_pos_customers_assigned_note` ON `pos_customers` (`assigned_user_id`,`last_note_at`);
