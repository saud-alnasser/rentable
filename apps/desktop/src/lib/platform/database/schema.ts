import { identityField, phone } from '$lib/tenant/tenant';
import { relations, type AnyColumn } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import z from 'zod';

// tables

export const tenant = sqliteTable('tenant', {
	id: text('id').primaryKey().unique(),
	nationalId: text('national_id').unique().notNull(),
	name: text('name').notNull(),
	phone: text('phone').unique().notNull()
});

export const TenantSchema = z.object({
	id: z.string(),
	name: z.string(),
	nationalId: identityField(
		'national identity number must start with 1 or 2; and be 10 digits long'
	),
	phone: z.string().regex(phone, 'phone must start with +966; and be 10 digits long')
});

export type Tenant = z.infer<typeof TenantSchema>;

/**
 * The text columns whose stored side cannot hold a character search folding would change,
 * declared here because only the schema knows — and placed beside the schema above, which is
 * what makes it true: `identityField` anchors to `[12]\d{9}` and the phone pattern to
 * `\+9665…[0-9]{7}`, and neither `\d` nor `[0-9]` matches an Arabic-Indic digit. A value that
 * would fold differently is refused on the way in, so folding these on read compares a column
 * against itself.
 *
 * Only text columns appear. A numeric column and an enum are recognised from their own
 * definition rather than listed here — see `storedSideCanFold` in `./search`.
 *
 * **Removing a column from this list is always safe; adding one is not.** An entry whose
 * validator stops enforcing ASCII makes that column silently unfindable by a search typed in
 * the other spelling, which is why each entry owes a test that its validator still refuses one.
 */
export const ASCII_ONLY_COLUMNS: readonly AnyColumn[] = [tenant.nationalId, tenant.phone];

export const complex = sqliteTable('complex', {
	id: text('id').primaryKey().unique(),
	name: text('name').unique().notNull(),
	location: text('location').notNull()
});

export const ComplexSchema = z.object({
	id: z.string(),
	name: z.string(),
	location: z.string()
});

export type Complex = z.infer<typeof ComplexSchema>;

export const unit = sqliteTable('unit', {
	id: text('id').primaryKey().unique(),
	name: text('name').notNull(),
	status: text('status', { enum: ['occupied', 'vacant'] }).notNull(),
	complexId: text('complex_id').notNull()
});

export const UnitSchema = z.object({
	id: z.string(),
	name: z.string(),
	status: z.enum(['occupied', 'vacant']),
	complexId: z.string()
});

export type Unit = z.infer<typeof UnitSchema>;

export const contract = sqliteTable('contract', {
	id: text('id').primaryKey().unique(),
	govId: text('gov_id').unique(),
	status: text('status', {
		enum: ['scheduled', 'active', 'terminated', 'fulfilled', 'expired', 'defaulted']
	}).notNull(),
	start: integer('start_date', { mode: 'timestamp_ms' }).notNull(),
	end: integer('end_date', { mode: 'timestamp_ms' }).notNull(),
	interval: text('interval_in_months', { enum: ['1m', '3m', '6m', '12m'] }).notNull(),
	cost: real('cost_per_interval').notNull(),
	paidAmount: real('paid_amount').notNull().default(0),
	expectedAmount: real('expected_amount').notNull().default(0),
	tenantId: text('tenant_id').notNull()
});

export const ContractSchema = z.object({
	id: z.string(),
	govId: z.string().optional(),
	status: z.enum(['scheduled', 'active', 'terminated', 'fulfilled', 'expired', 'defaulted']),
	start: z.number(),
	end: z.number(),
	interval: z.enum(['1m', '3m', '6m', '12m']),
	cost: z.number(),
	paidAmount: z.number(),
	expectedAmount: z.number(),
	tenantId: z.string()
});

export type Contract = z.infer<typeof ContractSchema>;

