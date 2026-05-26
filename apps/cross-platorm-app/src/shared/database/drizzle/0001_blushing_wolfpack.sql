CREATE TABLE `habit_setups` (
	`goal_count` integer NOT NULL,
	`has_goal_streak` integer NOT NULL,
	`is_bad_habit` integer NOT NULL,
	`logs_with_notes` integer NOT NULL,
	`routine` text NOT NULL,
	`start_date` text NOT NULL,
	`time_period` text NOT NULL,
	`tracker_id` text PRIMARY KEY NOT NULL,
	`weekdays` text NOT NULL,
	FOREIGN KEY (`tracker_id`) REFERENCES `trackers`(`id`) ON UPDATE no action ON DELETE cascade
);
