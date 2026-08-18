ALTER TABLE `workspace` ADD `database_name` text NOT NULL;--> statement-breakpoint
ALTER TABLE `workspace` ADD `database_hostname` text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_database_name_unique` ON `workspace` (`database_name`);