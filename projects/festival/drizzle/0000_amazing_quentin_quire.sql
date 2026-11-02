CREATE TABLE `nightclub_rooms` (
	`room_id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`state_json` text NOT NULL,
	`mutation_id` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `nightclub_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `nightclub_session_actor` ON `nightclub_sessions` (`actor_id`);--> statement-breakpoint
CREATE TABLE `nightclub_visits` (
	`room_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`last_sequence` integer DEFAULT 0 NOT NULL,
	`state_json` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`room_id`, `actor_id`)
);
