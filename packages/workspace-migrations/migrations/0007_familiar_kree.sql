-- Generated from `tenant`, `complex` and `contract` in `apps/desktop/src/lib/platform/database/schema.ts`,
-- which stopped declaring `.unique()` on the four columns; the notes below are hand-written after
-- the fact.
--
-- WHY: a rule of the shared database refuses the second of two machines that saved the same
-- phone, national ID, complex name or government ID while apart, and the sync engine then drops
-- that machine's refused rows and keeps the rest of the batch, a contract on a tenant that exists
-- nowhere among them. Measured in effort 857's evidence, `what-a-duplicate-value-does-to-sync`.
-- Uniqueness is the app's when a person saves, with today's messages. Effort 857, requirement 14.
--
-- AN ADDITION, declared in `apps/desktop/tauri/src/database/step.rs`: removing a rule refuses no
-- older build anything and changes the meaning of nothing it reads or writes, so it moves neither
-- floor and any machine that opens the workspace runs it. The `id` columns keep their unique
-- indexes.
DROP INDEX `complex_name_unique`;--> statement-breakpoint
DROP INDEX `contract_gov_id_unique`;--> statement-breakpoint
DROP INDEX `tenant_national_id_unique`;--> statement-breakpoint
DROP INDEX `tenant_phone_unique`;