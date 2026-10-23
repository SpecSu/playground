CREATE TABLE `manor_games` (
	`uid` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`state_json` text NOT NULL,
	`mutation_id` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `manor_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`island_uid` text NOT NULL,
	`uid` text NOT NULL,
	`name` text NOT NULL,
	`message` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `manor_messages_island` ON `manor_messages` (`island_uid`,`created_at`);--> statement-breakpoint
CREATE TABLE `manor_operations` (
	`uid` text NOT NULL,
	`op_id` text NOT NULL,
	`request_hash` text NOT NULL,
	`receipt_json` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`uid`, `op_id`)
);
--> statement-breakpoint
CREATE TABLE `manor_visits` (
	`session_id` text PRIMARY KEY NOT NULL,
	`uid` text NOT NULL,
	`island_uid` text NOT NULL,
	`revision` integer NOT NULL,
	`state_json` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `manor_visits_island` ON `manor_visits` (`island_uid`,`updated_at`);