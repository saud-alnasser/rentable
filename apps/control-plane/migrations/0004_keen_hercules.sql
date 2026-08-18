CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`token_digest` text NOT NULL,
	`created_at` integer NOT NULL,
	`renewed_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_digest_unique` ON `session` (`token_digest`);