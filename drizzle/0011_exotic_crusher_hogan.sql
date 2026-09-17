CREATE TABLE `telegram_chats` (
	`chat_id` text PRIMARY KEY NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`added_by` text NOT NULL,
	`added_at` text NOT NULL
);
