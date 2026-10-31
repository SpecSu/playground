CREATE TABLE `minimal_farms` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	CONSTRAINT "minimal_farms_valid_json" CHECK(json_valid("minimal_farms"."value"))
);
--> statement-breakpoint
CREATE TABLE `minimal_import_sources` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	CONSTRAINT "minimal_import_sources_valid_json" CHECK(json_valid("minimal_import_sources"."value"))
);
--> statement-breakpoint
CREATE TABLE `minimal_imports` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	CONSTRAINT "minimal_imports_valid_json" CHECK(json_valid("minimal_imports"."value"))
);
--> statement-breakpoint
CREATE TABLE `minimal_profiles` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	CONSTRAINT "minimal_profiles_valid_json" CHECK(json_valid("minimal_profiles"."value"))
);
--> statement-breakpoint
CREATE TABLE `minimal_receipts` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	CONSTRAINT "minimal_receipts_valid_json" CHECK(json_valid("minimal_receipts"."value"))
);
--> statement-breakpoint
CREATE TABLE `minimal_transaction_gate` (
	`id` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`token` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `minimal_wishing_daily` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	CONSTRAINT "minimal_wishing_daily_valid_json" CHECK(json_valid("minimal_wishing_daily"."value"))
);
--> statement-breakpoint
CREATE TABLE `minimal_wishing_offers` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	CONSTRAINT "minimal_wishing_offers_valid_json" CHECK(json_valid("minimal_wishing_offers"."value"))
);
--> statement-breakpoint
CREATE TABLE `minimal_wishing_trades` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	CONSTRAINT "minimal_wishing_trades_valid_json" CHECK(json_valid("minimal_wishing_trades"."value"))
);
