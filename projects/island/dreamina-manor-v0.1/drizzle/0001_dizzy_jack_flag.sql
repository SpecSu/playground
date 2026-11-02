CREATE TABLE IF NOT EXISTS `manor_friendships` (
	`owner_uid` text NOT NULL,
	`friend_uid` text NOT NULL,
	PRIMARY KEY(`owner_uid`, `friend_uid`)
);
--> statement-breakpoint
INSERT INTO manor_friendships(owner_uid,friend_uid) VALUES ('twx','subeike'),('subeike','twx') ON CONFLICT(owner_uid,friend_uid) DO NOTHING;
