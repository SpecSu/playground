CREATE TABLE IF NOT EXISTS manor_income (
 uid text NOT NULL,
 op_id text NOT NULL,
 amount integer NOT NULL CHECK (amount > 0),
 earned_at integer NOT NULL,
 PRIMARY KEY(uid, op_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS manor_income_window ON manor_income(uid,earned_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS manor_income_metadata (key text PRIMARY KEY NOT NULL, value integer NOT NULL);
--> statement-breakpoint
INSERT OR IGNORE INTO manor_income_metadata(key,value) VALUES ('started_at',CAST(strftime('%s','now') AS integer)*1000);
