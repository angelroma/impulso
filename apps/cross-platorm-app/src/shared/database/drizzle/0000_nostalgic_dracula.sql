CREATE TABLE `trackers` (
	`created_at` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`method` text NOT NULL,
	`name` text NOT NULL,
	`updated_at` text NOT NULL
);
