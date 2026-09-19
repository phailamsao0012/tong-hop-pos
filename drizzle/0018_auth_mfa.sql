CREATE TABLE `trusted_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`last_used_at` text,
	`user_agent` text
);--> statement-breakpoint
CREATE INDEX `idx_trusted_devices_user` ON `trusted_devices` (`user_id`);--> statement-breakpoint
CREATE TABLE `login_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`secret` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`meta` text
);--> statement-breakpoint
CREATE TABLE `user_mfa` (
	`user_id` text PRIMARY KEY NOT NULL,
	`totp_secret` text,
	`totp_enabled_at` text,
	`updated_at` text NOT NULL
);--> statement-breakpoint
CREATE TABLE `passkeys` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`public_key` text NOT NULL,
	`counter` integer DEFAULT 0 NOT NULL,
	`transports` text,
	`device_type` text,
	`backed_up` integer DEFAULT 0 NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`last_used_at` text
);--> statement-breakpoint
CREATE INDEX `idx_passkeys_user` ON `passkeys` (`user_id`);
