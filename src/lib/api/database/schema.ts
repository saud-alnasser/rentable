import { relations } from 'drizzle-orm';
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// tables

export const tenant = sqliteTable('tenant', {
	id: integer('id').primaryKey().unique(),
	nationalId: text('national_id').unique().notNull(),
	name: text('name').notNull(),
	phone: text('phone').unique().notNull()
});

export const complex = sqliteTable('complex', {
	id: integer('id').primaryKey().unique(),
	name: text('name').unique().notNull(),
	location: text('location').notNull()
});

export const unit = sqliteTable('unit', {
	id: integer('id').primaryKey().unique(),
	name: text('name').notNull(),
	status: text('status', { enum: ['occupied', 'vacant'] }).notNull(),
	complexId: integer('complex_id').notNull()
});

export const contract = sqliteTable('contract', {
	id: integer('id').primaryKey().unique(),
	govId: text('gov_id').unique(),
	status: text('status', { enum: ['active', 'terminated', 'expired', 'defaulted'] }).notNull(),
	start: integer('start_date', { mode: 'timestamp_ms' }).notNull(),
	end: integer('end_date', { mode: 'timestamp_ms' }).notNull(),
	interval: text('interval_in_months', { enum: ['1m', '3m', '6m', '12m'] }).notNull(),
	cost: real('cost_per_interval').notNull(),
	tenantId: integer('tenant_id').notNull()
});

export const payment = sqliteTable('payment', {
	id: integer('id').primaryKey().unique(),
	date: integer('date', { mode: 'timestamp_ms' }).notNull(),
	amount: real('amount').notNull(),
	contractId: integer('contract_id').notNull()
});

export const contractUnit = sqliteTable('contract_unit', {
	contractId: integer('contract_id').notNull(),
	unitId: integer('unit_id').notNull()
});

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
