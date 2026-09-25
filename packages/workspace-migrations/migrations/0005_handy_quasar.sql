-- Generated from `payment` in `apps/desktop/src/lib/platform/database/schema.ts`; the notes below
-- are hand-written after the fact, and drizzle-kit wrote no `PRAGMA foreign_keys=OFF` here to
-- delete.
--
-- WHY: a payment says how it was paid (one of `cash`, `bank-transfer`, `cheque`, `ejar`), carries
-- the transfer, cheque or SADAD number it was made under, and a note. Effort 835, requirements 1
-- and 2.
--
-- NULLABLE, NO DEFAULT, NO BACKFILL: every payment written before this reads all three as null,
-- which the application shows as not recorded. Nothing is guessed for an old row.
--
-- The enum is the schema's, not the engine's: SQLite holds `method` as plain text, and the
-- procedures refuse anything outside the four.
ALTER TABLE `payment` ADD `method` text;--> statement-breakpoint
ALTER TABLE `payment` ADD `reference` text;--> statement-breakpoint
ALTER TABLE `payment` ADD `note` text;