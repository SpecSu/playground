CREATE TABLE `fishing_admission_buckets` (
	`bucket_hash` text PRIMARY KEY NOT NULL,
	`window_started_at` integer NOT NULL,
	`admissions` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `fishing_rooms` (
	`room_id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`state_json` text NOT NULL,
	`mutation_id` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `fishing_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fishing_session_actor` ON `fishing_sessions` (`actor_id`);--> statement-breakpoint
CREATE TABLE `fishing_visits` (
	`room_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`last_sequence` integer DEFAULT 0 NOT NULL,
	`move_sequence` integer DEFAULT 0 NOT NULL,
	`move_json` text,
	`state_json` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`room_id`, `actor_id`)
);
