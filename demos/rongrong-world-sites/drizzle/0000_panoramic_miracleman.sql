CREATE TABLE `farm_commands` (
	`device` text NOT NULL,
	`id` text NOT NULL,
	`receipt` text NOT NULL,
	PRIMARY KEY(`device`, `id`)
);
--> statement-breakpoint
CREATE TABLE `farm_states` (
	`device` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`revision` integer NOT NULL,
	`last_command` text NOT NULL
);