export const payment = sqliteTable(
	'payment',
	{
		id: text('id').primaryKey().unique(),
		date: integer('date', { mode: 'timestamp_ms' }).notNull(),
		amount: real('amount').notNull(),
		contractId: text('contract_id').notNull()
	},
	/**
	 * The one index this schema declares beyond its keys, and it is here because it was
	 * measured rather than because a foreign key looks like it wants one.
	 *
	 * The contracts directory counts each contract's payments with a correlated subquery, so an
	 * unindexed `contract_id` makes that a scan of every payment for every contract — a cost
	 * that grows as the product of the two tables and is paid on every read of the list. On the
	 * development workspace, 1138 contracts and 647 payments through the engine this
	 * application ships: **62.0ms with `paymentCount` against 3.8ms without it, and 4.9ms
	 * against 3.7ms once this index exists.** Sixteen times the query's own cost, down to
	 * one-and-a-third. The migration carries the whole measurement.
	 *
	 * **The other unindexed foreign keys stay unindexed** — `unit.complex_id`,
	 * `contract.tenant_id`, and both of `contract_unit`'s. Nothing has measured one of those
	 * costing anything, and an index is a write cost and a page cost charged on a workspace
	 * that replicates.
	 *
	 * Adding it here is only half of it: a workspace's schema is the control plane's to apply
	 * ([[contexts/desktop/persistence]], under *Boundaries*), so the migration this generates
	 * reaches a workspace at the token mint and never from a client.
	 */
	(table) => [index('payment_contract_id_idx').on(table.contractId)]
);

export const PaymentSchema = z.object({
	id: z.string(),
	date: z.number(),
	amount: z.number(),
	contractId: z.string()
});

export type Payment = z.infer<typeof PaymentSchema>;

export const contractUnit = sqliteTable('contract_unit', {
	contractId: text('contract_id').notNull(),
	unitId: text('unit_id').notNull()
});

export const ContractUnitSchema = z.object({
	contractId: z.string(),
	unitId: z.string()
});

export type ContractUnit = z.infer<typeof ContractUnitSchema>;

// relations

export const tenantRelations = relations(tenant, ({ many }) => ({
	contracts: many(contract)
}));

export const complexRelations = relations(complex, ({ many }) => ({
	units: many(unit)
}));

export const unitRelations = relations(unit, ({ one, many }) => ({
	complex: one(complex, {
		fields: [unit.complexId],
		references: [complex.id]
	}),
	contracts: many(contractUnit)
}));

export const contractRelations = relations(contract, ({ one, many }) => ({
	tenant: one(tenant, {
		fields: [contract.tenantId],
		references: [tenant.id]
	}),
	units: many(contractUnit),
	payments: many(payment)
}));

export const paymentRelations = relations(payment, ({ one }) => ({
	contract: one(contract, {
		fields: [payment.contractId],
		references: [contract.id]
	})
}));

/**
 * What was done to a record, and when.
 *
 * **Data at rest, and the only schema change this effort makes.** It is written from the
 * declaration every mutation already carries, and it is read and never replayed — nothing in
 * the application reconstructs anything from these rows.
 *
 * The action is stored as the key it renders under rather than as a rendered sentence: a
 * history read in Arabic must say what happened in Arabic, and a string frozen at the moment
 * of writing would answer in whatever language the change was made in. The record's own name
 * *is* frozen, deliberately — it is what the record was called when the thing happened, and it
 * is the only way a deletion still reads afterwards.
 */
export const history = sqliteTable('history', {
	id: text('id').primaryKey().unique(),
	at: integer('at', { mode: 'timestamp_ms' }).notNull(),
	/** which kind of record it happened to, so a surface can ask for its own. */
	concept: text('concept', {
		enum: ['tenant', 'complex', 'unit', 'contract', 'payment']
	}).notNull(),
	recordId: text('record_id').notNull(),
	/** the key the entry renders under, from the vocabulary undo already names changes with. */
	action: text('action').notNull(),
	/** what the record was called at the time. */
	record: text('record').notNull()
});

export const HistorySchema = z.object({
	id: z.string(),
	at: z.number(),
	concept: z.enum(['tenant', 'complex', 'unit', 'contract', 'payment']),
	recordId: z.string(),
	action: z.string(),
	record: z.string()
});

export type History = z.infer<typeof HistorySchema>;

export const contractUnitRelations = relations(contractUnit, ({ one }) => ({
	contract: one(contract, {
		fields: [contractUnit.contractId],
		references: [contract.id]
	}),
	unit: one(unit, {
		fields: [contractUnit.unitId],
		references: [unit.id]
	})
}));
