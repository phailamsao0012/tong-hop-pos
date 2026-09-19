ALTER TABLE `targets` ADD `working_days` integer;
--> statement-breakpoint
CREATE TABLE `staff_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`shift_start` integer,
	`shift_end` integer,
	`updated_by` text,
	`updated_at` text NOT NULL
);
