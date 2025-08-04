CREATE TABLE `complex` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`location` text NOT NULL
);


CREATE UNIQUE INDEX `idx_complex_id` ON `complex` (`id`);
CREATE UNIQUE INDEX `idx_complex_name` ON `complex` (`name`);

CREATE TABLE `unit` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`status` text CHECK(status IN ('occupied', 'vacant')) NOT NULL,
	`complex_id` integer NOT NULL
);

CREATE UNIQUE INDEX `idx_unit_id` ON `unit` (`id`);

CREATE TABLE `tenant` (
	`id` integer PRIMARY KEY NOT NULL,
	`iqama` text NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL
);

CREATE UNIQUE INDEX `idx_tenant_id` ON `tenant` (`id`);
CREATE UNIQUE INDEX `idx_tenant_iqama` ON `tenant` (`iqama`);
CREATE UNIQUE INDEX `idx_tenant_phone` ON `tenant` (`phone`);

CREATE TABLE `contract` (
	`id` integer PRIMARY KEY NOT NULL,
	`gov_id` text,
	`status` text CHECK(status IN ('active', 'terminated', 'expired', 'defaulted')) NOT NULL,
  `start_date` integer NOT NULL,
  `end_date` integer NOT NULL,
  `interval_in_months` integer CHECK(interval_in_months IN (1, 3, 6, 12)) NOT NULL,
  `cost_per_interval` real NOT NULL,
  `tenant_id` integer NOT NULL
);

CREATE UNIQUE INDEX `idx_contract_id` ON `contract` (`id`);
CREATE UNIQUE INDEX `idx_contract_gov_id` ON `contract` (`gov_id`);

CREATE TABLE `contract_unit` (
	`contract_id` integer NOT NULL,
	`unit_id` integer NOT NULL
);

CREATE UNIQUE INDEX `idx_contract_unit_composite_id` ON `contract_unit` (`contract_id`, `unit_id`);

CREATE TABLE `payment` (
	`id` integer PRIMARY KEY NOT NULL,
	`date` integer NOT NULL,
	`amount` real NOT NULL,
	`contract_id` integer NOT NULL
);

CREATE UNIQUE INDEX `idx_payment_id` ON `payment` (`id`);