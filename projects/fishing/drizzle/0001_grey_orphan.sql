CREATE TABLE `nightclub_admission_buckets` (
	`bucket_hash` text PRIMARY KEY NOT NULL,
	`window_started_at` integer NOT NULL,
	`admissions` integer NOT NULL
);
