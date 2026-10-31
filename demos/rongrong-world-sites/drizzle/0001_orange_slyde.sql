CREATE TABLE `convoy_receipts` (
	`device` text NOT NULL,
	`id` text NOT NULL,
	`receipt` text NOT NULL,
	PRIMARY KEY(`device`, `id`)
);
--> statement-breakpoint
CREATE TABLE `convoy_rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `estate_commands` (
	`device` text NOT NULL,
	`id` text NOT NULL,
	`receipt` text NOT NULL,
	PRIMARY KEY(`device`, `id`)
);
--> statement-breakpoint
CREATE TABLE `estates` (
	`device` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `harvest_limits` (
	`device` text NOT NULL,
	`role` text NOT NULL,
	`day` text NOT NULL,
	`used` integer NOT NULL,
	PRIMARY KEY(`device`, `role`, `day`)
);
--> statement-breakpoint
CREATE TABLE `harvest_receipts` (
	`device` text NOT NULL,
	`id` text NOT NULL,
	`receipt` text NOT NULL,
	PRIMARY KEY(`device`, `id`)
);
--> statement-breakpoint
CREATE TABLE `harvest_shares` (
	`owner` text NOT NULL,
	`profile` text NOT NULL,
	`run_id` text NOT NULL,
	`token` text NOT NULL,
	`opened` integer NOT NULL,
	`ledger` text NOT NULL,
	PRIMARY KEY(`owner`, `profile`, `run_id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `harvest_shares_token_unique` ON `harvest_shares` (`token`);--> statement-breakpoint
CREATE TABLE `site_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`token` text NOT NULL
);
