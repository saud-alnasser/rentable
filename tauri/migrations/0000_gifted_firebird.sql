CREATE TABLE `complex` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`location` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `complex_id_unique` ON `complex` (`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `complex_name_unique` ON `complex` (`name`);--> statement-breakpoint
CREATE TABLE `contract` (
	`id` integer PRIMARY KEY NOT NULL,
	`gov_id` text,
	`status` text NOT NULL,
	`start_date` integer NOT NULL,
	`end_date` integer NOT NULL,
	`interval_in_months` text NOT NULL,
	`cost_per_interval` real NOT NULL,
	`tenant_id` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contract_id_unique` ON `contract` (`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `contract_gov_id_unique` ON `contract` (`gov_id`);--> statement-breakpoint
CREATE TABLE `contract_unit` (
	`contract_id` integer NOT NULL,
	`unit_id` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payment` (
	`id` integer PRIMARY KEY NOT NULL,
	`date` integer NOT NULL,
	`amount` real NOT NULL,
	`contract_id` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_id_unique` ON `payment` (`id`);--> statement-breakpoint
CREATE TABLE `tenant` (
	`id` integer PRIMARY KEY NOT NULL,
	`national_id` text NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tenant_id_unique` ON `tenant` (`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tenant_national_id_unique` ON `tenant` (`national_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tenant_phone_unique` ON `tenant` (`phone`);--> statement-breakpoint
CREATE TABLE `unit` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`complex_id` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unit_id_unique` ON `unit` (`id`);