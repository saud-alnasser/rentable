-- Generated from `tenant`, `complex`, `contract`, `unit` and `payment` in
-- `apps/desktop/src/lib/platform/database/schema.ts`, which gained `merged_into` and `merged_as`; the
-- notes below are hand-written after the fact.
--
-- WHY: two machines saving the same tenant, complex or contract while apart make two records the
-- same in every field a person entered, and the units or payments under them twice. The pass after
-- every pull keeps the earlier, heals what was under the later one to one with what is under the
-- earlier, and retires each copy rather than deleting it: `merged_into` names the record it went
-- into, and `merged_as` holds its fields as they stood when it last matched that record, so an edit
-- made to it by a machine that had not heard of the merge reaches the one that stayed. Every read of
-- the application keeps a retired record out. Effort 857, requirement 14.
--
-- AN ADDITION, declared in `apps/desktop/tauri/src/database/step.rs`: two columns that may be
-- empty, empty on every record saved before them. An older build reads and writes as it did: it
-- still sees a retired copy as the record it was, as it saw both copies before any pass ran, and an
-- edit it makes there is carried to the record that stayed.
ALTER TABLE `complex` ADD `merged_into` text;--> statement-breakpoint
ALTER TABLE `complex` ADD `merged_as` text;--> statement-breakpoint
ALTER TABLE `contract` ADD `merged_into` text;--> statement-breakpoint
ALTER TABLE `contract` ADD `merged_as` text;--> statement-breakpoint
ALTER TABLE `payment` ADD `merged_into` text;--> statement-breakpoint
ALTER TABLE `payment` ADD `merged_as` text;--> statement-breakpoint
ALTER TABLE `tenant` ADD `merged_into` text;--> statement-breakpoint
ALTER TABLE `tenant` ADD `merged_as` text;--> statement-breakpoint
ALTER TABLE `unit` ADD `merged_into` text;--> statement-breakpoint
ALTER TABLE `unit` ADD `merged_as` text;