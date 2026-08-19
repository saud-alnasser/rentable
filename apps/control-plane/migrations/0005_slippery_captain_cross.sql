-- The session row gains its absolute lifetime.
--
-- `ALTER TABLE ... ADD COLUMN` is not available here: SQLite refuses to add a `NOT NULL` column
-- with no default however empty the table is, and a default would be a lie — the moment belongs
-- to the sign-in, not to the schema. So the table is rebuilt, and existing rows are given the
-- honest value: the absolute lifetime runs from when the person signed in, which is `created_at`
-- plus thirty days. A session already older than that is carried across and simply cannot be
-- renewed, which is what it has earned.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_session` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`token_digest` text NOT NULL,
	`created_at` integer NOT NULL,
	`renewed_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`absolute_expires_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `__new_session`("id", "account_id", "token_digest", "created_at", "renewed_at", "expires_at", "absolute_expires_at")
SELECT "id", "account_id", "token_digest", "created_at", "renewed_at", "expires_at", "created_at" + 2592000000 FROM `session`;--> statement-breakpoint
DROP TABLE `session`;--> statement-breakpoint
ALTER TABLE `__new_session` RENAME TO `session`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_digest_unique` ON `session` (`token_digest`);
