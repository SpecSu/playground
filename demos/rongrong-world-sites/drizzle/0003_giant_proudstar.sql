CREATE TABLE `minimal_boardings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	CONSTRAINT "minimal_boardings_valid_json" CHECK(json_valid("minimal_boardings"."value"))
);
