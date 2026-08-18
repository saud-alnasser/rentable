CREATE TABLE `idmap` (
	`concept` text NOT NULL,
	`old` integer NOT NULL,
	`new` text NOT NULL
);--> statement-breakpoint
INSERT INTO `idmap` ("concept", "old", "new") SELECT 'tenant', "id", printf('%08x-%04x-7%03x-%s%03x-%012x', CAST(unixepoch('now','subsec')*1000 AS INTEGER)/65536, CAST(unixepoch('now','subsec')*1000 AS INTEGER)%65536, 1, '8', 0, "id") FROM `tenant`;--> statement-breakpoint
INSERT INTO `idmap` ("concept", "old", "new") SELECT 'complex', "id", printf('%08x-%04x-7%03x-%s%03x-%012x', CAST(unixepoch('now','subsec')*1000 AS INTEGER)/65536, CAST(unixepoch('now','subsec')*1000 AS INTEGER)%65536, 2, '8', 0, "id") FROM `complex`;--> statement-breakpoint
INSERT INTO `idmap` ("concept", "old", "new") SELECT 'unit', "id", printf('%08x-%04x-7%03x-%s%03x-%012x', CAST(unixepoch('now','subsec')*1000 AS INTEGER)/65536, CAST(unixepoch('now','subsec')*1000 AS INTEGER)%65536, 3, '8', 0, "id") FROM `unit`;--> statement-breakpoint
INSERT INTO `idmap` ("concept", "old", "new") SELECT 'contract', "id", printf('%08x-%04x-7%03x-%s%03x-%012x', CAST(unixepoch('now','subsec')*1000 AS INTEGER)/65536, CAST(unixepoch('now','subsec')*1000 AS INTEGER)%65536, 4, '8', 0, "id") FROM `contract`;--> statement-breakpoint
INSERT INTO `idmap` ("concept", "old", "new") SELECT 'payment', "id", printf('%08x-%04x-7%03x-%s%03x-%012x', CAST(unixepoch('now','subsec')*1000 AS INTEGER)/65536, CAST(unixepoch('now','subsec')*1000 AS INTEGER)%65536, 5, '8', 0, "id") FROM `payment`;--> statement-breakpoint
INSERT INTO `idmap` ("concept", "old", "new") SELECT 'history', "id", printf('%08x-%04x-7%03x-%s%03x-%012x', CAST(unixepoch('now','subsec')*1000 AS INTEGER)/65536, CAST(unixepoch('now','subsec')*1000 AS INTEGER)%65536, 6, '8', 0, "id") FROM `history`;--> statement-breakpoint
INSERT INTO `idmap` ("concept", "old", "new")
SELECT "concept", "record_id", CASE "concept"
	WHEN 'tenant' THEN printf('%08x-%04x-7%03x-%s%03x-%012x', CAST(unixepoch('now','subsec')*1000 AS INTEGER)/65536, CAST(unixepoch('now','subsec')*1000 AS INTEGER)%65536, 1, '8', 0, "record_id")
	WHEN 'complex' THEN printf('%08x-%04x-7%03x-%s%03x-%012x', CAST(unixepoch('now','subsec')*1000 AS INTEGER)/65536, CAST(unixepoch('now','subsec')*1000 AS INTEGER)%65536, 2, '8', 0, "record_id")
	WHEN 'unit' THEN printf('%08x-%04x-7%03x-%s%03x-%012x', CAST(unixepoch('now','subsec')*1000 AS INTEGER)/65536, CAST(unixepoch('now','subsec')*1000 AS INTEGER)%65536, 3, '8', 0, "record_id")
	WHEN 'contract' THEN printf('%08x-%04x-7%03x-%s%03x-%012x', CAST(unixepoch('now','subsec')*1000 AS INTEGER)/65536, CAST(unixepoch('now','subsec')*1000 AS INTEGER)%65536, 4, '8', 0, "record_id")
	ELSE printf('%08x-%04x-7%03x-%s%03x-%012x', CAST(unixepoch('now','subsec')*1000 AS INTEGER)/65536, CAST(unixepoch('now','subsec')*1000 AS INTEGER)%65536, 5, '8', 0, "record_id")
END FROM (SELECT DISTINCT h."concept" AS "concept", h."record_id" AS "record_id" FROM `history` h
	WHERE NOT EXISTS (SELECT 1 FROM `idmap` m WHERE m."concept" = h."concept" AND m."old" = h."record_id"));--> statement-breakpoint
