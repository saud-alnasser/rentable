CREATE TABLE `history` (
	`id` integer PRIMARY KEY NOT NULL,
	`at` integer NOT NULL,
	`concept` text NOT NULL,
	`record_id` integer NOT NULL,
	`action` text NOT NULL,
	`record` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `history_id_unique` ON `history` (`id`);