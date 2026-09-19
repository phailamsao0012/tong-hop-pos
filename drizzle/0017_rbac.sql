ALTER TABLE `users` ADD `title` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `manager_id` text;--> statement-breakpoint
ALTER TABLE `users` ADD `views_json` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `pos_ids_json` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `team` text DEFAULT 'all' NOT NULL;--> statement-breakpoint
UPDATE `users` SET `role`='owner' WHERE `email`='vuvanvu1189@gmail.com';--> statement-breakpoint
UPDATE `users` SET `role`='director' WHERE `role`='admin';--> statement-breakpoint
UPDATE `users` SET `role`='staff' WHERE `role`='member';
--> statement-breakpoint
UPDATE `users` SET `views_json`='["center","overview","shift","calls","care","repurchase","dormant","compare","batches","pipeline","customers","monthly","custom","raw-orders"]' WHERE `role`<>'owner' AND `views_json`='';