INSERT INTO `idmap` ("concept", "old", "new")
SELECT 'tenant', "old", printf('%08x-%04x-7%03x-%s%03x-%012x', CAST(unixepoch('now','subsec')*1000 AS INTEGER)/65536, CAST(unixepoch('now','subsec')*1000 AS INTEGER)%65536, 1, '8', 0, "old") FROM (SELECT DISTINCT r."tenant_id" AS "old" FROM `contract` r
	WHERE NOT EXISTS (SELECT 1 FROM `idmap` m WHERE m."concept" = 'tenant' AND m."old" = r."tenant_id"));--> statement-breakpoint
INSERT INTO `idmap` ("concept", "old", "new")
SELECT 'complex', "old", printf('%08x-%04x-7%03x-%s%03x-%012x', CAST(unixepoch('now','subsec')*1000 AS INTEGER)/65536, CAST(unixepoch('now','subsec')*1000 AS INTEGER)%65536, 2, '8', 0, "old") FROM (SELECT DISTINCT r."complex_id" AS "old" FROM `unit` r
	WHERE NOT EXISTS (SELECT 1 FROM `idmap` m WHERE m."concept" = 'complex' AND m."old" = r."complex_id"));--> statement-breakpoint
INSERT INTO `idmap` ("concept", "old", "new")
SELECT 'contract', "old", printf('%08x-%04x-7%03x-%s%03x-%012x', CAST(unixepoch('now','subsec')*1000 AS INTEGER)/65536, CAST(unixepoch('now','subsec')*1000 AS INTEGER)%65536, 4, '8', 0, "old") FROM (SELECT DISTINCT r."contract_id" AS "old" FROM `payment` r
	WHERE NOT EXISTS (SELECT 1 FROM `idmap` m WHERE m."concept" = 'contract' AND m."old" = r."contract_id"));--> statement-breakpoint
INSERT INTO `idmap` ("concept", "old", "new")
SELECT 'contract', "old", printf('%08x-%04x-7%03x-%s%03x-%012x', CAST(unixepoch('now','subsec')*1000 AS INTEGER)/65536, CAST(unixepoch('now','subsec')*1000 AS INTEGER)%65536, 4, '8', 0, "old") FROM (SELECT DISTINCT r."contract_id" AS "old" FROM `contract_unit` r
	WHERE NOT EXISTS (SELECT 1 FROM `idmap` m WHERE m."concept" = 'contract' AND m."old" = r."contract_id"));--> statement-breakpoint
INSERT INTO `idmap` ("concept", "old", "new")
SELECT 'unit', "old", printf('%08x-%04x-7%03x-%s%03x-%012x', CAST(unixepoch('now','subsec')*1000 AS INTEGER)/65536, CAST(unixepoch('now','subsec')*1000 AS INTEGER)%65536, 3, '8', 0, "old") FROM (SELECT DISTINCT r."unit_id" AS "old" FROM `contract_unit` r
	WHERE NOT EXISTS (SELECT 1 FROM `idmap` m WHERE m."concept" = 'unit' AND m."old" = r."unit_id"));--> statement-breakpoint
