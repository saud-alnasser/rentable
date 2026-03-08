import { relations } from 'drizzle-orm';
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import z from 'zod';
import { regex } from '../regex';

// tables

export const tenant = sqliteTable('tenant', {
	id: integer('id').primaryKey().unique(),
	nationalId: text('national_id').unique().notNull(),
	name: text('name').notNull(),
	phone: text('phone').unique().notNull()
});

export const TenantSchema = z.object({
	id: z.number(),
	name: z.string(),
	nationalId: z.string().regex(regex.iqama, 'iqama must start with 1 or 2; and be 10 digits long'),
	phone: z.string().regex(regex.phone, 'phone must start with +966; and be 10 digits long')
});

export type Tenant = z.infer<typeof TenantSchema>;

export const complex = sqliteTable('complex', {
	id: integer('id').primaryKey().unique(),
	name: text('name').unique().notNull(),
	location: text('location').notNull()
});

export const ComplexSchema = z.object({
	id: z.number(),
	name: z.string(),
	location: z.string()
});

export type Complex = z.infer<typeof ComplexSchema>;

export const unit = sqliteTable('unit', {
	id: integer('id').primaryKey().unique(),
	name: text('name').notNull(),
	status: text('status', { enum: ['occupied', 'vacant'] }).notNull(),
	complexId: integer('complex_id').notNull()
});

export const UnitSchema = z.object({
	id: z.number(),
	name: z.string(),
	status: z.enum(['occupied', 'vacant']),
	complexId: z.number()
});

export type Unit = z.infer<typeof UnitSchema>;

export const contract = sqliteTable('contract', {
	id: integer('id').primaryKey().unique(),
	govId: text('gov_id').unique(),
	status: text('status', {
		enum: ['scheduled', 'active', 'terminated', 'fulfilled', 'expired', 'defaulted']
	}).notNull(),
	start: integer('start_date', { mode: 'timestamp_ms' }).notNull(),
	end: integer('end_date', { mode: 'timestamp_ms' }).notNull(),
	interval: text('interval_in_months', { enum: ['1m', '3m', '6m', '12m'] }).notNull(),
	cost: real('cost_per_interval').notNull(),
	tenantId: integer('tenant_id').notNull()
});

export const ContractSchema = z.object({
	id: z.number(),
	govId: z.string().optional(),
	status: z.enum(['scheduled', 'active', 'terminated', 'fulfilled', 'expired', 'defaulted']),
	start: z.number(),
	end: z.number(),
	interval: z.enum(['1m', '3m', '6m', '12m']),
	cost: z.number(),
	tenantId: z.number()
});

export type Contract = z.infer<typeof ContractSchema>;

export const payment = sqliteTable('payment', {
	id: integer('id').primaryKey().unique(),
	date: integer('date', { mode: 'timestamp_ms' }).notNull(),
	amount: real('amount').notNull(),
	contractId: integer('contract_id').notNull()
});

export const PaymentSchema = z.object({
	id: z.number(),
	date: z.number(),
	amount: z.number(),
	contractId: z.number()
});

export type Payment = z.infer<typeof PaymentSchema>;

export const contractUnit = sqliteTable('contract_unit', {
	contractId: integer('contract_id').notNull(),
	unitId: integer('unit_id').notNull()
});

export const ContractUnitSchema = z.object({
	contractId: z.number(),
	unitId: z.number()
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
