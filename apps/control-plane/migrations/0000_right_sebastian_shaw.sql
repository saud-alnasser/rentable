CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`avatar_url` text,
	`google_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_email_unique` ON `account` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `account_google_user_id_unique` ON `account` (`google_user_id`);--> statement-breakpoint
CREATE TABLE `membership` (
	`workspace_id` text NOT NULL,
	`account_id` text NOT NULL,
	`role` text NOT NULL,
	`permissions` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`workspace_id`, `account_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `workspace` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner_account_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE no action
);