CREATE TABLE `__new_complex` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`location` text NOT NULL
);--> statement-breakpoint
INSERT INTO `__new_complex`("id", "name", "location") SELECT m."new", r."name", r."location" FROM `complex` r JOIN `idmap` m ON m."concept" = 'complex' AND m."old" = r."id";--> statement-breakpoint
DROP TABLE `complex`;--> statement-breakpoint
ALTER TABLE `__new_complex` RENAME TO `complex`;--> statement-breakpoint
CREATE UNIQUE INDEX `complex_id_unique` ON `complex` (`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `complex_name_unique` ON `complex` (`name`);--> statement-breakpoint
CREATE TABLE `__new_contract` (
	`id` text PRIMARY KEY NOT NULL,
	`gov_id` text,
	`status` text NOT NULL,
	`start_date` integer NOT NULL,
	`end_date` integer NOT NULL,
	`interval_in_months` text NOT NULL,
	`cost_per_interval` real NOT NULL,
	`paid_amount` real DEFAULT 0 NOT NULL,
	`expected_amount` real DEFAULT 0 NOT NULL,
	`tenant_id` text NOT NULL
);--> statement-breakpoint
INSERT INTO `__new_contract`("id", "gov_id", "status", "start_date", "end_date", "interval_in_months", "cost_per_interval", "paid_amount", "expected_amount", "tenant_id") SELECT m."new", r."gov_id", r."status", r."start_date", r."end_date", r."interval_in_months", r."cost_per_interval", r."paid_amount", r."expected_amount", t."new" FROM `contract` r JOIN `idmap` m ON m."concept" = 'contract' AND m."old" = r."id" JOIN `idmap` t ON t."concept" = 'tenant' AND t."old" = r."tenant_id";--> statement-breakpoint
DROP TABLE `contract`;--> statement-breakpoint
ALTER TABLE `__new_contract` RENAME TO `contract`;--> statement-breakpoint
CREATE UNIQUE INDEX `contract_id_unique` ON `contract` (`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `contract_gov_id_unique` ON `contract` (`gov_id`);--> statement-breakpoint
CREATE TABLE `__new_contract_unit` (
	`contract_id` text NOT NULL,
	`unit_id` text NOT NULL
);--> statement-breakpoint
INSERT INTO `__new_contract_unit`("contract_id", "unit_id") SELECT c."new", u."new" FROM `contract_unit` r JOIN `idmap` c ON c."concept" = 'contract' AND c."old" = r."contract_id" JOIN `idmap` u ON u."concept" = 'unit' AND u."old" = r."unit_id";--> statement-breakpoint
DROP TABLE `contract_unit`;--> statement-breakpoint
ALTER TABLE `__new_contract_unit` RENAME TO `contract_unit`;--> statement-breakpoint
CREATE TABLE `__new_history` (
	`id` text PRIMARY KEY NOT NULL,
	`at` integer NOT NULL,
	`concept` text NOT NULL,
	`record_id` text NOT NULL,
	`action` text NOT NULL,
	`record` text NOT NULL
);--> statement-breakpoint
INSERT INTO `__new_history`("id", "at", "concept", "record_id", "action", "record") SELECT m."new", r."at", r."concept", t."new", r."action", r."record" FROM `history` r JOIN `idmap` m ON m."concept" = 'history' AND m."old" = r."id" JOIN `idmap` t ON t."concept" = r."concept" AND t."old" = r."record_id";--> statement-breakpoint
DROP TABLE `history`;--> statement-breakpoint
ALTER TABLE `__new_history` RENAME TO `history`;--> statement-breakpoint
CREATE UNIQUE INDEX `history_id_unique` ON `history` (`id`);--> statement-breakpoint
CREATE TABLE `__new_payment` (
	`id` text PRIMARY KEY NOT NULL,
	`date` integer NOT NULL,
	`amount` real NOT NULL,
	`contract_id` text NOT NULL
);--> statement-breakpoint
INSERT INTO `__new_payment`("id", "date", "amount", "contract_id") SELECT m."new", r."date", r."amount", c."new" FROM `payment` r JOIN `idmap` m ON m."concept" = 'payment' AND m."old" = r."id" JOIN `idmap` c ON c."concept" = 'contract' AND c."old" = r."contract_id";--> statement-breakpoint
DROP TABLE `payment`;--> statement-breakpoint
ALTER TABLE `__new_payment` RENAME TO `payment`;--> statement-breakpoint
CREATE UNIQUE INDEX `payment_id_unique` ON `payment` (`id`);--> statement-breakpoint
CREATE TABLE `__new_tenant` (
	`id` text PRIMARY KEY NOT NULL,
	`national_id` text NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL
);--> statement-breakpoint
INSERT INTO `__new_tenant`("id", "national_id", "name", "phone") SELECT m."new", r."national_id", r."name", r."phone" FROM `tenant` r JOIN `idmap` m ON m."concept" = 'tenant' AND m."old" = r."id";--> statement-breakpoint
DROP TABLE `tenant`;--> statement-breakpoint
ALTER TABLE `__new_tenant` RENAME TO `tenant`;--> statement-breakpoint
CREATE UNIQUE INDEX `tenant_id_unique` ON `tenant` (`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tenant_national_id_unique` ON `tenant` (`national_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tenant_phone_unique` ON `tenant` (`phone`);--> statement-breakpoint
CREATE TABLE `__new_unit` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`complex_id` text NOT NULL
);--> statement-breakpoint
INSERT INTO `__new_unit`("id", "name", "status", "complex_id") SELECT m."new", r."name", r."status", c."new" FROM `unit` r JOIN `idmap` m ON m."concept" = 'unit' AND m."old" = r."id" JOIN `idmap` c ON c."concept" = 'complex' AND c."old" = r."complex_id";--> statement-breakpoint
DROP TABLE `unit`;--> statement-breakpoint
ALTER TABLE `__new_unit` RENAME TO `unit`;--> statement-breakpoint
CREATE UNIQUE INDEX `unit_id_unique` ON `unit` (`id`);--> statement-breakpoint
DROP TABLE `idmap`;